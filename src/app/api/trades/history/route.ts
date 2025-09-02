import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { processExpiredSessions } from '@/lib/sessionUtils';

export async function GET(req: Request) {
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

    const db = await getMongoDb();
    
    // Xử lý các phiên hết hạn trước khi lấy lịch sử
    await processExpiredSessions(db, 'TradeHistory');
    
    // Lấy tất cả lệnh của user, sắp xếp theo thời gian tạo mới nhất
    const trades = await db.collection('trades')
      .find({ userId: new ObjectId(user.userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    console.log('API /trades/history - userId:', user.userId, 'Số lệnh:', trades.length);
    
    // Log chi tiết trades để debug
    if (trades.length > 0) {
      console.log('📊 [HISTORY] Sample trade data:', {
        firstTrade: {
          tradeId: trades[0].tradeId,
          direction: trades[0].direction,
          type: trades[0].type,
          status: trades[0].status,
          result: trades[0].result,
          profit: trades[0].profit,
          resultType: typeof trades[0].result
        }
      });
    }

    return NextResponse.json({
      success: true,
      trades: trades.map(trade => {
        // Mapping cho format cũ
        if (trade.direction && trade.result && typeof trade.result === 'string') {
          return {
            id: trade._id.toString(),
            sessionId: trade.sessionId,
            direction: trade.direction, // UP/DOWN
            amount: trade.amount,
            status: trade.status,
            result: trade.result, // win/lose
            profit: trade.profit || 0,
            createdAt: trade.createdAt,
            // Thêm các trường bổ sung
            tradeId: trade.tradeId,
            type: trade.type,
            asset: trade.asset
          };
        }
        
        // Mapping cho format mới
        if (trade.tradeId && trade.type && trade.result && typeof trade.result === 'object') {
          return {
            id: trade.tradeId, // Sử dụng tradeId thay vì _id
            sessionId: trade.sessionId,
            direction: trade.type === 'buy' ? 'UP' : 'DOWN', // Chuyển đổi type thành direction
            amount: trade.amount,
            status: trade.status,
            result: trade.result.isWin ? 'win' : 'lose', // Chuyển đổi result object thành string
            profit: trade.result.profit || 0, // Lấy profit từ result object
            createdAt: trade.createdAt,
            // Thêm các trường bổ sung
            tradeId: trade.tradeId,
            type: trade.type,
            processedAt: trade.processedAt
          };
        }
        
        // Fallback cho trường hợp khác
        return {
          id: trade.tradeId || trade._id.toString(),
          sessionId: trade.sessionId,
          direction: trade.direction || (trade.type === 'buy' ? 'UP' : 'DOWN'),
          amount: trade.amount,
          status: trade.status,
          result: trade.result?.isWin ? 'win' : trade.result?.isWin === false ? 'lose' : trade.result,
          profit: trade.result?.profit || trade.profit || 0,
          createdAt: trade.createdAt,
          tradeId: trade.tradeId,
          type: trade.type
        };
      })
    });

  } catch (error) {
    console.error('Lỗi khi lấy lịch sử lệnh:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
} 