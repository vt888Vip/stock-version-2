import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { Db, ObjectId } from 'mongodb';
import mongoose from 'mongoose';

// ✅ GLOBAL LOCK MAP để tránh concurrent processing cho cùng 1 session
const sessionLocks = new Map();
const LOCK_TIMEOUT = 30000; // 30 seconds timeout

// ✅ HÀM TẠO DISTRIBUTED LOCK
async function acquireSessionLock(sessionId: string, db: Db) {
  const lockKey = `session_lock_${sessionId}`;
  const lockTimeout = new Date(Date.now() + LOCK_TIMEOUT);
  
  try {
    // Tạo hoặc cập nhật lock trong database
    const lockResult = await db.collection('session_locks').findOneAndUpdate(
      { 
        _id: lockKey,
        $or: [
          { lockedUntil: { $lt: new Date() } }, // Lock đã hết hạn
          { lockedUntil: { $exists: false } }    // Chưa có lock
        ]
      },
      {
        $set: {
          _id: lockKey,
          sessionId: sessionId,
          lockedAt: new Date(),
          lockedUntil: lockTimeout,
          processId: `${process.env.VERCEL_REGION || 'local'}_${Date.now()}_${Math.random()}`
        }
      },
      { 
        upsert: true,
        returnDocument: 'after'
      }
    );
    
    if (lockResult) {
      console.log(`🔒 [LOCK] Acquired lock for session ${sessionId}`);
      return lockResult.processId;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ [LOCK] Failed to acquire lock for session ${sessionId}:`, error);
    return null;
  }
}

// ✅ HÀM GIẢI PHÓNG LOCK
async function releaseSessionLock(sessionId: string, processId: string, db: Db) {
  try {
    await db.collection('session_locks').deleteOne({
      _id: `session_lock_${sessionId}`,
      processId: processId
    });
    console.log(`🔓 [LOCK] Released lock for session ${sessionId}`);
  } catch (error) {
    console.error(`❌ [LOCK] Failed to release lock for session ${sessionId}:`, error);
  }
}

// ✅ HÀM CLEANUP STUCK LOCKS
async function cleanupStuckLocks(db: Db) {
  try {
    const stuckLocks = await db.collection('session_locks').find({
      lockedUntil: { $lt: new Date() }
    }).toArray();
    
    if (stuckLocks.length > 0) {
      console.log(`🧹 [CLEANUP] Found ${stuckLocks.length} stuck locks, cleaning up...`);
      
      for (const lock of stuckLocks) {
        await db.collection('session_locks').deleteOne({ _id: lock._id });
        console.log(`🧹 [CLEANUP] Removed stuck lock: ${lock._id}`);
      }
    }
  } catch (error) {
    console.error('❌ [CLEANUP] Error cleaning up stuck locks:', error);
  }
}

// ✅ HÀM CLEANUP STUCK TRADES
async function cleanupStuckTrades(db: Db  ) {
  try {
    const stuckTrades = await db.collection('trades').find({
      processing: true,
      processingStartedAt: { $lt: new Date(Date.now() - 60000) } // > 1 phút
    }).toArray();
    
    if (stuckTrades.length > 0) {
      console.log(`🧹 [CLEANUP] Found ${stuckTrades.length} stuck trades, resetting...`);
      
      await db.collection('trades').updateMany(
        {
          processing: true,
          processingStartedAt: { $lt: new Date(Date.now() - 60000) }
        },
        {
          $set: {
            processing: false,
            processingStartedAt: null,
            processingId: null
          }
        }
      );
    }
  } catch (error) {
    console.error('❌ [CLEANUP] Error cleaning up stuck trades:', error);
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
    
    // ✅ CLEANUP: Dọn dẹp stuck locks và trades trước khi xử lý
    console.log(`🧹 [${requestId}] Bắt đầu cleanup stuck locks và trades`);
    await cleanupStuckLocks(db);
    await cleanupStuckTrades(db);
    console.log(`✅ [${requestId}] Cleanup hoàn thành`);
    
    // ✅ BƯỚC 1: KIỂM TRA XEM SESSION ĐÃ ĐƯỢC XỬ LÝ HOÀN TOÀN CHƯA
    console.log(`🔍 [${requestId}] Kiểm tra session: ${sessionId}`);
    const quickCheck = await db.collection('trading_sessions').findOne(
      { sessionId },
      { projection: { sessionId: 1, status: 1, result: 1, processingComplete: 1, endTime: 1, _id: 0 } }
    );
    
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
    
    // ✅ BƯỚC 3: KIỂM TRA XEM CÓ ĐANG CÓ PROCESS KHÁC XỬ LÝ KHÔNG
    const existingLock = await db.collection('session_locks').findOne({
      _id: `session_lock_${sessionId}`,
      lockedUntil: { $gt: new Date() }
    });
    
    if (existingLock) {
      console.log(`⏳ [WAIT] Session ${sessionId} đang được xử lý bởi process khác`);
      return NextResponse.json({
        hasResult: false,
        message: 'Session is being processed by another instance',
        shouldRetry: true,
        retryAfter: 2000 // Retry after 2 seconds
      });
    }
    
    // ✅ BƯỚC 4: ACQUIRE DISTRIBUTED LOCK
    const lockProcessId = await acquireSessionLock(sessionId, db);
    if (!lockProcessId) {
      console.log(`🚫 [LOCK FAILED] Không thể acquire lock cho session ${sessionId}`);
      return NextResponse.json({
        hasResult: false,
        message: 'Could not acquire processing lock',
        shouldRetry: true,
        retryAfter: 1000
      });
    }
    
    // ✅ BƯỚC 5: BẮT ĐẦU TRANSACTION VỚI LOCK
    const session = await mongoose.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        // ✅ DOUBLE-CHECK: Kiểm tra lại xem session có đã được xử lý không
        const tradingSession = await db.collection('trading_sessions').findOne(
          { sessionId },
          { 
            projection: { result: 1, status: 1, actualResult: 1, endTime: 1, processingComplete: 1 },
            session 
          }
        );
        
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
        
        // ⚡ RANDOM KẾT QUẢ: Nếu chưa có kết quả và phiên đã kết thúc
        if (!tradingSession.result && sessionEnded) {
          console.log(`🎲 Session ${sessionId} đã kết thúc nhưng chưa có kết quả, tạo kết quả random`);
          
          // ✅ ATOMIC UPDATE với version control
          const updatedSession = await db.collection('trading_sessions').findOneAndUpdate(
            { 
              sessionId,
              result: null, // Chỉ update nếu chưa có result
              processingComplete: { $ne: true } // Và chưa processing complete
            },
            { 
              $set: { 
                result: Math.random() < 0.5 ? 'UP' : 'DOWN',
                actualResult: Math.random() < 0.5 ? 'UP' : 'DOWN',
                status: 'COMPLETED',
                completedAt: now,
                updatedAt: now,
                createdBy: 'system_random',
                processingStarted: true, // ✅ ĐÁNH DẤU BẮT ĐẦU XỬ LÝ
                processingStartedAt: now
              }
            },
            { 
              returnDocument: 'after',
              upsert: false,
              session
            }
          );
          
          if (updatedSession) {
            console.log(`🎲 Đã tạo kết quả random: ${updatedSession.result} cho session ${sessionId}`);
            tradingSession.result = updatedSession.result;
            tradingSession.actualResult = updatedSession.actualResult;
            tradingSession.status = updatedSession.status;
          } else {
            console.log(`⚠️ Không thể tạo kết quả random cho session ${sessionId}, có thể đã được xử lý`);
            // Lấy lại session để kiểm tra
            const recheckSession = await db.collection('trading_sessions').findOne(
              { sessionId },
              { projection: { result: 1, processingComplete: 1 }, session }
            );
            
            if (recheckSession?.processingComplete) {
              return {
                hasResult: true,
                result: recheckSession.result,
                sessionStatus: 'COMPLETED',
                updatedTrades: 0,
                message: 'Already processed by another instance'
              };
            }
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

        // ✅ BƯỚC XỬ LÝ TRADES VỚI IDEMPOTENCY
        console.log(`🔄 [PROCESS TRADES] Bắt đầu xử lý trades cho session ${sessionId}`);
        
        // ✅ KIỂM TRA XEM TRADES ĐÃ ĐƯỢC XỬ LÝ CHƯA
        const pendingTradesCount = await db.collection('trades').countDocuments({
          sessionId,
          status: 'pending',
          // ✅ THÊM ĐIỀU KIỆN: Chỉ xử lý trades chưa được đánh dấu processing
          $or: [
            { processing: { $exists: false } },
            { processing: false },
            { processingStartedAt: { $lt: new Date(Date.now() - 30000) } } // Timeout 30s
          ]
        }, { session });
        
        if (pendingTradesCount === 0) {
          console.log(`✅ [NO TRADES] Không có trades nào cần xử lý cho session ${sessionId}`);
          
          // ✅ ĐÁNH DẤU SESSION ĐÃ XỬ LÝ XONG
          await db.collection('trading_sessions').updateOne(
            { sessionId },
            {
              $set: {
                processingComplete: true,
                processingCompletedAt: new Date()
              }
            },
            { session }
          );
          
          return {
            hasResult: true,
            result: tradingSession.actualResult || tradingSession.result,
            sessionStatus: tradingSession.status,
            updatedTrades: 0,
            isRandom: tradingSession.createdBy === 'system_random',
            message: 'No pending trades'
          };
        }

        // ✅ ĐÁNH DẤU TRADES ĐANG ĐƯỢC XỬ LÝ (ATOMIC)
        const batchSize = 20;
        const markProcessingResult = await db.collection('trades').updateMany(
          {
            sessionId,
            status: 'pending',
            $or: [
              { processing: { $exists: false } },
              { processing: false },
              { processingStartedAt: { $lt: new Date(Date.now() - 30000) } }
            ]
          },
          {
            $set: {
              processing: true,
              processingStartedAt: new Date(),
              processingId: lockProcessId
            }
          },
          { session }
        );
        
        if (markProcessingResult.modifiedCount === 0) {
          console.log(`⚠️ [NO TRADES TO MARK] Không có trades nào được đánh dấu processing cho session ${sessionId}`);
          
          // Kiểm tra xem tất cả trades đã completed chưa
          const allCompletedCount = await db.collection('trades').countDocuments({
            sessionId,
            status: 'completed'
          }, { session });
          
          const totalTradesCount = await db.collection('trades').countDocuments({
            sessionId
          }, { session });
          
          if (allCompletedCount === totalTradesCount && totalTradesCount > 0) {
            // Tất cả trades đã completed, đánh dấu session hoàn thành
            await db.collection('trading_sessions').updateOne(
              { sessionId },
              {
                $set: {
                  processingComplete: true,
                  processingCompletedAt: new Date()
                }
              },
              { session }
            );
          }
          
          return {
            hasResult: true,
            result: tradingSession.actualResult || tradingSession.result,
            sessionStatus: tradingSession.status,
            updatedTrades: 0,
            message: 'Trades already being processed'
          };
        }
        
        console.log(`📊 [MARK PROCESSING] Đã đánh dấu ${markProcessingResult.modifiedCount} trades đang xử lý`);
        
        // ✅ LẤY TRADES ĐÃ ĐƯỢC ĐÁNH DẤU BỞI PROCESS NÀY
        const tradesToProcess = await db.collection('trades')
          .find({ 
            sessionId,
            processing: true,
            processingId: lockProcessId
          })
          .limit(batchSize)
          .toArray();
        
        console.log(`📊 [PROCESSING] Xử lý ${tradesToProcess.length} trades cho session ${sessionId}`);
        
        let processedTrades = 0;
        let balanceErrors = 0;
        
        // ✅ XỬ LÝ TỪNG TRADE VỚI BALANCE VALIDATION MẠNH MẼ
        for (const trade of tradesToProcess) {
          const isWin = trade.direction.toLowerCase() === tradingSession.result?.toLowerCase();
          const profit = isWin ? Math.floor(trade.amount * 0.9) : 0;
          
          console.log(`🎯 [TRADE] ${trade._id}: ${trade.direction} vs ${tradingSession.result} = ${isWin ? 'WIN' : 'LOSE'}`);
          
          if (isWin) {
            // ✅ THẮNG: Atomic balance update với validation
            const balanceUpdate = await db.collection('users').findOneAndUpdate(
              { 
                _id: trade.userId,
                'balance.frozen': { $gte: trade.amount } // Kiểm tra frozen đủ
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
              
              // Cập nhật trade với lỗi
              await db.collection('trades').updateOne(
                { _id: trade._id },
                {
                  $set: {
                    status: 'error',
                    result: 'balance_error',
                    profit: 0,
                    processing: false,
                    appliedToBalance: true, // ✅ THÊM DÒNG NÀY
                    completedAt: new Date(),
                    balanceError: true,
                    balanceErrorReason: 'frozen_insufficient_for_win'
                  }
                },
                { session }
              );
              continue;
            }
          } else {
            // ✅ THUA: Atomic balance update với validation
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
              
              await db.collection('trades').updateOne(
                { _id: trade._id },
                {
                  $set: {
                    status: 'error',
                    result: 'balance_error',
                    profit: 0,
                    processing: false,
                    appliedToBalance: true, // ✅ THÊM DÒNG NÀY
                    completedAt: new Date(),
                    balanceError: true,
                    balanceErrorReason: 'frozen_insufficient'
                  }
                },
                { session }
              );
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
                processing: false,
                appliedToBalance: true, // ✅ THÊM DÒNG NÀY
                completedAt: new Date(),
                updatedAt: new Date()
              }
            },
            { session }
          );
          
          processedTrades++;
        }
        
        // ✅ KIỂM TRA XEM TẤT CẢ TRADES ĐÃ HOÀN THÀNH CHƯA
        const remainingPendingCount = await db.collection('trades').countDocuments({
          sessionId,
          status: { $in: ['pending'] }
        }, { session });
        
        if (remainingPendingCount === 0) {
          // ✅ TẤT CẢ TRADES ĐÃ HOÀN THÀNH
          await db.collection('trading_sessions').updateOne(
            { sessionId },
            {
              $set: {
                processingComplete: true,
                processingCompletedAt: new Date()
              }
            },
            { session }
          );
          
          console.log(`🎉 [COMPLETE] Session ${sessionId} đã hoàn thành xử lý tất cả trades`);
        }
        
        console.log(`✅ [BATCH COMPLETE] Xử lý ${processedTrades}/${tradesToProcess.length} trades, ${balanceErrors} lỗi`);

        return {
          hasResult: true,
          result: tradingSession.actualResult || tradingSession.result,
          sessionStatus: tradingSession.status,
          updatedTrades: processedTrades,
          totalProcessed: processedTrades,
          errors: balanceErrors,
          isRandom: tradingSession.createdBy === 'system_random',
          processingComplete: remainingPendingCount === 0
        };
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
      
      // ✅ GIẢI PHÓNG LOCK
      if (lockProcessId) {
        await releaseSessionLock(sessionId, lockProcessId, db);
      }
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