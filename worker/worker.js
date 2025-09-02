#!/usr/bin/env node

import amqp from 'amqplib';
import mongoose from 'mongoose';
import fetch from 'node-fetch';

// Configuration - RabbitMQ Local Open Source
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://trading_user:trading_password@localhost:5672';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://stock-version-2:Vincent79@stockdb.ssitqfx.mongodb.net/finacial_platfom';
const SETTLEMENTS_QUEUE = 'settlements';
const TRADE_PROCESSING_QUEUE = 'trade-processing';
const SOCKET_SERVER_URL = 'http://localhost:3001';

let connection;
let channel;
let db;

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
 * Xử lý place trade (đặt lệnh)
 */
async function processPlaceTrade(tradeData) {
  const session = await mongoose.startSession();
  
  try {
    console.log(`📝 [PLACE-TRADE] Bắt đầu xử lý đặt lệnh: ${tradeData.tradeId}`);
    
    const result = await session.withTransaction(async () => {
      const { tradeId, userId, sessionId, amount, type } = tradeData;

      // 1. Kiểm tra trade đã tồn tại chưa
      const existingTrade = await mongoose.connection.db.collection('trades').findOne({ tradeId });
      if (existingTrade) {
        throw new Error(`Trade already exists: ${tradeId}`);
      }

      // 2. Kiểm tra balance và trừ tiền
      // ✅ BỎ: Không cần kiểm tra lock nữa
      const userResult = await mongoose.connection.db.collection('users').findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(userId),
          'balance.available': { $gte: amount },
          'status.active': true,
          'status.betLocked': { $ne: true }
          // ✅ BỎ: Không cần kiểm tra isLocked vì user có thể đặt nhiều lệnh
        },
        {
          $inc: {
            'balance.available': -amount,
            'balance.frozen': amount,
            version: 1
          },
          $set: {
            // ✅ BỎ: Không lock user, chỉ cập nhật balance
            updatedAt: new Date()
          }
        },
        { 
          session, 
          returnDocument: 'after',
          new: true
        }
      );
      
      if (!userResult) {
        throw new Error('Insufficient balance or user locked');
      }

      // 3. Tạo trade record - SỬ DỤNG TRANSACTION
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

      // ✅ BỎ: Không cần tạo lock record nữa vì user có thể đặt nhiều lệnh
      // MongoDB Transaction đã đảm bảo consistency
      // Không cần lock record để tránh race condition

      // Gửi Socket.IO events khi place trade thành công
      // ✅ Lưu ý: Events được gửi sau khi transaction commit thành công
      await sendSocketEvent(userId, 'trade:placed', {
        tradeId,
        sessionId,
        direction: type === 'buy' ? 'UP' : 'DOWN',
        amount,
        type,
        status: 'pending',
        message: 'Lệnh đã được đặt thành công'
      });

      await sendSocketEvent(userId, 'trade:history:updated', {
        action: 'add',
        trade: {
          id: tradeId,
          tradeId: tradeId,
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

      return {
        success: true,
        tradeId,
        balance: {
          available: userResult.balance.available,
          frozen: userResult.balance.frozen
        }
      };
    });

    return result;
  } catch (error) {
    console.error(`❌ [PLACE-TRADE] Lỗi xử lý đặt lệnh ${tradeData.tradeId}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý check result (kiểm tra kết quả)
 */
async function processCheckResult(tradeData) {
  const session = await mongoose.startSession();
  
  try {
    console.log(`🔍 [CHECK-RESULT] Bắt đầu xử lý check result: ${tradeData.tradeId}`);
    
    const result = await session.withTransaction(async () => {
      const { tradeId, userId, sessionId, amount, type } = tradeData;

      // 1. Kiểm tra trade có tồn tại không
      const trade = await mongoose.connection.db.collection('trades').findOne({ tradeId });
      if (!trade) {
        throw new Error(`Trade not found: ${tradeId}`);
      }

      // 2. Lấy amount và type từ database nếu không có trong message
      const tradeAmount = amount || trade.amount;
      const tradeType = type || trade.type;
      
      if (!tradeAmount || !tradeType) {
        throw new Error(`Trade missing amount or type: ${tradeId}`);
      }

      // 3. Kiểm tra trade đã được xử lý chưa
      if (trade.status === 'completed' || trade.status === 'failed') {
        console.log(`✅ [CHECK-RESULT] Trade đã được xử lý: ${tradeId} với status: ${trade.status}`);
        return { success: true, message: 'Trade already processed' };
      }

      // ✅ SỬA: Kiểm tra appliedToBalance để tránh duplicate processing
      if (trade.appliedToBalance === true) {
        console.log(`✅ [CHECK-RESULT] Trade đã được áp dụng vào balance: ${tradeId}, bỏ qua`);
        return { success: true, message: 'Trade already applied to balance' };
      }

      // 4. Cập nhật status thành processing - SỬ DỤNG TRANSACTION
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId },
        { $set: { status: 'processing', updatedAt: new Date() } },
        { session } // ✅ QUAN TRỌNG: Sử dụng session trong transaction
      );

      // 5. Lấy kết quả session từ database
      const sessionDoc = await mongoose.connection.db.collection('trading_sessions').findOne(
        { sessionId },
        { result: 1 }
      );
      
      if (!sessionDoc || !sessionDoc.result) {
        throw new Error(`Session result not available: ${sessionId}`);
      }
      
      const sessionResult = sessionDoc.result;
      console.log(`📊 [CHECK-RESULT] Sử dụng kết quả session: ${sessionResult} cho session ${sessionId}`);

      // 6. So sánh trade với kết quả session
      const userPrediction = tradeType === 'buy' ? 'UP' : 'DOWN';
      const isWin = userPrediction === sessionResult;
      
      console.log(`🎯 [CHECK-RESULT] So sánh kết quả:`, {
        tradeId,
        userPrediction,
        sessionResult,
        isWin,
        amount: tradeAmount
      });

      // 7. Tính toán profit/loss
      const profit = isWin ? Math.floor(tradeAmount * 0.9) : -tradeAmount; // Tỷ lệ 10 ăn 9

      // 8. Cập nhật balance user - SỬ DỤNG TRANSACTION
      if (isWin) {
        // THẮNG: Trả lại tiền gốc + tiền thắng
        await mongoose.connection.db.collection('users').updateOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          {
            $inc: {
              'balance.frozen': -tradeAmount,
              'balance.available': tradeAmount + profit
            },
            $set: {
              updatedAt: new Date()
            }
          },
          { session } // ✅ QUAN TRỌNG: Sử dụng session trong transaction
        );
      } else {
        // THUA: Chỉ trừ frozen (mất tiền)
        await mongoose.connection.db.collection('users').updateOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          {
            $inc: {
              'balance.frozen': -tradeAmount
            },
            $set: {
              updatedAt: new Date()
            }
          },
          { session } // ✅ QUAN TRỌNG: Sử dụng session trong transaction
        );
      }

      // 9. Cập nhật trade với kết quả - SỬ DỤNG TRANSACTION
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId },
        {
          $set: {
            status: 'completed',
            processedAt: new Date(),
            profit: profit,
            appliedToBalance: true, // ✅ SỬA: Set flag này để tránh duplicate processing
            result: {
              isWin,
              profit: profit,
              sessionResult,
              processedAt: new Date()
            }
          }
        },
        { session } // ✅ QUAN TRỌNG: Sử dụng session trong transaction
      );

      // 10. Cập nhật thống kê session - SỬ DỤNG TRANSACTION
      await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId },
        {
          $inc: {
            totalTrades: 1,
            totalWins: isWin ? 1 : 0,
            totalLosses: isWin ? 0 : 1,
            totalWinAmount: isWin ? tradeAmount : 0,
            totalLossAmount: isWin ? 0 : tradeAmount
          }
        },
        { session } // ✅ QUAN TRỌNG: Sử dụng session trong transaction
      );

      console.log(`✅ [CHECK-RESULT] Xử lý check result thành công:`, {
        tradeId,
        isWin,
        profit,
        sessionResult
      });

      // Gửi Socket.IO events
      await sendSocketEvent(userId, 'trade:completed', {
        tradeId,
        sessionId,
        result: isWin ? 'win' : 'lose',
        profit: profit,
        amount: tradeAmount,
        direction: tradeType === 'buy' ? 'UP' : 'DOWN',
        message: isWin ? '🎉 Thắng!' : '😔 Thua'
      });

      await sendSocketEvent(userId, 'balance:updated', {
        tradeId,
        profit: profit,
        amount: tradeAmount, // ✅ THÊM: Số tiền đặt lệnh để frontend tính balance đúng
        result: isWin ? 'win' : 'lose',
        message: `Balance đã được cập nhật: ${isWin ? '+' : ''}${profit} VND`
      });

      await sendSocketEvent(userId, 'trade:history:updated', {
        action: 'update',
        trade: {
          id: tradeId,
          tradeId: tradeId, // Thêm tradeId để đảm bảo compatibility
          sessionId,
          direction: tradeType === 'buy' ? 'UP' : 'DOWN',
          amount: tradeAmount,
          status: 'completed',
          result: isWin ? 'win' : 'lose',
          profit: profit,
          createdAt: new Date().toISOString() // Sửa từ processedAt thành createdAt
        },
        message: 'Lịch sử giao dịch đã được cập nhật'
      });
      
      return {
        success: true,
        tradeId,
        isWin,
        profit,
        sessionResult
      };
    });

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
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý trade từ queue
 */
async function processTrade(tradeData) {
  const session = await mongoose.startSession();
  
  try {
    console.log(`🔄 [TRADE] Bắt đầu xử lý trade: ${tradeData.tradeId}`);
    
    const result = await session.withTransaction(async () => {
      const { tradeId, userId, sessionId, amount, type } = tradeData;

      // 1. Kiểm tra trade có tồn tại không
      const trade = await mongoose.connection.db.collection('trades').findOne({ tradeId });
      if (!trade) {
        throw new Error(`Trade not found: ${tradeId}`);
      }

      // 2. Kiểm tra trade đã được xử lý chưa
      if (trade.status === 'completed' || trade.status === 'failed') {
        console.log(`✅ [TRADE] Trade đã được xử lý: ${tradeId} với status: ${trade.status}`);
        return { success: true, message: 'Trade already processed' };
      }

      // 3. Cập nhật status thành processing
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId },
        { $set: { status: 'processing' } }
      );

      // 4. Lấy kết quả session từ database
      const sessionDoc = await mongoose.connection.db.collection('trading_sessions').findOne(
        { sessionId },
        { result: 1 }
      );
      
      if (!sessionDoc || !sessionDoc.result) {
        throw new Error(`Session result not available: ${sessionId}`);
      }
      
      const sessionResult = sessionDoc.result;
      console.log(`📊 [TRADE] Sử dụng kết quả session: ${sessionResult} cho session ${sessionId}`);

      // 5. So sánh trade với kết quả session
      const userPrediction = type === 'buy' ? 'UP' : 'DOWN';
      const isWin = userPrediction === sessionResult;
      
      console.log(`🎯 [TRADE] So sánh kết quả:`, {
        tradeId,
        userPrediction,
        sessionResult,
        isWin,
        amount
      });

      // 6. Tính toán profit/loss
      const profit = isWin ? Math.floor(amount * 0.9) : -amount; // Tỷ lệ 10 ăn 9

      // 7. Cập nhật balance user
      if (isWin) {
        // THẮNG: Trả lại tiền gốc + tiền thắng
        await mongoose.connection.db.collection('users').updateOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          {
            $inc: {
              'balance.frozen': -amount,
              'balance.available': amount + profit
            },
            $set: {
              isLocked: false,
              lockExpiry: null,
              updatedAt: new Date()
            }
          }
        );
      } else {
        // THUA: Chỉ trừ frozen (mất tiền)
        await mongoose.connection.db.collection('users').updateOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          {
            $inc: {
              'balance.frozen': -amount
            },
            $set: {
              isLocked: false,
              lockExpiry: null,
              updatedAt: new Date()
            }
          }
        );
      }

      // 8. Cập nhật trade với kết quả
      await mongoose.connection.db.collection('trades').updateOne(
        { tradeId },
        {
          $set: {
            status: 'completed',
            processedAt: new Date(),
            profit: profit, // Lưu profit vào database
            result: {
              isWin,
              profit: profit, // Lưu profit trong result object
              sessionResult,
              appliedToBalance: true,
              processedAt: new Date()
            }
          }
        }
      );

      // 9. Cập nhật thống kê session
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
        }
      );

      console.log(`✅ [TRADE] Xử lý trade thành công:`, {
        tradeId,
        isWin,
        profit,
        sessionResult
      });

      // Gửi Socket.IO events
      await sendSocketEvent(userId, 'trade:completed', {
        tradeId,
        sessionId,
        result: isWin ? 'win' : 'lose',
        profit: profit,
        amount: amount,
        direction: type === 'buy' ? 'UP' : 'DOWN',
        message: isWin ? '🎉 Thắng!' : '😔 Thua'
      });

      await sendSocketEvent(userId, 'balance:updated', {
        tradeId,
        profit: profit,
        amount: amount, // ✅ THÊM: Số tiền đặt lệnh để frontend tính balance đúng
        result: isWin ? 'win' : 'lose',
        message: `Balance đã được cập nhật: ${isWin ? '+' : ''}${profit} VND`
      });

      await sendSocketEvent(userId, 'trade:history:updated', {
        action: 'update',
        trade: {
          id: tradeId,
          tradeId: tradeId, // Thêm tradeId để đảm bảo compatibility
          sessionId,
          direction: type === 'buy' ? 'UP' : 'DOWN',
          amount,
          status: 'completed',
          result: isWin ? 'win' : 'lose',
          profit: profit,
          createdAt: new Date().toISOString() // Sửa từ processedAt thành createdAt
        },
        message: 'Lịch sử giao dịch đã được cập nhật'
      });
      
      return {
        success: true,
        tradeId,
        isWin,
        profit,
        sessionResult
      };
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
  const session = await mongoose.startSession();
  
  try {
    console.log(`🔄 [SETTLEMENT] Bắt đầu xử lý settlement: ${settlementData.id}`);
    
    const result = await session.withTransaction(async () => {
      const { sessionId } = settlementData;

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

      // 2. Lấy tất cả trades pending trong session (sử dụng cùng collection với API)
      const pendingTrades = await mongoose.connection.db.collection('trades').find({ 
        sessionId, 
        status: 'pending' 
      }).toArray();

      console.log(`📊 [SETTLEMENT] Tìm thấy ${pendingTrades.length} trades cần xử lý`);

      let totalWins = 0;
      let totalLosses = 0;
      let totalWinAmount = 0;
      let totalLossAmount = 0;

             // 3. Xử lý từng trade
       for (const trade of pendingTrades) {
         const isWin = trade.direction === sessionResult;
         // ✅ TỶ LỆ 10 ĂN 9: Đặt 10 thắng 9, đặt 100 thắng 90
         const profit = isWin ? Math.floor(trade.amount * 0.9) : 0;

        // Cập nhật trade (sử dụng cùng collection với API)
        await mongoose.connection.db.collection('trades').updateOne(
          { _id: trade._id },
          {
            $set: {
              status: 'completed',
              result: isWin ? 'win' : 'lose',
              profit: profit,
              appliedToBalance: true,
              updatedAt: new Date()
            }
          }
        );

                 // ✅ ĐÚNG: Cập nhật balance khi xử lý settlement
         if (isWin) {
           // THẮNG: Trả lại tiền gốc + tiền thắng
           await mongoose.connection.db.collection('users').updateOne(
             { _id: trade.userId },
             {
               $inc: {
                 'balance.frozen': -trade.amount,
                 'balance.available': trade.amount + profit
               },
               $set: {
                 updatedAt: new Date()
               }
             }
           );
         } else {
           // THUA: Chỉ trừ frozen (mất tiền)
           await mongoose.connection.db.collection('users').updateOne(
             { _id: trade.userId },
             {
               $inc: {
                 'balance.frozen': -trade.amount
               },
               $set: {
                 updatedAt: new Date()
               }
             }
           );
         }

        // Cập nhật thống kê
        if (isWin) {
          totalWins++;
          totalWinAmount += trade.amount;
        } else {
          totalLosses++;
          totalLossAmount += trade.amount;
        }

        console.log(`✅ [SETTLEMENT] Xử lý trade ${trade._id}: ${isWin ? 'WIN' : 'LOSE'} ${trade.amount}`);
      }

      // 4. Cập nhật session statistics và đánh dấu hoàn thành (sử dụng cùng collection với API)
      await mongoose.connection.db.collection('trading_sessions').updateOne(
        { sessionId },
        {
          $set: {
            totalTrades: pendingTrades.length,
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
        console.log(`📊 [SETTLEMENT] Thống kê: ${pendingTrades.length} trades, ${totalWins} wins, ${totalLosses} losses`);

        // Gửi Socket.IO events cho tất cả trades đã xử lý
        for (const trade of pendingTrades) {
          const isWin = trade.direction === sessionResult;
          const profit = isWin ? Math.floor(trade.amount * 0.9) : 0;

          await sendSocketEvent(trade.userId.toString(), 'trade:completed', {
            tradeId: trade.tradeId || trade._id.toString(),
            sessionId,
            result: isWin ? 'win' : 'lose',
            profit: profit,
            amount: trade.amount,
            direction: trade.direction,
            message: isWin ? '🎉 Thắng!' : '😔 Thua'
          });

          await sendSocketEvent(trade.userId.toString(), 'balance:updated', {
            tradeId: trade.tradeId || trade._id.toString(),
            profit: profit,
            amount: trade.amount, // ✅ THÊM: Số tiền đặt lệnh để frontend tính balance đúng
            result: isWin ? 'win' : 'lose',
            message: `Balance đã được cập nhật: ${isWin ? '+' : ''}${profit} VND`
          });

                     await sendSocketEvent(trade.userId.toString(), 'trade:history:updated', {
             action: 'update',
             trade: {
               id: trade.tradeId || trade._id.toString(),
               tradeId: trade.tradeId || trade._id.toString(), // Thêm tradeId để đảm bảo compatibility
               sessionId,
               direction: trade.direction,
               amount: trade.amount,
               status: 'completed',
               result: isWin ? 'win' : 'lose',
               profit: profit,
               createdAt: new Date().toISOString() // Sửa từ processedAt thành createdAt
             },
             message: 'Lịch sử giao dịch đã được cập nhật'
           });
        }
        
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
        data
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log(`📡 [SOCKET] Event sent: ${event} to user ${userId}`, result);
    return result.success;
  } catch (error) {
    console.error(`❌ [SOCKET] Error sending event ${event}:`, error);
    return false;
  }
}

/**
 * Khởi động worker
 */
async function startWorker() {
  try {
    const workerId = process.env.WORKER_ID || '1';
    console.log(`🚀 Khởi động Trade Worker ${workerId}...`);
    
    // Kết nối databases
    await connectMongoDB();
    await connectRabbitMQ();
    
    // Thiết lập prefetch
    await channel.prefetch(1);
    
    console.log('✅ Worker đã sẵn sàng xử lý messages');
    
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
  
  console.log('✅ Worker đã tắt');
  process.exit(0);
});

// Start worker
startWorker();
