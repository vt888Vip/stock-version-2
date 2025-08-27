import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const userId = searchParams.get('userId');

    if (!sessionId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Session ID is required' 
      }, { status: 400 });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ 
        success: false, 
        message: 'Database connection failed' 
      }, { status: 500 });
    }

    // Lấy thông tin phiên giao dịch
    const session = await db.collection('trading_sessions').findOne({ sessionId });
    
    if (!session) {
      return NextResponse.json({ 
        success: false, 
        message: 'Trading session not found' 
      }, { status: 404 });
    }

    // Lấy lệnh của user trong phiên này (nếu có userId)
    let userTrade = null;
    if (userId) {
      userTrade = await db.collection('trades').findOne({
        sessionId,
        userId: new ObjectId(userId)
      });
    }

    // Tính toán kết quả cho user
    let tradeResult = null;
    if (userTrade && session.status === 'COMPLETED') {
      const userDirection = userTrade.direction;
      const sessionResult = session.result;
      
      if (userDirection === sessionResult) {
        tradeResult = 'win';
      } else {
        tradeResult = 'lose';
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        result: session.result,
        completedAt: session.completedAt,
        totalTrades: session.totalTrades,
        totalWins: session.totalWins,
        totalLosses: session.totalLosses,
        userTrade: userTrade ? {
          id: userTrade._id.toString(),
          direction: userTrade.direction,
          amount: userTrade.amount,
          status: userTrade.status,
          result: userTrade.result,
          profit: userTrade.profit,
          tradeResult: tradeResult
        } : null
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy kết quả phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
} 