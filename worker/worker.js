#!/usr/bin/env node

import amqp from 'amqplib';
import mongoose from 'mongoose';

// Configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqps://seecjpys:zQCC056kIx1vnMmrImQqAAVbVUUfmk0M@fuji.lmq.cloudamqp.com/seecjpys';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://stock-version-2:Vincent79@stockdb.ssitqfx.mongodb.net/finacial_platfom';
const SETTLEMENTS_QUEUE = 'settlements';

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
    console.log('✅ Đã xóa settlements queue cũ');
  } catch (error) {
    console.log('⚠️ Không thể xóa settlements queue (có thể chưa tồn tại):', error.message);
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
    
    // Chỉ tạo queue settlements - orders được xử lý trực tiếp bởi API
    await channel.assertQueue(SETTLEMENTS_QUEUE, {
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

// Đã bỏ hàm processOrder - không cần worker cho orders nữa

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
 * Khởi động worker
 */
async function startWorker() {
  try {
    console.log('🚀 Khởi động Trade Worker...');
    
    // Kết nối databases
    await connectMongoDB();
    await connectRabbitMQ();
    
    // Thiết lập prefetch
    await channel.prefetch(1);
    
    console.log('✅ Worker đã sẵn sàng xử lý messages');
    
        // Đã bỏ consumer cho orders - không cần worker cho orders nữa
    console.log('📋 Chỉ xử lý settlements - orders được xử lý trực tiếp bởi API');
    
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
    
    console.log('🎉 Worker đã khởi động thành công!');
    console.log('📋 Đang lắng nghe:');
    console.log(`   - Settlements queue: ${SETTLEMENTS_QUEUE} (chỉ xử lý settlements)`);
    console.log(`   - Orders được xử lý trực tiếp bởi API`);
    
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
