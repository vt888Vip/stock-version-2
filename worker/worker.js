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

// Configuration - RabbitMQ Local Open Source
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://trading_user:trading_password@localhost:5672';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://vincent:vincent79@cluster0.btgvgm.mongodb.net/finacial_platform';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_DB = parseInt(process.env.REDIS_DB || '0');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const TRADE_PROCESSING_QUEUE = 'trade-processing';
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || (process.env.NODE_ENV === 'production' 
  ? 'http://127.0.0.1:3001' 
  : 'http://localhost:3001');

let connection;
let channel;
let db;
let redisClient;

// Mongoose Models
const TradingSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED'], default: 'ACTIVE' },
  result: { type: String, enum: ['UP', 'DOWN'] },
  actualResult: { type: String, enum: ['UP', 'DOWN'] },
  processingComplete: { type: Boolean, default: false },
  processingStarted: { type: Boolean, default: false },
  processingStartedAt: { type: Date },
  createdBy: { type: String },
  totalTrades: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 },
  totalLosses: { type: Number, default: 0 },
  totalWinAmount: { type: Number, default: 0 },
  totalLossAmount: { type: Number, default: 0 },
  completedAt: { type: Date }
}, { timestamps: true });

const TradeSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  direction: { type: String, enum: ['UP', 'DOWN'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  result: { type: String, enum: ['win', 'lose'] },
  profit: { type: Number },
  appliedToBalance: { type: Boolean, default: false }
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  balance: {
    available: { type: Number, default: 0 },
    frozen: { type: Number, default: 0 }
  }
}, { timestamps: true });

const TradingSession = mongoose.model('TradingSession', TradingSessionSchema, 'trading_sessions');
const Trade = mongoose.model('Trade', TradeSchema, 'trades');
const User = mongoose.model('User', UserSchema, 'users');

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

    // Ensure indexes for idempotency and uniqueness (run once if missing)
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
 * Xóa và tạo lại queues
 */
async function resetQueues() {
  try {
    console.log('🧹 Đang xóa queues cũ...');
    await channel.deleteQueue(TRADE_PROCESSING_QUEUE);
    console.log('✅ Đã xóa queues cũ');
  } catch (error) {
    console.log('⚠️ Không thể xóa queues (có thể chưa tồn tại):', error.message);
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
    
    // Xóa và tạo lại queues để tránh xung đột
    await resetQueues();
    
    // Tạo queue trade-processing
    await channel.assertQueue(TRADE_PROCESSING_QUEUE, {
      durable: true,
      maxPriority: 10
    });

    console.log('✅ RabbitMQ connected và queues đã được tạo');
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
 * Redis Cache utilities
 */
async function getBalanceFromCache(userId) {
  try {
    const balanceKey = `user:${userId}:balance`;
    const balance = await redisClient.hGetAll(balanceKey);
    
    if (Object.keys(balance).length === 0) {
      return null;
    }
    
    return {
      available: parseInt(balance.available || '0'),
      frozen: parseInt(balance.frozen || '0')
    };
  } catch (error) {
    console.error(`❌ Failed to get balance from cache for user ${userId}:`, error);
    return null;
  }
}

async function setBalanceToCache(userId, balance) {
  try {
    const balanceKey = `user:${userId}:balance`;
    
    await redisClient.hSet(balanceKey, {
      available: balance.available.toString(),
      frozen: balance.frozen.toString(),
      updatedAt: new Date().toISOString()
    });
    
    // Set TTL to 1 hour
    await redisClient.expire(balanceKey, 3600);
  } catch (error) {
    console.error(`❌ Failed to set balance to cache for user ${userId}:`, error);
  }
}

async function updateBalanceInCache(userId, changes) {
  try {
    const balanceKey = `user:${userId}:balance`;
    
    const multi = redisClient.multi();
    
    if (changes.available !== undefined) {
      multi.hIncrBy(balanceKey, 'available', changes.available);
    }
    
    if (changes.frozen !== undefined) {
      multi.hIncrBy(balanceKey, 'frozen', changes.frozen);
    }
    
    multi.hSet(balanceKey, 'updatedAt', new Date().toISOString());
    multi.expire(balanceKey, 3600);
    
    await multi.exec();
  } catch (error) {
    console.error(`❌ Failed to update balance in cache for user ${userId}:`, error);
  }
}

async function isTradeProcessed(tradeId) {
  try {
    const tradeKey = `trade:${tradeId}:processed`;
    const exists = await redisClient.exists(tradeKey);
    return exists === 1;
  } catch (error) {
    console.error(`❌ Failed to check trade status ${tradeId}:`, error);
    return false;
  }
}

async function markTradeProcessed(tradeId, ttl = 3600) {
  try {
    const tradeKey = `trade:${tradeId}:processed`;
    await redisClient.set(tradeKey, 'true', { EX: ttl });
  } catch (error) {
    console.error(`❌ Failed to mark trade processed ${tradeId}:`, error);
  }
}


/**
 * Xử lý place trade trực tiếp với Redis lock
 */
async function processPlaceTradeDirect(tradeId, userId, sessionId, amount, type) {
  const session = await mongoose.startSession();
  
  try {
    return await session.withTransaction(async () => {
      // 1. Kiểm tra trade đã tồn tại chưa
      const existingTrade = await mongoose.connection.db.collection('trades').findOne({ tradeId });
      if (existingTrade) {
        throw new Error(`Trade already exists: ${tradeId}`);
      }

      // 2. Kiểm tra user balance và status
      const userResult = await mongoose.connection.db.collection('users').findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(userId),
          'balance.available': { $gte: amount },
          'status.active': true,
          'status.betLocked': { $ne: true }
        },
        {
          $inc: {
            'balance.available': -amount,
            'balance.frozen': amount
          },
          $set: {
            updatedAt: new Date()
          }
        },
        { 
          session, 
          returnDocument: 'after'
        }
      );
      
      if (!userResult) {
        throw new Error('Insufficient balance or user locked');
      }

      // 3. Tạo trade record
      const trade = {
        tradeId,
        userId: new mongoose.Types.ObjectId(userId),
        sessionId,
        amount,
        type,
        status: 'pending',
        createdAt: new Date(),
        retryCount: 0,
        direction: type === 'buy' ? 'UP' : 'DOWN',
        appliedToBalance: false
      };

      await mongoose.connection.db.collection('trades').insertOne(trade, { session });

      return {
        success: true,
        tradeId,
        balance: {
          available: userResult.balance.available,
          frozen: userResult.balance.frozen
        }
      };
    });
  } catch (error) {
    console.error(`❌ [PLACE-TRADE-DIRECT] Lỗi xử lý đặt lệnh ${tradeId}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý place trade (đặt lệnh) với Redis atomic operations
 */
async function processPlaceTrade(tradeData) {
  const { tradeId, userId, sessionId, amount, type } = tradeData;
  try {
    console.log(`📝 [PLACE-TRADE] Bắt đầu xử lý đặt lệnh: ${tradeData.tradeId}`);

    const lockKey = `user:${userId}:balance`;
    const lockAcquired = await acquireLock(lockKey, 30000);
    if (!lockAcquired) {
      console.log(`❌ [PLACE-TRADE] Không thể acquire lock cho user ${userId}`);
      return { success: false, error: 'User is being processed by another request' };
    }

    let result;
    try {
      result = await processPlaceTradeDirect(tradeId, userId, sessionId, amount, type);
    } finally {
      await releaseLock(lockKey);
    }

    if (result && result.success) {
      await sendSocketEvent(userId, 'trade:placed', {
        tradeId: result.tradeId,
        sessionId,
        direction: type === 'buy' ? 'UP' : 'DOWN',
        amount,
        type,
        status: 'pending',
        message: 'Lệnh đã được đặt thành công'
      });

      // ✅ THÊM: Gửi balance:updated event khi đặt lệnh
      await sendSocketEvent(userId, 'balance:updated', {
        userId,
        tradeId: result.tradeId,
        balance: result.balance,
        amount: -amount, // Số tiền bị trừ
        message: `Đã đặt lệnh ${amount.toLocaleString()} VND`
      });

      // ✅ THÊM: Gửi balance:updated event chỉ đến admin
      await sendSocketEvent('admin', 'balance:updated', {
        userId,
        tradeId: result.tradeId,
        balance: result.balance,
        amount: -amount, // Số tiền bị trừ
        message: `User ${userId} đã đặt lệnh ${amount.toLocaleString()} VND`
      });

      await sendSocketEvent(userId, 'trade:history:updated', {
        action: 'add',
        trade: {
          id: result.tradeId,
          tradeId: result.tradeId,
          sessionId,
          direction: type === 'buy' ? 'UP' : 'DOWN',
          amount,
          type,
          status: 'pending',
          result: null,
          profit: 0,
          createdAt: new Date().toISOString()
        },
        message: 'Lịch sử giao dịch đã được cập nhật'
      });

      console.log(`✅ [PLACE-TRADE] Đặt lệnh thành công: ${result.tradeId}`);
    } else if (result) {
      console.log(`❌ [PLACE-TRADE] Đặt lệnh thất bại: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error(`❌ [PLACE-TRADE] Lỗi xử lý đặt lệnh ${tradeData.tradeId}:`, error.message);
    return { success: false, error: error.message };
  }
}




// ✅ FIX: Sequence counter để tránh race condition
let sequenceCounter = 0;

// ✅ Tối ưu: Event batching để giảm số lượng requests cho VPS
const eventBatch = new Map();
const BATCH_DELAY = 100; // 100ms delay để batch events cho VPS
const MAX_BATCH_SIZE = 10; // Max events per batch

/**
 * Gửi Socket.IO event với batching
 */
async function sendSocketEvent(userId, event, data) {
  try {
    const sequence = ++sequenceCounter;
    const eventKey = `${userId}:${event}`;
    
    // ✅ BATCH: Thêm event vào batch thay vì gửi ngay
    if (!eventBatch.has(eventKey)) {
      eventBatch.set(eventKey, {
        userId,
        event,
        events: [],
        timeout: null
      });
    }
    
    const batch = eventBatch.get(eventKey);
    batch.events.push({
      ...data,
      sequence,
      timestamp: new Date().toISOString()
    });
    
    // ✅ Clear timeout cũ và set timeout mới
    if (batch.timeout) {
      clearTimeout(batch.timeout);
    }
    
    // ✅ Force flush nếu batch quá lớn
    if (batch.events.length >= MAX_BATCH_SIZE) {
      if (batch.timeout) {
        clearTimeout(batch.timeout);
      }
      await flushEventBatch(eventKey);
    } else {
      batch.timeout = setTimeout(async () => {
        await flushEventBatch(eventKey);
      }, BATCH_DELAY);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ [SOCKET] Error queuing event ${event}:`, error);
    return false;
  }
}

/**
 * Flush event batch
 */
async function flushEventBatch(eventKey) {
  try {
    const batch = eventBatch.get(eventKey);
    if (!batch || batch.events.length === 0) return;
    
    // ✅ Gửi batch events trong 1 request
    const response = await fetch(`${SOCKET_SERVER_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: batch.userId,
        event: batch.event,
        data: {
          batch: true,
          events: batch.events,
          count: batch.events.length
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    // ✅ Log batch events
    console.log(`📡 [SOCKET] Batch sent: ${batch.event} to user ${batch.userId} (${batch.events.length} events)`, result);
    
    // ✅ Clear batch
    eventBatch.delete(eventKey);
    
    return result.success;
  } catch (error) {
    console.error(`❌ [SOCKET] Error flushing batch ${eventKey}:`, error);
    return false;
  }
}

/**
 * Khởi động worker
 */
async function startWorker() {
  try {
    const workerId = process.env.WORKER_ID || '1';
    const workerNumber = process.env.WORKER_NUMBER || '1';
    console.log(`🚀 Khởi động Trade Worker ${workerNumber} (ID: ${workerId})...`);
    
    // Kết nối databases
    await connectMongoDB();
    await connectRedis();
    await connectRabbitMQ();
    
    // ✅ TĂNG PREFETCH CHO MULTIPLE WORKERS
    const prefetchCount = parseInt(process.env.WORKER_PREFETCH || '10');
    await channel.prefetch(prefetchCount);
    console.log(`📊 Worker ${workerId} prefetch set to: ${prefetchCount}`);
    
    console.log(`✅ Worker ${workerNumber} đã sẵn sàng xử lý messages (PID: ${process.pid})`);
    
    // Consumer cho trade-processing queue
    channel.consume(TRADE_PROCESSING_QUEUE, async (msg) => {
      if (!msg) return;
      
      try {
        const tradeData = JSON.parse(msg.content.toString());
        console.log(`📥 [TRADE] Nhận trade message:`, {
          tradeId: tradeData.tradeId,
          userId: tradeData.userId,
          sessionId: tradeData.sessionId,
          amount: tradeData.amount,
          type: tradeData.type,
          action: tradeData.action
        });
        
                 // Chỉ xử lý place-trade
         if (tradeData.action === 'place-trade') {
           console.log(`📝 [TRADE] Xử lý place-trade cho trade: ${tradeData.tradeId}`);
           const result = await processPlaceTrade(tradeData);
           
           if (result.success) {
             console.log(`✅ [TRADE] Place-trade thành công:`, {
               tradeId: result.tradeId,
               balance: result.balance
             });
           } else {
             console.error(`❌ [TRADE] Place-trade thất bại: ${tradeData.tradeId} - ${result.error}`);
           }
         } else {
           console.error(`❌ [TRADE] Action không hợp lệ: ${tradeData.action}`);
         }
        
        channel.ack(msg);
        console.log(`✅ [TRADE] Đã acknowledge message: ${tradeData.tradeId}`);
      } catch (error) {
        console.error(`❌ [TRADE] Lỗi xử lý message:`, error);
        channel.ack(msg); // Acknowledge để tránh loop
      }
    });
    
    
    console.log(`🎉 Worker ${workerId} đã khởi động thành công!`);
    console.log('📋 Đang lắng nghe:');
    console.log(`   - Trade processing queue: ${TRADE_PROCESSING_QUEUE}`);
    
  } catch (error) {
    console.error('❌ Lỗi khởi động worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Đang tắt worker...');
  
  if (channel) {
    await channel.close();
  }
  
  if (connection) {
    await connection.close();
  }
  
  if (redisClient) {
    await redisClient.disconnect();
  }
  
  console.log('✅ Worker đã tắt');
  process.exit(0);
});

// ✅ GRACEFUL SHUTDOWN HANDLERS
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⚠️ Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  const workerNumber = process.env.WORKER_NUMBER || '1';
  console.log(`\n🛑 Worker ${workerNumber} nhận signal ${signal}, đang tắt gracefully...`);
  
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
    
    console.log('✅ Worker đã tắt gracefully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi trong quá trình shutdown:', error);
    process.exit(1);
  }
}

// ✅ SIGNAL HANDLERS
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// ✅ UNCAUGHT EXCEPTION HANDLERS
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ✅ HEALTH CHECK
setInterval(() => {
  if (!isShuttingDown) {
    const workerNumber = process.env.WORKER_NUMBER || '1';
    console.log(`💓 Worker ${workerNumber} health check - PID: ${process.pid}, Uptime: ${Math.floor(process.uptime())}s`);
  }
}, 60000); // Mỗi 1 phút

// Start worker
startWorker();
