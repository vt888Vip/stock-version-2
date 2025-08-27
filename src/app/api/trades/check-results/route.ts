import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ message: 'Session ID is required' }, { status: 400 });
    }

    const db = await getMongoDb();
    
    // ⚡ TỐI ƯU: Lấy kết quả phiên từ trading_sessions với index
    const session = await db.collection('trading_sessions').findOne(
      { sessionId },
      { projection: { result: 1, status: 1, actualResult: 1, endTime: 1 } }
    );
    
    if (!session) {
      return NextResponse.json({ 
        hasResult: false, 
        message: 'Session not found',
        shouldRetry: true 
      });
    }

    // Kiểm tra xem phiên đã kết thúc chưa
    const now = new Date();
    const sessionEnded = session.endTime && session.endTime <= now;
    
    // ⚡ RANDOM KẾT QUẢ: Nếu chưa có kết quả và phiên đã kết thúc
    if (!session.result && sessionEnded) {
      console.log(`🎲 Session ${sessionId} đã kết thúc nhưng chưa có kết quả, tạo kết quả random`);
      
      // ✅ ATOMIC UPDATE: Sử dụng findOneAndUpdate để tránh race condition
      const updatedSession = await db.collection('trading_sessions').findOneAndUpdate(
        { 
          sessionId,
          result: null // Chỉ update nếu chưa có result
        },
        { 
          $set: { 
            result: Math.random() < 0.5 ? 'UP' : 'DOWN',
            actualResult: Math.random() < 0.5 ? 'UP' : 'DOWN',
            status: 'COMPLETED',
            completedAt: now,
            updatedAt: now,
            createdBy: 'system_random'
          }
        },
        { 
          returnDocument: 'after',
          upsert: false // Không tạo mới nếu không tìm thấy
        }
      );
      
      if (updatedSession) {
        console.log(`🎲 Đã tạo kết quả random: ${updatedSession.result} cho session ${sessionId}`);
        // Cập nhật session object để sử dụng kết quả mới
        session.result = updatedSession.result;
        session.actualResult = updatedSession.actualResult;
        session.status = updatedSession.status;
      }
    }

    // Nếu chưa có kết quả (phiên chưa kết thúc)
    if (!session.result) {
      return NextResponse.json({ 
        hasResult: false,
        sessionEnded,
        shouldRetry: !sessionEnded // Chỉ retry nếu phiên chưa kết thúc
      });
    }

    // ✅ PHƯƠNG ÁN MỚI: Tìm tất cả trades chưa được apply balance
    const pendingTrades = await db.collection('trades')
      .find({ 
        sessionId,
        status: 'pending',
        appliedToBalance: false  // ✅ CHỈ LẤY NHỮNG TRADE CHƯA APPLY
      })
      .toArray();

    if (pendingTrades.length > 0) {
      console.log(`🔄 [CHECK RESULTS] Xử lý ${pendingTrades.length} trades chưa apply balance cho session ${sessionId}`);
      
      // ✅ ATOMIC UPDATE: Xử lý từng trade với transaction
      for (const trade of pendingTrades) {
        const isWin = trade.direction.toLowerCase() === session.result?.toLowerCase();
        const profit = isWin ? Math.floor(trade.amount * 0.9) : 0; // 90% tiền thắng (10 ăn 9)
        
        console.log(`🎯 [TRADE RESULT] Trade ${trade._id}: direction=${trade.direction}, sessionResult=${session.result}, isWin=${isWin}, amount=${trade.amount}, profit=${profit}`);
        
        // ✅ ATOMIC OPERATION: Update trade và balance trong 1 transaction
        const dbSession = await mongoose.startSession();
        
        try {
          await dbSession.withTransaction(async () => {
            // Đánh dấu trade đã được apply balance
            await db.collection('trades').updateOne(
              { _id: trade._id },
              {
                $set: {
                  status: 'completed',
                  result: isWin ? 'win' : 'lose',
                  profit: profit,
                  appliedToBalance: true, // ✅ ĐÁNH DẤU ĐÃ APPLY
                  completedAt: new Date(),
                  updatedAt: new Date()
                }
              },
              { session: dbSession }
            );

            // Update balance user
            if (isWin) {
              // Thắng: cộng tiền gốc + profit vào available, trừ tiền gốc khỏi frozen
              await db.collection('users').updateOne(
                { _id: trade.userId },
                {
                  $inc: {
                    'balance.available': trade.amount + profit,
                    'balance.frozen': -trade.amount
                  },
                  $set: { updatedAt: new Date() }
                },
                { session: dbSession }
              );
            } else {
              // Thua: chỉ trừ tiền gốc khỏi frozen
              await db.collection('users').updateOne(
                { _id: trade.userId },
                {
                  $inc: {
                    'balance.frozen': -trade.amount
                  },
                  $set: { updatedAt: new Date() }
                },
                { session: dbSession }
              );
            }
          });
          
          console.log(`✅ [ATOMIC UPDATE] Trade ${trade._id}: ${isWin ? 'WIN' : 'LOSE'}, profit: ${profit}`);
          
        } catch (error) {
          console.error(`❌ [ATOMIC UPDATE] Lỗi trade ${trade._id}:`, error);
          throw error;
        } finally {
          await dbSession.endSession();
        }
      }
    }

    // ⚡ TỐI ƯU: Trả về kết quả ngay lập tức
    return NextResponse.json({ 
      hasResult: true,
      result: session.actualResult || session.result,
      sessionStatus: session.status,
      updatedTrades: pendingTrades.length,
      isRandom: session.createdBy === 'system_random'
    });

  } catch (error) {
    console.error('❌ Error in check-results:', error);
    return NextResponse.json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      shouldRetry: true
    }, { status: 500 });
  }
}
