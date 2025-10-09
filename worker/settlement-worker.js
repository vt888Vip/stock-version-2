#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

import amqp from 'amqplib';
import mongoose from 'mongoose';
import fetch from 'node-fetch';
import { createClient } from 'redis';

// Load environment from .env.local for standalone Node worker
(() => {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`📦 Loaded environment from .env.local`);
  }
})();

// Configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://trading_user:trading_password@localhost:5672';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://vincent:vincent79@cluster0.btgvgm.mongodb.net/finacial_platform';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_DB = parseInt(process.env.REDIS_DB || '0');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const SETTLEMENTS_QUEUE = 'settlements';
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || (process.env.NODE_ENV === 'production' 
  ? 'http://127.0.0.1:3001' 
  : 'http://localhost:3001');

let connection;
let channel;
let redisClient;

/**
 * Kết nối Redis
 */
async function connectRedis() {
  try {
    console.log('🔌 Kết nối Redis...');
    console.log('🔧 Redis config:', {
      url: REDIS_URL,
      host: REDIS_HOST,
      port: REDIS_PORT,
      db: REDIS_DB,
      password: REDIS_PASSWORD ? '*** set ***' : '(none)'
    });
    
    redisClient = createClient({
      url: REDIS_URL,
      socket: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        reconnectStrategy: (retries) => {
          const delay = Math.min(1000 * Math.pow(2, retries), 15000);
          return delay;
        },
        connectTimeout: 10000,
        keepAlive: 1,
      },
      password: REDIS_PASSWORD,
      database: REDIS_DB,
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redisClient.on('disconnect', () => {
      console.log('🔌 Redis disconnected');
    });
    redisClient.on('reconnecting', () => {
      console.log('⏳ Redis reconnecting...');
    });

    await redisClient.connect();
    console.log('✅ Redis connection established');
    return redisClient;
  } catch (error) {
    console.error('❌ Lỗi kết nối Redis:', error);
    throw error;
  }
}

/**
 * Kết nối MongoDB với Mongoose
 */
async function connectMongoDB() {
  try {
    console.log('🔌 Kết nối MongoDB với Mongoose...');
    
    if (mongoose.connection.readyState === 1) {
      console.log('✅ MongoDB đã được kết nối');
      return mongoose.connection;
    }
    
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ MongoDB connected với Mongoose');

    // Ensure indexes for idempotency and uniqueness
    try {
      await mongoose.connection.db.collection('trades').createIndex({ tradeId: 1 }, { unique: true, name: 'uniq_tradeId' });
      await mongoose.connection.db.collection('trading_sessions').createIndex({ sessionId: 1 }, { unique: true, name: 'uniq_sessionId' });
      console.log('✅ Ensured unique indexes for trades.tradeId and trading_sessions.sessionId');
    } catch (idxErr) {
      console.warn('⚠️ Index ensure warning:', idxErr?.message || idxErr);
    }
    return mongoose.connection;
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    throw error;
  }
}

/**
 * Kết nối RabbitMQ
 */
async function connectRabbitMQ() {
  try {
    console.log('🔌 Kết nối RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    
    connection.on('error', (error) => {
      console.error('❌ RabbitMQ connection error:', error);
    });

    connection.on('close', () => {
      console.log('🔌 RabbitMQ connection closed');
    });

    channel = await connection.createChannel();
    
    // Tạo queue settlements
    await channel.assertQueue(SETTLEMENTS_QUEUE, {
      durable: true,
      maxPriority: 10
    });

    console.log('✅ RabbitMQ connected và settlements queue đã được tạo');
    return { connection, channel };
  } catch (error) {
    console.error('❌ Lỗi kết nối RabbitMQ:', error);
    throw error;
  }
}

/**
 * Redis Lock utilities
 */
const lockOwners = new Map();

async function acquireLock(key, ttl = 30000) {
  try {
    const lockKey = `lock:${key}`;
    const lockValue = `${Date.now()}-${Math.random()}`;
    console.log(`🔐 [LOCK] Trying acquire: key=${lockKey} ttl=${ttl}ms`);
    const result = await redisClient.set(lockKey, lockValue, {
      PX: ttl,
      NX: true
    });
    const acquired = result === 'OK';
    if (acquired) {
      console.log(`✅ [LOCK] Acquired: key=${lockKey}`);
      lockOwners.set(lockKey, lockValue);
    } else {
      console.log(`⛔ [LOCK] Busy (not acquired): key=${lockKey}`);
    }
    return acquired;
  } catch (error) {
    console.error(`❌ Failed to acquire lock ${key}:`, error);
    return false;
  }
}

async function releaseLock(key) {
  try {
    const lockKey = `lock:${key}`;
    console.log(`🔓 [LOCK] Releasing: key=${lockKey}`);
    const owner = lockOwners.get(lockKey);
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      else
        return 0
      end
    `;
    const result = await redisClient.eval(script, { keys: [lockKey], arguments: [owner || ''] });
    const released = Number(result) > 0;
    if (released) {
      console.log(`✅ [LOCK] Released: key=${lockKey}`);
      lockOwners.delete(lockKey);
    } else {
      console.log(`⚠️ [LOCK] Not held (nothing to release): key=${lockKey}`);
    }
    return released;
  } catch (error) {
    console.error(`❌ Failed to release lock ${key}:`, error);
    return false;
  }
}

/**
 * Xử lý settlement chính
 */
async function processSettlement(settlementData) {
  const { sessionId } = settlementData;
  
  // Redis lock cho settlement để tránh race condition
  const settlementLockKey = `settlement:${sessionId}`;
  const lockAcquired = await acquireLock(settlementLockKey, 120000); // 2 phút timeout
  
  if (!lockAcquired) {
    console.log(`❌ [SETTLEMENT] Không thể acquire lock cho session ${sessionId}`);
    return { success: false, error: 'Settlement is being processed by another worker' };
  }
  
  const session = await mongoose.startSession();
  
  try {
    console.log(`🔄 [SETTLEMENT] Bắt đầu xử lý settlement: ${settlementData.id}`);
    
    const result = await session.withTransaction(async () => {
      // 1. Lấy session info và kết quả
      const sessionDoc = await mongoose.connection.db.collection('trading_sessions').findOne(
        { sessionId },
        { result: 1, status: 1, processingComplete: 1 }
      );
      
      if (!sessionDoc || !sessionDoc.result) {
        throw new Error('Session not found or no result available');
      }
      
      // 2. Kiểm tra settlement đã được xử lý chưa (Idempotency check)
      if (sessionDoc.processingComplete === true) {
        console.log(`⏭️ [SETTLEMENT] Session ${sessionId} đã được xử lý settlement, gửi socket events...`);
        
        // Lấy thống kê từ session đã xử lý
        const completedSession = await mongoose.connection.db.collection('trading_sessions').findOne(
          { sessionId },
          { 
            totalTrades: 1, 
            totalWins: 1, 
            totalLosses: 1, 
            totalWinAmount: 1, 
            totalLossAmount: 1 
          }
        );
        
        console.log(`📊 [SETTLEMENT] Thống kê từ database:`, {
          totalTrades: completedSession?.totalTrades || 0,
          totalWins: completedSession?.totalWins || 0,
          totalLosses: completedSession?.totalLosses || 0
        });
        
        // Lưu thông tin để gửi socket events sau khi transaction commit
        const socketEventsData = {
          sessionId,
          result: sessionDoc.result,
          completedSession,
          needsSocketEvents: true
        };
        
        return {
          success: true,
          sessionId,
          result: sessionDoc.result,
          totalTrades: completedSession?.totalTrades || 0,
          totalWins: completedSession?.totalWins || 0,
          totalLosses: completedSession?.totalLosses || 0,
          skipped: true,
          needsSocketEvents: true,
          completedSession
        };
      }
      
      const sessionResult = sessionDoc.result;
      console.log(`📊 [SETTLEMENT] Sử dụng kết quả: ${sessionResult} cho session ${sessionId}`);

      // 3. Lấy tất cả trades pending trong session TRƯỚC KHI cập nhật session status
      const pendingTrades = await mongoose.connection.db.collection('trades').find({ 
        sessionId, 
        status: 'pending'
      }).toArray();

      console.log(`📊 [SETTLEMENT] Tìm thấy ${pendingTrades.length} trades cần xử lý`);
      
      // Debug: Log tất cả trades trong session
      const allTrades = await mongoose.connection.db.collection('trades').find({ 
        sessionId 
      }).toArray();
      
      console.log(`📊 [SETTLEMENT] Debug - Tất cả trades trong session ${sessionId}:`, 
        allTrades.map(t => ({
          tradeId: t.tradeId,
          status: t.status,
          appliedToBalance: t.appliedToBalance,
          direction: t.direction,
          amount: t.amount
        }))
      );

      let totalWins = 0;
      let totalLosses = 0;
      let totalWinAmount = 0;
      let totalLossAmount = 0;
      const userTrades = new Map();

      // 4. Xử lý từng trade
      for (const trade of pendingTrades) {
        const userId = trade.userId.toString();
        const amount = trade.amount;
        const direction = trade.direction || (trade.type === 'buy' ? 'UP' : 'DOWN');
        
        // Tính kết quả
        const userPrediction = direction;
        const isWin = userPrediction === sessionResult;
        const profit = isWin ? Math.floor(amount * 0.9) : -amount;

        console.log(`🎯 [SETTLEMENT] Trade ${trade.tradeId}: ${direction} vs ${sessionResult} = ${isWin ? 'WIN' : 'LOSE'} (${profit} VND)`);

        // Cập nhật balance user
        if (isWin) {
          await mongoose.connection.db.collection('users').updateOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            {
              $inc: { 
                'balance.frozen': -amount, 
                'balance.available': amount + profit 
              },
              $set: { updatedAt: new Date() }
            },
            { session }
          );
        } else {
          await mongoose.connection.db.collection('users').updateOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            {
              $inc: { 'balance.frozen': -amount },
              $set: { updatedAt: new Date() }
            },
            { session }
          );
        }

        // Cập nhật trade record
        await mongoose.connection.db.collection('trades').updateOne(
          { _id: trade._id },
          {
            $set: {
              status: 'completed',
              processedAt: new Date(),
              profit: profit,
              appliedToBalance: true,
              result: { isWin, profit, sessionResult, processedAt: new Date() }
            }
          },
          { session }
        );

        // Cập nhật thống kê
        if (isWin) {
          totalWins++;
          totalWinAmount += amount;
        } else {
          totalLosses++;
          totalLossAmount += amount;
        }

        // Group trades by user để gửi events
        if (!userTrades.has(userId)) {
          userTrades.set(userId, []);
        }
        
        userTrades.get(userId).push({
          tradeId: trade.tradeId,
          sessionId,
          result: isWin ? 'win' : 'lose',
          profit: profit,
          amount: amount,
          direction: direction,
          status: 'completed',
          createdAt: trade.createdAt
        });
      }

      // 5. Cập nhật session status thành COMPLETED (sau khi xử lý trades)
      const sessionUpdateResult = await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId },
        {
          $set: {
            status: 'COMPLETED',
            actualResult: sessionResult,
            processingComplete: true,
            totalTrades: pendingTrades.length,
            totalWins: totalWins,
            totalLosses: totalLosses,
            totalWinAmount: totalWinAmount,
            totalLossAmount: totalLossAmount,
            processingCompletedAt: new Date(),
            updatedAt: new Date()
          }
        },
        { session }
      );

      if (sessionUpdateResult.modifiedCount === 0) {
        throw new Error('Session not found or already completed');
      }

      console.log(`✅ [SETTLEMENT] Xử lý settlement thành công: ${settlementData.id}`);
      console.log(`📊 [SETTLEMENT] Thống kê: ${pendingTrades.length} trades, ${totalWins} wins, ${totalLosses} losses`);

      // 6. Gửi socket events cho từng user
      console.log(`📡 [SETTLEMENT] Gửi socket events cho ${userTrades.size} users`);
      
      // Nếu không có trades, vẫn gửi settlement completed event
      if (userTrades.size === 0) {
        console.log(`📡 [SETTLEMENT] Không có trades để gửi socket events, chỉ gửi settlement completed`);
      }
      
      for (const [userId, trades] of userTrades) {
        console.log(`📡 [SETTLEMENT] Gửi events cho user ${userId} với ${trades.length} trades`);
        // Gửi batch events
        await sendSocketEvent(userId, 'trades:batch:completed', {
          sessionId,
          trades: trades,
          totalTrades: trades.length,
          totalWins: trades.filter(t => t.result === 'win').length,
          totalLosses: trades.filter(t => t.result === 'lose').length,
          message: `Đã xử lý ${trades.length} trades cho session ${sessionId}`
        });
        
        // Gửi balance update
        const userDoc = await mongoose.connection.db.collection('users').findOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          { projection: { balance: 1 } }
        );

        await sendSocketEvent(userId, 'balance:updated', {
          userId,
          sessionId,
          tradeCount: trades.length,
          message: `Balance đã được cập nhật sau settlement (${trades.length} trades)`,
          balance: {
            available: userDoc?.balance?.available ?? null,
            frozen: userDoc?.balance?.frozen ?? null
          }
        });
        
        // Gửi trade history update cho từng trade
        for (const trade of trades) {
          await sendSocketEvent(userId, 'trade:history:updated', {
            action: 'update',
            trade: {
              id: trade.tradeId,
              tradeId: trade.tradeId,
              sessionId: trade.sessionId,
              direction: trade.direction,
              amount: trade.amount,
              status: trade.status,
              result: trade.result,
              profit: trade.profit,
              createdAt: trade.createdAt
            }
          });
        }
      }

      // 7. Broadcast settlement completed to all users
      console.log(`📡 [SETTLEMENT] Gửi session:settlement:completed event`);
      const settlementCompletedResult = await sendSocketEvent('all', 'session:settlement:completed', {
        sessionId,
        result: sessionResult,
        totals: {
          totalTrades: pendingTrades.length,
          totalWins,
          totalLosses,
          totalWinAmount,
          totalLossAmount
        },
        settledAt: new Date().toISOString()
      });
      
      console.log(`📡 [SETTLEMENT] Session settlement completed event sent: ${settlementCompletedResult ? 'SUCCESS' : 'FAILED'}`);
      
      return {
        success: true,
        sessionId,
        result: sessionResult,
        totalTrades: pendingTrades.length,
        totalWins,
        totalLosses,
        totalWinAmount,
        totalLossAmount
      };
    });

    // Gửi socket events SAU KHI transaction commit thành công
    if (result.success && result.needsSocketEvents) {
      console.log(`📡 [SETTLEMENT] Gửi socket events sau khi transaction commit...`);
      await sendSocketEventsAfterSettlement(result);
    }

    return result;
  } catch (error) {
    console.error(`❌ [SETTLEMENT] Lỗi xử lý settlement ${settlementData.id}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await session.endSession();
    await releaseLock(settlementLockKey);
  }
}

/**
 * Gửi socket events sau khi settlement hoàn thành
 */
async function sendSocketEventsAfterSettlement(result) {
  try {
    const { sessionId, result: sessionResult, completedSession } = result;
    
    console.log(`📡 [SETTLEMENT] Gửi socket events cho settlement đã hoàn thành...`);
    
    // Lấy danh sách users có trades trong session này
    const sessionTrades = await mongoose.connection.db.collection('trades').find({
      sessionId,
      status: 'completed'
    }).toArray();
    
    const userIds = [...new Set(sessionTrades.map(trade => trade.userId.toString()))];
    console.log(`📡 [SETTLEMENT] Tìm thấy ${userIds.length} users có trades trong session ${sessionId}`);
    
    // Gửi socket events cho từng user riêng biệt
    for (const userId of userIds) {
      const userTrades = sessionTrades.filter(trade => trade.userId.toString() === userId);
      const userWins = userTrades.filter(trade => trade.result?.isWin === true).length;
      const userLosses = userTrades.filter(trade => trade.result?.isWin === false).length;
      
      console.log(`📡 [SETTLEMENT] Gửi events cho user ${userId} với ${userTrades.length} trades`);
      
      // Gửi trades:batch:completed
      await sendSocketEvent(userId, 'trades:batch:completed', {
        sessionId,
        trades: userTrades.map(trade => ({
          tradeId: trade.tradeId,
          sessionId: trade.sessionId,
          result: trade.result?.isWin ? 'win' : 'lose',
          profit: trade.profit,
          amount: trade.amount,
          direction: trade.direction,
          status: 'completed',
          createdAt: trade.createdAt
        })),
        totalTrades: userTrades.length,
        totalWins: userWins,
        totalLosses: userLosses,
        message: `Đã xử lý ${userTrades.length} trades cho session ${sessionId}`
      });
      
      // Gửi balance:updated
      const userDoc = await mongoose.connection.db.collection('users').findOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { projection: { balance: 1 } }
      );
      
      await sendSocketEvent(userId, 'balance:updated', {
        userId,
        sessionId,
        tradeCount: userTrades.length,
        message: `Balance đã được cập nhật sau settlement (${userTrades.length} trades)`,
        balance: {
          available: userDoc?.balance?.available ?? null,
          frozen: userDoc?.balance?.frozen ?? null
        }
      });
      
      // Gửi trade:history:updated cho từng trade
      for (const trade of userTrades) {
        await sendSocketEvent(userId, 'trade:history:updated', {
          action: 'update',
          trade: {
            id: trade.tradeId,
            tradeId: trade.tradeId,
            sessionId: trade.sessionId,
            direction: trade.direction,
            amount: trade.amount,
            status: trade.status,
            result: trade.result?.isWin ? 'win' : 'lose',
            profit: trade.profit,
            createdAt: trade.createdAt
          }
        });
      }
    }
    
    // Gửi session:settlement:completed cho tất cả users (broadcast)
    await sendSocketEvent('all', 'session:settlement:completed', {
      sessionId,
      result: sessionResult,
      totals: {
        totalTrades: completedSession?.totalTrades || 0,
        totalWins: completedSession?.totalWins || 0,
        totalLosses: completedSession?.totalLosses || 0,
        totalWinAmount: completedSession?.totalWinAmount || 0,
        totalLossAmount: completedSession?.totalLossAmount || 0
      },
      settledAt: new Date().toISOString(),
      message: `Settlement completed for session ${sessionId} - ${completedSession?.totalTrades || 0} trades processed`
    });
    
    console.log(`📡 [SETTLEMENT] Socket events sent for completed settlement to ${userIds.length} users`);
    
  } catch (error) {
    console.error(`❌ [SETTLEMENT] Lỗi gửi socket events:`, error);
  }
}

/**
 * Gửi Socket.IO event
 */
async function sendSocketEvent(userId, event, data) {
  try {
    const response = await fetch(`${SOCKET_SERVER_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        event,
        data: {
          ...data,
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log(`📡 [SOCKET] Sent ${event} to user ${userId}:`, result.success ? 'SUCCESS' : 'FAILED');
    return result.success;
  } catch (error) {
    console.error(`❌ [SOCKET] Error sending ${event} to user ${userId}:`, error);
    return false;
  }
}

/**
 * Khởi động settlement worker
 */
async function startSettlementWorker() {
  try {
    const workerId = process.env.WORKER_ID || 'settlement-1';
    console.log(`🚀 Khởi động Settlement Worker (ID: ${workerId})...`);
    
    // Kết nối databases
    await connectMongoDB();
    await connectRedis();
    await connectRabbitMQ();
    
    console.log(`✅ Settlement Worker đã sẵn sàng xử lý messages (PID: ${process.pid})`);
    
    // Consumer cho settlements queue
    channel.consume(SETTLEMENTS_QUEUE, async (msg) => {
      if (!msg) return;
      
      try {
        const settlementData = JSON.parse(msg.content.toString());
        console.log(`📥 [SETTLEMENTS] Nhận settlement message:`, {
          id: settlementData.id,
          sessionId: settlementData.sessionId,
          result: settlementData.result,
          timestamp: settlementData.timestamp
        });
        
        console.log(`🔄 [SETTLEMENTS] Bắt đầu xử lý settlement: ${settlementData.sessionId}`);
        
        const result = await processSettlement(settlementData);
        
        if (result.success) {
          console.log(`✅ [SETTLEMENTS] Xử lý settlement thành công:`, {
            sessionId: result.sessionId,
            result: result.result,
            totalTrades: result.totalTrades,
            totalWins: result.totalWins,
            totalLosses: result.totalLosses
          });
        } else {
          console.error(`❌ [SETTLEMENTS] Xử lý settlement thất bại: ${settlementData.id} - ${result.error}`);
        }
        
        channel.ack(msg);
        console.log(`✅ [SETTLEMENTS] Đã acknowledge message: ${settlementData.id}`);
      } catch (error) {
        console.error(`❌ [SETTLEMENTS] Lỗi xử lý message:`, error);
        channel.ack(msg); // Acknowledge để tránh loop
      }
    });
    
    console.log(`🎉 Settlement Worker đã khởi động thành công!`);
    console.log('📋 Đang lắng nghe:');
    console.log(`   - Settlements queue: ${SETTLEMENTS_QUEUE}`);
    
  } catch (error) {
    console.error('❌ Lỗi khởi động settlement worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Đang tắt settlement worker...');
  
  if (channel) {
    await channel.close();
  }
  
  if (connection) {
    await connection.close();
  }
  
  if (redisClient) {
    await redisClient.disconnect();
  }
  
  console.log('✅ Settlement worker đã tắt');
  process.exit(0);
});

// Graceful shutdown handlers
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⚠️ Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n🛑 Settlement Worker nhận signal ${signal}, đang tắt gracefully...`);
  
  try {
    // Close RabbitMQ connections
    if (channel) {
      console.log('🔄 Đang đóng RabbitMQ channel...');
      await channel.close();
    }
    
    if (connection) {
      console.log('🔄 Đang đóng RabbitMQ connection...');
      await connection.close();
    }
    
    // Close Redis connection
    if (redisClient) {
      console.log('🔄 Đang đóng Redis connection...');
      await redisClient.disconnect();
    }
    
    // Close MongoDB connection
    if (mongoose.connection.readyState === 1) {
      console.log('🔄 Đang đóng MongoDB connection...');
      await mongoose.connection.close();
    }
    
    console.log('✅ Settlement Worker đã tắt gracefully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi trong quá trình shutdown:', error);
    process.exit(1);
  }
}

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Uncaught exception handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Health check
setInterval(() => {
  if (!isShuttingDown) {
    console.log(`💓 Settlement Worker health check - PID: ${process.pid}, Uptime: ${Math.floor(process.uptime())}s`);
  }
}, 60000); // Mỗi 1 phút

// Start settlement worker
startSettlementWorker();
