import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { processWinTrade, processLoseTrade, calculateProfit } from '@/lib/balanceUtils';

// Cache để tránh xử lý trùng lặp
const processingSessions = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Session ID is required' 
      }, { status: 400 });
    }

    // Kiểm tra session đang được xử lý
    if (processingSessions.has(sessionId)) {
      return NextResponse.json({ 
        success: true, 
        message: 'Session đang được xử lý, vui lòng thử lại sau',
        data: { sessionId, status: 'processing' }
      });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ 
        success: false, 
        message: 'Database connection failed' 
      }, { status: 500 });
    }

    // Đánh dấu session đang xử lý
    processingSessions.add(sessionId);

    try {
      // 1. Lấy thông tin phiên giao dịch
      const session = await db.collection('trading_sessions').findOne({ sessionId });
      
      if (!session) {
        return NextResponse.json({ 
          success: false, 
          message: 'Trading session not found' 
        }, { status: 404 });
      }

      if (session.status === 'COMPLETED') {
        return NextResponse.json({ 
          success: true, 
          message: 'Session already completed',
          data: { 
            sessionId, 
            status: 'completed',
            result: session.result
          }
        });
      }

      // 2. Kiểm tra phiên đã kết thúc chưa
      if (session.endTime > new Date()) {
        return NextResponse.json({ 
          success: false, 
          message: 'Session has not ended yet' 
        }, { status: 400 });
      }

      const finalResult = session.result; // Kết quả đã được tạo sẵn
      console.log(`📊 Processing session ${sessionId} with result: ${finalResult}`);

      // 3. Sử dụng MongoDB transaction để xử lý kết quả
      const client = (db as any).client || (db as any).db?.client;
      if (!client) {
        throw new Error('MongoDB client not available for transaction');
      }
      
      const dbSession = client.startSession();
      
      await dbSession.withTransaction(async () => {
        // 4. Lấy tất cả lệnh pending của phiên này
        const trades = await db.collection('trades').find({ 
          sessionId,
          status: 'pending'
        }).toArray();

        console.log(`🔍 Found ${trades.length} pending trades for session ${sessionId}`);

        if (trades.length > 0) {
          let totalWins = 0;
          let totalLosses = 0;
          let totalWinAmount = 0;
          let totalLossAmount = 0;

          // Xử lý từng lệnh
          for (const trade of trades) {
            const isWin = trade.direction === finalResult;
            const profit = isWin ? calculateProfit(trade.amount, 0.9) : 0; // 90% tiền thắng

            // Cập nhật trạng thái lệnh
            await db.collection('trades').updateOne(
              { _id: trade._id },
              {
                $set: {
                  status: 'completed',
                  result: isWin ? 'win' : 'lose',
                  profit: profit,
                  completedAt: new Date(),
                  updatedAt: new Date()
                }
              },
              { session: dbSession }
            );

            // Xử lý balance
            try {
              if (isWin) {
                await processWinTrade(db, trade.userId.toString(), trade.amount, profit);
                totalWins++;
                totalWinAmount += trade.amount + profit;
              } else {
                await processLoseTrade(db, trade.userId.toString(), trade.amount);
                totalLosses++;
                totalLossAmount += trade.amount;
              }
            } catch (error) {
              console.error(`❌ Error processing balance for trade ${trade._id}:`, error);
              throw error;
            }
          }

          // 5. Cập nhật trạng thái phiên giao dịch
          await db.collection('trading_sessions').updateOne(
            { sessionId },
            {
              $set: {
                status: 'COMPLETED',
                totalTrades: trades.length,
                totalWins: totalWins,
                totalLosses: totalLosses,
                totalWinAmount: totalWinAmount,
                totalLossAmount: totalLossAmount,
                completedAt: new Date(),
                updatedAt: new Date()
              }
            },
            { session: dbSession }
          );
        } else {
          // Không có trades nào, chỉ cập nhật trạng thái phiên
          await db.collection('trading_sessions').updateOne(
            { sessionId },
            {
              $set: {
                status: 'COMPLETED',
                totalTrades: 0,
                totalWins: 0,
                totalLosses: 0,
                totalWinAmount: 0,
                totalLossAmount: 0,
                completedAt: new Date(),
                updatedAt: new Date()
              }
            },
            { session: dbSession }
          );
        }
      });

      await dbSession.endSession();

      // 6. Lấy thông tin phiên đã hoàn thành
      const completedSession = await db.collection('trading_sessions').findOne({ sessionId });
      const completedTrades = await db.collection('trades')
        .find({ sessionId, status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();

      return NextResponse.json({
        success: true,
        message: `Session ${sessionId} processed successfully`,
        data: {
          sessionId,
          status: 'completed',
          result: finalResult,
          session: completedSession,
          trades: completedTrades.map(trade => ({
            ...trade,
            _id: trade._id.toString(),
            userId: trade.userId.toString()
          }))
        }
      });

    } catch (error) {
      console.error(`❌ Error processing session ${sessionId}:`, error);
      return NextResponse.json({
        success: false,
        message: 'Error processing session',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    } finally {
      // Xóa session khỏi cache sau 10 giây
      setTimeout(() => {
        processingSessions.delete(sessionId);
      }, 10000);
    }

  } catch (error) {
    console.error('❌ Error in process-result API:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 