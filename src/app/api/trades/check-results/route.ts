import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { Db } from 'mongodb';
import mongoose from 'mongoose';
import TradingSessionModel from '@/models/TradingSession';
import amqp from 'amqplib';

// RabbitMQ Configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqps://seecjpys:zQCC056kIx1vnMmrImQqAAVbVUUfmk0M@fuji.lmq.cloudamqp.com/seecjpys';
const SETTLEMENTS_QUEUE = 'settlements';

// ✅ HÀM GỬI SETTLEMENT MESSAGE VÀO QUEUE
async function sendSettlementMessage(settlementData: {
  sessionId: string;
  result: 'UP' | 'DOWN';
  id: string;
  timestamp: string;
}): Promise<boolean> {
  try {
    console.log('📤 [QUEUE] Gửi settlement message:', settlementData);
    
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    // Đảm bảo queue tồn tại
    await channel.assertQueue(SETTLEMENTS_QUEUE, {
      durable: true,
      maxPriority: 10
    });
    
    // Gửi message
    const success = channel.sendToQueue(
      SETTLEMENTS_QUEUE,
      Buffer.from(JSON.stringify(settlementData)),
      {
        persistent: true,
        priority: 1
      }
    );
    
    await channel.close();
    await connection.close();
    
    if (success) {
      console.log('✅ [QUEUE] Đã gửi settlement message thành công:', settlementData.id);
    } else {
      console.log('❌ [QUEUE] Không thể gửi settlement message');
    }
    
    return success;
  } catch (error) {
    console.error('❌ [QUEUE] Lỗi gửi settlement message:', error);
    return false;
  }
}

export async function POST(req: Request) {
  const requestId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🚀 [${requestId}] Bắt đầu kiểm tra kết quả session`);
    
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log(`❌ [${requestId}] Không có authorization header`);
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      console.log(`❌ [${requestId}] Token không hợp lệ`);
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      console.log(`❌ [${requestId}] Thiếu sessionId`);
      return NextResponse.json({ message: 'Session ID is required' }, { status: 400 });
    }

    console.log(`📥 [${requestId}] Input data:`, { 
      sessionId, 
      userId: user.userId,
      timestamp: new Date().toISOString()
    });

    console.log(`🔌 [${requestId}] Đang kết nối database...`);
    const db = await getMongoDb();
    console.log(`✅ [${requestId}] Kết nối database thành công`);
    
         // ✅ BƯỚC 1: KIỂM TRA XEM SESSION ĐÃ ĐƯỢC XỬ LÝ HOÀN TOÀN CHƯA
     console.log(`🔍 [${requestId}] Kiểm tra session: ${sessionId}`);
     const quickCheck = await TradingSessionModel.findOne(
       { sessionId },
       { sessionId: 1, status: 1, result: 1, processingComplete: 1, endTime: 1, settlementQueued: 1, _id: 0 }
     ).lean();
    
    if (!quickCheck) {
      console.log(`❌ [${requestId}] Không tìm thấy session: ${sessionId}`);
      return NextResponse.json({ 
        hasResult: false, 
        message: 'Session not found',
        shouldRetry: true 
      });
    }
    
    console.log(`📋 [${requestId}] Session info:`, {
      sessionId: quickCheck.sessionId,
      status: quickCheck.status,
      result: quickCheck.result,
      processingComplete: quickCheck.processingComplete,
      settlementQueued: quickCheck.settlementQueued,
      endTime: quickCheck.endTime
    });
    
    // ✅ BƯỚC 2: NẾU ĐÃ XỬ LÝ XONG, TRẢ VỀ KẾT QUẢ LUÔN
    if (quickCheck.processingComplete) {
      console.log(`✅ [${requestId}] Session ${sessionId} đã xử lý xong, trả về kết quả ngay`);
      return NextResponse.json({
        hasResult: true,
        result: quickCheck.result,
        sessionStatus: quickCheck.status,
        updatedTrades: 0,
        message: 'Already processed'
      });
    }
    
    // ✅ BƯỚC 2.5: KIỂM TRA XEM SESSION ĐÃ ĐƯỢC GỬI VÀO QUEUE CHƯA
    if (quickCheck.settlementQueued) {
      console.log(`📤 [${requestId}] Session ${sessionId} đã được gửi vào queue, chờ worker xử lý`);
      return NextResponse.json({
        hasResult: false,
        message: 'Settlement already queued, waiting for worker processing',
        shouldRetry: true,
        retryAfter: 3000 // Retry sau 3 giây
      });
    }
    
    // ✅ BƯỚC 3: BẮT ĐẦU TRANSACTION
    const session = await mongoose.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        // ✅ DOUBLE-CHECK: Kiểm tra lại xem session có đã được xử lý không
        const tradingSession = await TradingSessionModel.findOne(
          { sessionId },
          { 
            result: 1, status: 1, actualResult: 1, endTime: 1, processingComplete: 1
          }
        ).session(session);
        
        if (!tradingSession) {
          throw new Error('Session not found');
        }
        
        // Nếu đã xử lý xong thì return luôn
        if (tradingSession.processingComplete) {
          console.log(`✅ [DOUBLE CHECK] Session ${sessionId} đã xử lý xong trong transaction`);
          return {
            hasResult: true,
            result: tradingSession.result,
            sessionStatus: tradingSession.status,
            updatedTrades: 0,
            message: 'Already processed in transaction'
          };
        }

        // Kiểm tra xem phiên đã kết thúc chưa
        const now = new Date();
        const sessionEnded = tradingSession.endTime && tradingSession.endTime <= now;
        
        // ⚡ SỬ DỤNG KẾT QUẢ CÓ SẴN: Nếu chưa có kết quả và phiên đã kết thúc
        if (!tradingSession.result && sessionEnded) {
          console.log(`❌ Session ${sessionId} đã kết thúc nhưng không có kết quả trong database!`);
          
          // ✅ Lấy lại session để kiểm tra xem có kết quả không
          const recheckSession = await TradingSessionModel.findOne(
            { sessionId },
            { result: 1, processingComplete: 1 }
          ).session(session);
          
          if (recheckSession?.result) {
            console.log(`✅ Tìm thấy kết quả: ${recheckSession.result} cho session ${sessionId}`);
            tradingSession.result = recheckSession.result;
            tradingSession.actualResult = recheckSession.result;
          } else {
            console.log(`❌ Session ${sessionId} thực sự không có kết quả, cần kiểm tra lại logic tạo session`);
            return {
              hasResult: false,
              message: 'Session ended but no result found in database',
              shouldRetry: false,
              error: 'MISSING_RESULT'
            };
          }
        }

        // Nếu chưa có kết quả (phiên chưa kết thúc)
        if (!tradingSession.result) {
          return {
            hasResult: false,
            sessionEnded,
            shouldRetry: !sessionEnded
          };
        }

        // ✅ KIỂM TRA LẠI TRONG TRANSACTION: Xem session đã được gửi vào queue chưa
        const sessionInTransaction = await TradingSessionModel.findOne(
          { sessionId },
          { settlementQueued: 1 }
        ).session(session);
        
        if (sessionInTransaction?.settlementQueued) {
          console.log(`📤 [QUEUE] Session ${sessionId} đã được gửi vào queue trong transaction, bỏ qua`);
          return {
            hasResult: false,
            message: 'Settlement already queued in transaction',
            shouldRetry: true,
            retryAfter: 2000
          };
        }
        
        // ✅ CHUYỂN SANG QUEUE: Gửi settlement message vào queue thay vì xử lý trực tiếp
        console.log(`📤 [QUEUE] Gửi settlement message cho session ${sessionId}`);
        
        console.log(`🔍 [CHECK-RESULTS] Session ${sessionId} có kết quả: ${tradingSession.result}`);
        
        const settlementData = {
          sessionId: sessionId,
          result: tradingSession.result as 'UP' | 'DOWN',
          id: `settlement_${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString()
        };

        // Gửi message vào queue
        const queueResult = await sendSettlementMessage(settlementData);
        
        if (queueResult) {
          console.log(`✅ [QUEUE] Đã gửi settlement message thành công cho session ${sessionId}`);
          
                     // Đánh dấu session đã được gửi vào queue
           await TradingSessionModel.updateOne(
             { sessionId },
             {
               $set: {
                 processingStarted: true,
                 processingStartedAt: new Date(),
                 settlementQueued: true,
                 settlementQueuedAt: new Date()
               }
             }
           ).session(session);
          
          return {
            hasResult: false,
            message: 'Settlement queued for processing',
            shouldRetry: true,
            retryAfter: 2000 // Retry sau 2 giây
          };
        } else {
          console.log(`❌ [QUEUE] Không thể gửi settlement message cho session ${sessionId}`);
          
          // Fallback: Xử lý trực tiếp nếu không gửi được queue
          console.log(`🔄 [FALLBACK] Xử lý settlement trực tiếp cho session ${sessionId}`);
          
          // ✅ BƯỚC XỬ LÝ TRADES VỚI IDEMPOTENCY
          console.log(`🔄 [PROCESS TRADES] Bắt đầu xử lý trades cho session ${sessionId}`);
          
          // ✅ KIỂM TRA XEM TRADES ĐÃ ĐƯỢC XỬ LÝ CHƯA
          const pendingTradesCount = await db.collection('trades').countDocuments({
            sessionId,
            status: 'pending'
          }, { session });
          
          if (pendingTradesCount === 0) {
            console.log(`✅ [NO TRADES] Không có trades nào cần xử lý cho session ${sessionId}`);
            
                         // ✅ ĐÁNH DẤU SESSION ĐÃ XỬ LÝ XONG
             await TradingSessionModel.updateOne(
               { sessionId },
               {
                 $set: {
                   processingComplete: true,
                   processingCompletedAt: new Date()
                 }
               }
             ).session(session);
            
            return {
              hasResult: true,
              result: tradingSession.actualResult || tradingSession.result,
              sessionStatus: tradingSession.status,
              updatedTrades: 0,
              isRandom: tradingSession.createdBy === 'system_random',
              message: 'No pending trades'
            };
          }

          // ✅ LẤY TẤT CẢ TRADES PENDING
          const pendingTrades = await db.collection('trades')
            .find({ 
              sessionId,
              status: 'pending'
            })
            .toArray();
          
          console.log(`📊 [PROCESSING] Xử lý ${pendingTrades.length} trades cho session ${sessionId}`);
          
          let processedTrades = 0;
          let balanceErrors = 0;
          
                     // ✅ XỬ LÝ TỪNG TRADE
           for (const trade of pendingTrades) {
             const isWin = trade.direction.toLowerCase() === tradingSession.result?.toLowerCase();
             // ✅ TỶ LỆ 10 ĂN 9: Đặt 10 thắng 9, đặt 100 thắng 90
             const profit = isWin ? Math.floor(trade.amount * 0.9) : 0;
            
            console.log(`🎯 [TRADE] ${trade._id}: ${trade.direction} vs ${tradingSession.result} = ${isWin ? 'WIN' : 'LOSE'}`);
            
            if (isWin) {
              // ✅ THẮNG: Atomic balance update
              const balanceUpdate = await db.collection('users').findOneAndUpdate(
                { 
                  _id: trade.userId,
                  'balance.frozen': { $gte: trade.amount }
                },
                {
                  $inc: {
                    'balance.available': trade.amount + profit,
                    'balance.frozen': -trade.amount
                  },
                  $set: { updatedAt: new Date() }
                },
                { 
                  session,
                  returnDocument: 'after'
                }
              );
              
              if (!balanceUpdate) {
                balanceErrors++;
                console.error(`🚨 [WIN ERROR] User ${trade.userId}: frozen không đủ ${trade.amount}`);
                continue;
              }
            } else {
              // ✅ THUA: Atomic balance update
              const balanceUpdate = await db.collection('users').findOneAndUpdate(
                { 
                  _id: trade.userId,
                  'balance.frozen': { $gte: trade.amount }
                },
                {
                  $inc: {
                    'balance.frozen': -trade.amount
                  },
                  $set: { updatedAt: new Date() }
                },
                { 
                  session,
                  returnDocument: 'after'
                }
              );
              
              if (!balanceUpdate) {
                balanceErrors++;
                console.error(`🚨 [LOSE ERROR] User ${trade.userId}: frozen không đủ ${trade.amount}`);
                continue;
              }
            }
            
            // ✅ CẬP NHẬT TRADE THÀNH CÔNG
            await db.collection('trades').updateOne(
              { _id: trade._id },
              {
                $set: {
                  status: 'completed',
                  result: isWin ? 'win' : 'lose',
                  profit: profit,
                  appliedToBalance: true,
                  completedAt: new Date(),
                  updatedAt: new Date()
                }
              },
              { session }
            );
            
            processedTrades++;
          }
          
                     // ✅ ĐÁNH DẤU SESSION HOÀN THÀNH
           await TradingSessionModel.updateOne(
             { sessionId },
             {
               $set: {
                 processingComplete: true,
                 processingCompletedAt: new Date()
               }
             }
           ).session(session);
          
          console.log(`✅ [COMPLETE] Session ${sessionId} đã hoàn thành xử lý ${processedTrades} trades, ${balanceErrors} lỗi`);

          return {
            hasResult: true,
            result: tradingSession.actualResult || tradingSession.result,
            sessionStatus: tradingSession.status,
            updatedTrades: processedTrades,
            totalProcessed: processedTrades,
            errors: balanceErrors,
            isRandom: tradingSession.createdBy === 'system_random',
            processingComplete: true
          };
        }
      });

      return NextResponse.json(result);

    } catch (error) {
      console.error('❌ Error in check-results transaction:', error);
      
      if (error instanceof Error && error.message === 'Session not found') {
        return NextResponse.json({ 
          hasResult: false, 
          message: 'Session not found',
          shouldRetry: true 
        });
      }
      
      return NextResponse.json({ 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
        shouldRetry: true
      }, { status: 500 });
      
    } finally {
      await session.endSession();
    }

  } catch (error) {
    console.error('❌ Error in check-results:', error);
    return NextResponse.json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      shouldRetry: true
    }, { status: 500 });
  }
}
