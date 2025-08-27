import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  try {
    // Xác thực user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    // Lấy dữ liệu từ request
    const { sessionId, direction, amount } = await req.json();
    
    console.log('API /trades/place - Input:', { sessionId, direction, amount, userId: user.userId });

    // Validate input
    if (!sessionId || !direction || !amount) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    if (!['UP', 'DOWN'].includes(direction)) {
      return NextResponse.json({ message: 'Invalid direction' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ message: 'Amount must be greater than 0' }, { status: 400 });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 });
    }

    // 1. Kiểm tra phiên giao dịch
    const tradingSession = await db.collection('trading_sessions').findOne({ sessionId });
    
    if (!tradingSession) {
      return NextResponse.json({ message: 'Trading session not found' }, { status: 404 });
    }

    if (tradingSession.status !== 'ACTIVE') {
      return NextResponse.json({ message: 'Trading session is not active' }, { status: 400 });
    }

    // Kiểm tra phiên đã kết thúc chưa
    if (tradingSession.endTime <= new Date()) {
      return NextResponse.json({ message: 'Trading session has ended' }, { status: 400 });
    }

    // 2. Kiểm tra số lệnh đã đặt trong phiên này
    const userTradesInSession = await db.collection('trades').countDocuments({
      sessionId,
      userId: new ObjectId(user.userId),
      status: 'pending'
    });

    const MAX_TRADES_PER_SESSION = 5; // Giới hạn 5 lệnh per session
    if (userTradesInSession >= MAX_TRADES_PER_SESSION) {
      return NextResponse.json({ 
        message: `Bạn đã đặt tối đa ${MAX_TRADES_PER_SESSION} lệnh cho phiên này` 
      }, { status: 400 });
    }

    // 3. Xử lý lệnh với MongoDB atomic operations (Giải pháp chính xác)
    try {
      // ✅ THÊM: Lấy balance trước khi đặt lệnh để debug
      const userBefore = await db.collection('users').findOne(
        { _id: new ObjectId(user.userId) },
        { projection: { balance: 1 } }
      );
      const balanceBefore = userBefore?.balance || { available: 0, frozen: 0 };
      
      // Trừ balance với atomic operation - ĐIỀU NÀY MỚI GIẢI QUYẾT RACE CONDITION
      const balanceUpdateResult = await db.collection('users').updateOne(
        { 
          _id: new ObjectId(user.userId),
          'balance.available': { $gte: amount }  // Điều kiện atomic
        },
        {
          $inc: {
            'balance.available': -amount,
            'balance.frozen': amount
          },
          $set: { updatedAt: new Date() }
        }
      );

      if (balanceUpdateResult.modifiedCount === 0) {
        return NextResponse.json({ message: 'Insufficient balance or user not found' }, { status: 400 });
      }

      // Tạo lệnh giao dịch
      const trade = {
        sessionId,
        userId: new ObjectId(user.userId),
        direction,
        amount: Number(amount),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const tradeResult = await db.collection('trades').insertOne(trade);
      
      if (!tradeResult.insertedId) {
        // Nếu tạo trade thất bại, hoàn lại balance
        await db.collection('users').updateOne(
          { _id: new ObjectId(user.userId) },
          {
            $inc: {
              'balance.available': amount,
              'balance.frozen': -amount
            },
            $set: { updatedAt: new Date() }
          }
        );
        throw new Error('Failed to create trade');
      }

      console.log(`✅ [PLACE TRADE] User ${user.userId} đặt lệnh ${direction} - ${amount} VND cho session ${sessionId}`);

      // Lấy lại lệnh vừa tạo để trả về
      const insertedTrade = await db.collection('trades').findOne({
        _id: tradeResult.insertedId
      });

      if (!insertedTrade) {
        throw new Error('Inserted trade not found');
      }

      return NextResponse.json({
        success: true,
        message: 'Trade placed successfully',
        trade: {
          ...insertedTrade,
          _id: insertedTrade._id.toString(),
          userId: insertedTrade.userId.toString()
        },
        // ✅ THÊM: Thông tin balance để debug race condition
        balanceBefore: {
          available: balanceBefore.available || 0,
          frozen: balanceBefore.frozen || 0
        },
        balanceAfter: {
          available: (balanceBefore.available || 0) - amount,
          frozen: (balanceBefore.frozen || 0) + amount
        },
        tradesInSession: userTradesInSession + 1
      });

    } catch (error) {
      console.error('Error placing trade:', error);
      throw error;
    }

  } catch (error) {
    console.error('Error placing trade:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      success: false,
      message: errorMessage
    }, { status: 400 });
  }
}
