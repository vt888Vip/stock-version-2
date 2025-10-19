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
  
  // ✅ KIỂM TRA IDEMPOTENCY TRƯỚC KHI ACQUIRE LOCK
  const sessionDoc = await mongoose.connection.db.collection('trading_sessions').findOne(
    { sessionId },
    { result: 1, status: 1, processingComplete: 1 }
  );

  if (!sessionDoc || !sessionDoc.result) {
    console.log(`❌ [SETTLEMENT] Session ${sessionId} không tồn tại hoặc chưa có kết quả`);
    return { success: false, error: 'Session not found or no result available' };
  }

  // ✅ KIỂM TRA IDEMPOTENCY TRƯỚC
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
    
    // Gửi socket events cho session đã xử lý
    console.log(`📡 [SETTLEMENT] Gửi socket events cho session đã xử lý...`);
    await sendSocketEventsAfterSettlement({
      success: true,
      sessionId,
      result: sessionDoc.result,
      totalTrades: completedSession?.totalTrades || 0,
      totalWins: completedSession?.totalWins || 0,
      totalLosses: completedSession?.totalLosses || 0,
      totalWinAmount: completedSession?.totalWinAmount || 0,
      totalLossAmount: completedSession?.totalLossAmount || 0,
      skipped: true,
      needsSocketEvents: true,
      completedSession
    });
    
    return { 
      success: true, 
      sessionId, 
      result: sessionDoc.result, 
      totalTrades: completedSession?.totalTrades || 0,
      totalWins: completedSession?.totalWins || 0,
      totalLosses: completedSession?.totalLosses || 0,
      totalWinAmount: completedSession?.totalWinAmount || 0,
      totalLossAmount: completedSession?.totalLossAmount || 0,
      skipped: true,
      message: 'Session already processed' 
    };
  }

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
      
      // 2. Xử lý settlement (idempotency đã được kiểm tra ở trên)
      
      const sessionResult = sessionDoc.result;
      console.log(`📊 [SETTLEMENT] Sử dụng kết quả: ${sessionResult} cho session ${sessionId}`);

      // 3. Lấy tất cả trades pending trong session TRƯỚC KHI cập nhật session status
      const pendingTrades = await mongoose.connection.db.collection('trades').find({ 
        sessionId, 
        status: 'pending'
      }).toArray();

      console.log(`📊 [SETTLEMENT] Tìm thấy ${pendingTrades.length} trades cần xử lý`);
      
      // ✅ Nếu không có trades, vẫn cập nhật session status
      if (pendingTrades.length === 0) {
        console.log(`📊 [SETTLEMENT] Không có trades để xử lý, chỉ cập nhật session status`);
        
        await mongoose.connection.db.collection('trading_sessions').updateOne(
          { sessionId },
          {
            $set: {
              status: 'COMPLETED',
              actualResult: sessionResult,
              processingComplete: false, // Chưa đánh dấu
              totalTrades: 0,
              totalWins: 0,
              totalLosses: 0,
              totalWinAmount: 0,
              totalLossAmount: 0,
              processingCompletedAt: new Date(),
              updatedAt: new Date()
            }
          },
          { session }
        );
        
        return {
          success: true,
          sessionId,
          result: sessionResult,
          totalTrades: 0,
          totalWins: 0,
          totalLosses: 0,
          totalWinAmount: 0,
          totalLossAmount: 0,
          needsSocketEvents: true,
          userTrades: [],
          completedSession: {
            totalTrades: 0,
            totalWins: 0,
            totalLosses: 0,
            totalWinAmount: 0,
            totalLossAmount: 0,
            result: sessionResult
          }
        };
      }
      
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

        // ✅ CHỈ CẬP NHẬT TRADE RECORD TRONG TRANSACTION
        // Balance update sẽ được thực hiện SAU KHI transaction commit

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

      // 5. Cập nhật session status thành COMPLETED (KHÔNG đánh dấu processingComplete)
      const sessionUpdateResult = await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId },
        {
          $set: {
            status: 'COMPLETED',
            actualResult: sessionResult,
            processingComplete: false,  // ← CHƯA ĐÁNH DẤU
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

      // ✅ CHỈ CẬP NHẬT DATABASE TRONG TRANSACTION
      // Socket events sẽ được gửi SAU KHI transaction commit
      
      return {
        success: true,
        sessionId,
        result: sessionResult,
        totalTrades: pendingTrades.length,
        totalWins,
        totalLosses,
        totalWinAmount,
        totalLossAmount,
        needsSocketEvents: true,
        userTrades: Array.from(userTrades.entries()).map(([userId, trades]) => ({
          userId,
          trades
        }))
      };
    });

    // ✅ CẬP NHẬT BALANCE SAU KHI TRANSACTION COMMIT
    if (result.success) {
      console.log(`💰 [SETTLEMENT] Cập nhật balance sau khi transaction commit...`);
      
      // Lấy lại pending trades để cập nhật balance
      const completedTrades = await mongoose.connection.db.collection('trades').find({
        sessionId: result.sessionId,
        status: 'completed'
      }).toArray();
      
      for (const trade of completedTrades) {
        const userId = trade.userId.toString();
        const amount = trade.amount;
        const direction = trade.direction || (trade.type === 'buy' ? 'UP' : 'DOWN');
        const userPrediction = direction;
        const isWin = userPrediction === result.result;
        const profit = isWin ? Math.floor(amount * 0.9) : -amount;
        
        if (isWin) {
          console.log(`💰 [SETTLEMENT] Cập nhật balance cho user ${userId}:`, {
            frozen: -amount,
            available: amount + profit,
            total: amount + profit
          });
          
          // ✅ DEBUG: Lấy balance trước khi update
          const beforeUpdate = await mongoose.connection.db.collection('users').findOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { projection: { balance: 1 } }
          );
          
          console.log(`💰 [SETTLEMENT] Balance trước update:`, {
            available: beforeUpdate?.balance?.available ?? 0,
            frozen: beforeUpdate?.balance?.frozen ?? 0
          });
          
          console.log(`💰 [SETTLEMENT] Sẽ cập nhật balance:`, {
            frozen: -amount,
            available: amount + profit,
            expectedAvailable: (beforeUpdate?.balance?.available ?? 0) + amount + profit,
            expectedFrozen: (beforeUpdate?.balance?.frozen ?? 0) - amount
          });
          
          const updateResult = await mongoose.connection.db.collection('users').updateOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            {
              $inc: { 
                'balance.frozen': -amount, 
                'balance.available': amount + profit 
              },
              $set: { updatedAt: new Date() }
            }
          );
          
          console.log(`💰 [SETTLEMENT] Balance update result:`, {
            matchedCount: updateResult.matchedCount,
            modifiedCount: updateResult.modifiedCount,
            acknowledged: updateResult.acknowledged
          });
          
          // ✅ DEBUG: Lấy balance sau khi update
          const afterUpdate = await mongoose.connection.db.collection('users').findOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { projection: { balance: 1 } }
          );
          
          console.log(`💰 [SETTLEMENT] Balance sau update:`, {
            available: afterUpdate?.balance?.available ?? 0,
            frozen: afterUpdate?.balance?.frozen ?? 0
          });
          
          console.log(`💰 [SETTLEMENT] Kiểm tra balance update:`, {
            availableChanged: (afterUpdate?.balance?.available ?? 0) !== (beforeUpdate?.balance?.available ?? 0),
            frozenChanged: (afterUpdate?.balance?.frozen ?? 0) !== (beforeUpdate?.balance?.frozen ?? 0),
            availableDiff: (afterUpdate?.balance?.available ?? 0) - (beforeUpdate?.balance?.available ?? 0),
            frozenDiff: (afterUpdate?.balance?.frozen ?? 0) - (beforeUpdate?.balance?.frozen ?? 0)
          });
        } else {
          await mongoose.connection.db.collection('users').updateOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            {
              $inc: { 'balance.frozen': -amount },
              $set: { updatedAt: new Date() }
            }
          );
        }
      }
    }

    // ✅ GỬI SOCKET EVENTS SAU KHI BALANCE UPDATE
    if (result.success && result.needsSocketEvents) {
      console.log(`📡 [SETTLEMENT] Gửi socket events sau khi balance update...`);
      
      // Gửi socket events cho từng user với balance mới
      for (const { userId, trades } of result.userTrades || []) {
        console.log(`📡 [SETTLEMENT] Gửi events cho user ${userId} với ${trades.length} trades`);
        
        // Gửi trades:batch:completed
        await sendSocketEvent(userId, 'trades:batch:completed', {
          sessionId: result.sessionId,
          trades: trades,
          totalTrades: trades.length,
          totalWins: trades.filter(t => t.result === 'win').length,
          totalLosses: trades.filter(t => t.result === 'lose').length,
          message: `Đã xử lý ${trades.length} trades cho session ${result.sessionId}`
        });
        
        // ✅ LẤY BALANCE MỚI SAU KHI UPDATE
        const userDoc = await mongoose.connection.db.collection('users').findOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          { projection: { balance: 1 } }
        );

        console.log(`💰 [SETTLEMENT] Gửi balance update cho user ${userId}:`, {
          available: userDoc?.balance?.available ?? 0,
          frozen: userDoc?.balance?.frozen ?? 0,
          tradeCount: trades.length
        });
        
        // ✅ VALIDATION: Đảm bảo balance data hợp lý
        const available = Math.max(0, userDoc?.balance?.available ?? 0);
        const frozen = Math.max(0, userDoc?.balance?.frozen ?? 0);
        
        // ✅ VALIDATION: Kiểm tra balance data trước khi gửi
        if (frozen < 0) {
          console.error(`❌ [SETTLEMENT] Frozen balance âm: ${frozen} - Không gửi socket event`);
          return;
        }
        
        await sendSocketEvent(userId, 'balance:updated', {
          userId,
          sessionId: result.sessionId,
          tradeCount: trades.length,
          message: `Balance đã được cập nhật sau settlement (${trades.length} trades)`,
          balance: {
            available,
            frozen
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
      
      // Gửi session:settlement:completed cho tất cả users
      console.log(`📡 [SETTLEMENT] Gửi session:settlement:completed event`);
      await sendSocketEvent('all', 'session:settlement:completed', {
        sessionId: result.sessionId,
        result: result.result,
        totals: {
          totalTrades: result.totalTrades,
          totalWins: result.totalWins,
          totalLosses: result.totalLosses,
          totalWinAmount: result.totalWinAmount,
          totalLossAmount: result.totalLossAmount
        },
        settledAt: new Date().toISOString()
      });
      
      // Đánh dấu processingComplete SAU KHI gửi socket events
      console.log(`✅ [SETTLEMENT] Đánh dấu processingComplete sau khi gửi socket events...`);
      await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId: result.sessionId },
        {
          $set: {
            processingComplete: true,
            processingCompletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      console.log(`✅ [SETTLEMENT] Đã đánh dấu processingComplete cho session ${result.sessionId}`);
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
    const { sessionId, result: sessionResult, completedSession, skipped } = result;
    
    console.log(`📡 [SETTLEMENT] Gửi socket events cho settlement đã hoàn thành...`);
    
    let userIds = [];
    let sessionTrades = [];
    
    if (skipped) {
      // Nếu session đã được xử lý trước, lấy tất cả trades trong session
      sessionTrades = await mongoose.connection.db.collection('trades').find({
        sessionId
      }).toArray();
      userIds = [...new Set(sessionTrades.map(trade => trade.userId.toString()))];
      console.log(`📡 [SETTLEMENT] Session đã xử lý trước - Tìm thấy ${userIds.length} users có trades trong session ${sessionId}`);
    } else {
      // Nếu session mới được xử lý, chỉ lấy trades completed
      sessionTrades = await mongoose.connection.db.collection('trades').find({
        sessionId,
        status: 'completed'
      }).toArray();
      userIds = [...new Set(sessionTrades.map(trade => trade.userId.toString()))];
      console.log(`📡 [SETTLEMENT] Session mới xử lý - Tìm thấy ${userIds.length} users có trades trong session ${sessionId}`);
    }
    
    // ✅ Nếu không có users, vẫn gửi broadcast event
    if (userIds.length === 0) {
      console.log(`📡 [SETTLEMENT] Không có users để gửi individual events, chỉ gửi broadcast...`);
      
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
      
      console.log(`📡 [SETTLEMENT] Broadcast event sent for session ${sessionId}`);
      return;
    }
    
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
      
      console.log(`💰 [SETTLEMENT] Gửi balance update cho user ${userId}:`, {
        available: userDoc?.balance?.available ?? 0,
        frozen: userDoc?.balance?.frozen ?? 0,
        tradeCount: userTrades.length
      });
      
      await sendSocketEvent(userId, 'balance:updated', {
        userId,
        sessionId,
        tradeCount: userTrades.length,
        message: `Balance đã được cập nhật sau settlement (${userTrades.length} trades)`,
        balance: {
          available: userDoc?.balance?.available ?? 0,
          frozen: userDoc?.balance?.frozen ?? 0
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
    
    // ✅ VALIDATION: Kiểm tra kết quả gửi event
    if (!result.success) {
      console.error(`❌ [SOCKET] Failed to send ${event} to user ${userId}`);
    }
    
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
