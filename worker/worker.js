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
const SETTLEMENTS_QUEUE = 'settlements';
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
    await channel.deleteQueue(SETTLEMENTS_QUEUE);
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
    
    // Tạo queue settlements
    await channel.assertQueue(SETTLEMENTS_QUEUE, {
      durable: true,
      maxPriority: 10
    });

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

async function getSessionResultFromCache(sessionId) {
  try {
    const sessionKey = `session:${sessionId}:result`;
    return await redisClient.get(sessionKey);
  } catch (error) {
    console.error(`❌ Failed to get session result from cache ${sessionId}:`, error);
    return null;
  }
}

async function setSessionResultToCache(sessionId, result, ttl = 7200) {
  try {
    const sessionKey = `session:${sessionId}:result`;
    await redisClient.set(sessionKey, result, { EX: ttl });
  } catch (error) {
    console.error(`❌ Failed to set session result to cache ${sessionId}:`, error);
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

/**
 * Xử lý check result trực tiếp (không qua queue) cho một trade
 */
async function processCheckResultDirect(tradeId, userId, sessionId, amount, type) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      // 1) Lấy trade
      const trade = await mongoose.connection.db.collection('trades').findOne({ tradeId });
      if (!trade) {
        throw new Error(`Trade not found: ${tradeId}`);
      }

      // Nếu đã completed/failed thì trả sớm
      if (trade.status === 'completed' || trade.status === 'failed') {
        return { success: true, tradeId, message: 'Trade already processed', isWin: trade.result?.isWin ?? null, profit: trade.profit ?? 0, sessionResult: trade.result?.sessionResult ?? null };
      }

      // 2) Đặt status processing
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId },
        { $set: { status: 'processing', updatedAt: new Date() } },
        { session }
      );

      // 3) Lấy session result
      const sessionDoc = await mongoose.connection.db.collection('trading_sessions').findOne(
        { sessionId },
        { result: 1 }
      );
      if (!sessionDoc || !sessionDoc.result) {
        throw new Error(`Session result not available: ${sessionId}`);
      }
      const sessionResult = sessionDoc.result;

      // 4) Tính kết quả
      const userPrediction = type === 'buy' ? 'UP' : 'DOWN';
      const isWin = userPrediction === sessionResult;
      const profit = isWin ? Math.floor(amount * 0.9) : -amount;

      // 5) Cập nhật balance
      if (isWin) {
        await mongoose.connection.db.collection('users').updateOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          {
            $inc: { 'balance.frozen': -amount, 'balance.available': amount + profit },
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

      // 6) Cập nhật trade
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId },
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

      // 7) Cập nhật thống kê session
      await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId },
        {
          $inc: {
            totalTrades: 1,
            totalWins: isWin ? 1 : 0,
            totalLosses: isWin ? 0 : 1,
            totalWinAmount: isWin ? amount : 0,
            totalLossAmount: isWin ? 0 : amount
          }
        },
        { session }
      );

      return { success: true, tradeId, isWin, profit, sessionResult };
    });
  } catch (error) {
    console.error(`❌ [CHECK-RESULT-DIRECT] Lỗi:`, error.message);
    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý check result (kiểm tra kết quả) với Redis atomic operations
 */
async function processCheckResult(tradeData) {
  const { tradeId, userId, sessionId, amount, type } = tradeData;
  
  try {
    console.log(`🔍 [CHECK-RESULT] Bắt đầu xử lý check result: ${tradeData.tradeId}`);
    
    // Idempotency: skip if already processed
    const processedKey = `trade:${tradeId}:processed`;
    const alreadyProcessed = await redisClient.exists(processedKey);
    if (alreadyProcessed === 1) {
      console.log(`✅ [CHECK-RESULT] Already processed, skipping: ${tradeId}`);
      return { success: true, message: 'Already processed' };
    }

    // Sử dụng Redis lock trực tiếp
    const lockKey = `trade:${tradeId}:processing`;
    const lockAcquired = await acquireLock(lockKey, 30000);
    
    if (!lockAcquired) {
      console.log(`❌ [CHECK-RESULT] Không thể acquire lock cho trade ${tradeId}`);
      return {
        success: false,
        error: 'Trade is being processed by another request'
      };
    }
    
    let result;
    try {
      result = await processCheckResultDirect(tradeId, userId, sessionId, amount, type);
    } finally {
      await releaseLock(lockKey);
    }
    
    if (result && result.success) {
      // Mark idempotency flag with TTL (1h)
      await redisClient.set(processedKey, 'true', { EX: 3600 });
      // Gửi Socket.IO events
      await sendSocketEvent(userId, 'trade:completed', {
        tradeId,
        sessionId,
        result: result.isWin ? 'win' : 'lose',
        profit: result.profit,
        amount: amount,
        direction: type === 'buy' ? 'UP' : 'DOWN',
        message: result.isWin ? '🎉 Thắng!' : '😔 Thua'
      });

      const balanceEventResult = await sendSocketEvent(userId, 'balance:updated', {
        tradeId,
        profit: result.profit,
        amount: amount,
        result: result.isWin ? 'win' : 'lose',
        message: `Balance đã được cập nhật: ${result.isWin ? '+' : ''}${result.profit} VND`
      });
      
      if (!balanceEventResult) {
        console.error(`❌ [CHECK-RESULT] Failed to send balance:updated event for trade ${tradeId}`);
      }

      await sendSocketEvent(userId, 'trade:history:updated', {
        action: 'update',
        trade: {
          id: tradeId,
          tradeId: tradeId,
          sessionId,
          direction: type === 'buy' ? 'UP' : 'DOWN',
          amount: amount,
          status: 'completed',
          result: result.isWin ? 'win' : 'lose',
          profit: result.profit,
          createdAt: new Date().toISOString()
        },
        message: 'Lịch sử giao dịch đã được cập nhật'
      });

      console.log(`✅ [CHECK-RESULT] Check result thành công:`, {
        tradeId,
        isWin: result.isWin,
        profit: result.profit,
        sessionResult: result.sessionResult
      });
    } else if (result) {
      console.log(`❌ [CHECK-RESULT] Check result thất bại: ${result.error}`);
      
      // Cập nhật trade status thành failed
      try {
        await mongoose.connection.db.collection('trades').updateOne(
          { tradeId: tradeData.tradeId },
          {
            $set: {
              status: 'failed',
              errorMessage: result.error,
              updatedAt: new Date()
            }
          }
        );
      } catch (updateError) {
        console.error('❌ Không thể cập nhật trade status:', updateError);
      }
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [CHECK-RESULT] Lỗi xử lý check result ${tradeData.tradeId}:`, error.message);
    
    // Cập nhật trade status thành failed
    try {
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId: tradeData.tradeId },
        {
          $set: {
            status: 'failed',
            errorMessage: error.message,
            updatedAt: new Date()
          }
        }
      );
    } catch (updateError) {
      console.error('❌ Không thể cập nhật trade status:', updateError);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ DELETED: processTrade() function - Trùng lặp với processCheckResult()
// Chỉ sử dụng processCheckResult() để xử lý trades real-time




      










      
    });

    return result;
  } catch (error) {
    console.error(`❌ [TRADE] Lỗi xử lý trade ${tradeData.tradeId}:`, error.message);
    
    // Cập nhật trade status thành failed
    try {
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId: tradeData.tradeId },
        {
          $set: {
            status: 'failed',
            errorMessage: error.message,
            updatedAt: new Date()
          }
        }
      );
    } catch (updateError) {
      console.error('❌ Không thể cập nhật trade status:', updateError);
    }
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý settlement (kết quả)
 */
async function processSettlement(settlementData) {
  const { sessionId } = settlementData;
  
  // ✅ FIX: Thêm Redis lock cho settlement để tránh race condition
  const settlementLockKey = `settlement:${sessionId}`;
  const lockAcquired = await acquireLock(settlementLockKey, 60000); // 60s timeout
  
  if (!lockAcquired) {
    console.log(`❌ [SETTLEMENT] Không thể acquire lock cho session ${sessionId}`);
    return { success: false, error: 'Settlement is being processed by another worker' };
  }
  
  const session = await mongoose.startSession();
  
  try {
    console.log(`🔄 [SETTLEMENT] Bắt đầu xử lý settlement: ${settlementData.id}`);
    
    const result = await session.withTransaction(async () => {

      // 1. Lấy kết quả có sẵn từ session
      const sessionDoc = await mongoose.connection.db.collection('trading_sessions').findOne(
        { sessionId },
        { result: 1 }
      );
      
      if (!sessionDoc || !sessionDoc.result) {
        throw new Error('Session not found or no result available');
      }
      
      const sessionResult = sessionDoc.result;
      console.log(`📊 [SETTLEMENT] Sử dụng kết quả có sẵn: ${sessionResult} cho session ${sessionId}`);

      // 2. Cập nhật session status
      const sessionUpdateResult = await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId },
        {
          $set: {
            status: 'COMPLETED',
            actualResult: sessionResult,
            processingComplete: true,
            updatedAt: new Date()
          }
        }
      );

      if (sessionUpdateResult.modifiedCount === 0) {
        throw new Error('Session not found or already completed');
      }

      // 2. Lấy tất cả trades completed trong session chưa được gửi events
      const completedTrades = await mongoose.connection.db.collection('trades').find({ 
        sessionId, 
        status: 'completed',
        appliedToBalance: true,
        eventsSent: { $ne: true } // Chưa gửi events
      }).toArray();

      console.log(`📊 [SETTLEMENT] Tìm thấy ${completedTrades.length} trades cần gửi events`);

      let totalWins = 0;
      let totalLosses = 0;
      let totalWinAmount = 0;
      let totalLossAmount = 0;

             // 3. Gửi events cho từng trade đã completed
       for (const trade of completedTrades) {
         // ✅ Chỉ gửi events, không xử lý trades (đã được xử lý real-time)
         const isWin = trade.result === 'win';
         const profit = trade.profit || 0;

         // Cập nhật thống kê
         if (isWin) {
           totalWins++;
           totalWinAmount += trade.amount;
         } else {
           totalLosses++;
           totalLossAmount += trade.amount;
         }

         console.log(`✅ [SETTLEMENT] Gửi events cho trade ${trade._id}: ${isWin ? 'WIN' : 'LOSE'} ${trade.amount}`);
      }

      // 4. Cập nhật session statistics và đánh dấu hoàn thành
      await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId },
        {
          $set: {
            totalTrades: completedTrades.length,
            totalWins: totalWins,
            totalLosses: totalLosses,
            totalWinAmount: totalWinAmount,
            totalLossAmount: totalLossAmount,
            processingComplete: true,
            processingCompletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      console.log(`✅ [SETTLEMENT] Xử lý settlement thành công: ${settlementData.id}`);
      console.log(`📊 [SETTLEMENT] Thống kê: ${completedTrades.length} trades, ${totalWins} wins, ${totalLosses} losses`);

        // ✅ Gửi events cho trades đã completed
        const userTrades = new Map();
        
        // Group trades by user
        for (const trade of completedTrades) {
          const userId = trade.userId.toString();
          if (!userTrades.has(userId)) {
            userTrades.set(userId, []);
          }
          
          userTrades.get(userId).push({
            tradeId: trade.tradeId || trade._id.toString(),
            sessionId,
            result: trade.result,
            profit: trade.profit,
            amount: trade.amount,
            direction: trade.direction,
            status: 'completed',
            createdAt: trade.createdAt
          });
        }
        
        // Send batch events to each user
        for (const [userId, trades] of userTrades) {
          await sendSocketEvent(userId, 'trades:batch:completed', {
            sessionId,
            trades: trades,
            totalTrades: trades.length,
            totalWins: trades.filter(t => t.result === 'win').length,
            totalLosses: trades.filter(t => t.result === 'lose').length,
            message: `Đã xử lý ${trades.length} trades cho session ${sessionId}`
          });
          
          // ✅ Gửi balance:updated với snapshot số dư mới nhất từ DB sau khi xử lý batch
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
          
          // ✅ FIX: Gửi trade:history:updated cho từng trade
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

        // ✅ Đánh dấu trades đã gửi events
        if (completedTrades.length > 0) {
          await mongoose.connection.db.collection('trades').updateMany(
            { 
              _id: { $in: completedTrades.map(t => t._id) }
            },
            { 
              $set: { eventsSent: true }
            }
          );
        }

        // ✅ ALWAYS: Broadcast settlement completed to all users (kể cả khi 0 trades)
        await sendSocketEvent('all', 'session:settlement:completed', {
          sessionId,
          result: sessionResult,
          totals: {
            totalTrades: completedTrades.length,
            totalWins,
            totalLosses,
            totalWinAmount,
            totalLossAmount
          },
          settledAt: new Date().toISOString()
        });
        
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

    return result;
  } catch (error) {
    console.error(`❌ [SETTLEMENT] Lỗi xử lý settlement ${settlementData.id}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await session.endSession();
    // ✅ FIX: Release settlement lock
    await releaseLock(settlementLockKey);
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
        
                 // Kiểm tra action
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
         } else if (tradeData.action === 'check-result') {
           console.log(`🔍 [TRADE] Xử lý check-result cho trade: ${tradeData.tradeId}`);
           const result = await processCheckResult(tradeData);
           
           if (result.success) {
             console.log(`✅ [TRADE] Check-result thành công:`, {
               tradeId: result.tradeId,
               isWin: result.isWin,
               profit: result.profit
             });
           } else {
             console.error(`❌ [TRADE] Check-result thất bại: ${tradeData.tradeId} - ${result.error}`);
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
    
    // Consumer cho settlements
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
    
    console.log(`🎉 Worker ${workerId} đã khởi động thành công!`);
    console.log('📋 Đang lắng nghe:');
    console.log(`   - Trade processing queue: ${TRADE_PROCESSING_QUEUE}`);
    console.log(`   - Settlements queue: ${SETTLEMENTS_QUEUE}`);
    
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
