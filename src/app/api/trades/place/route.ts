import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  const requestId = `place_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🚀 [${requestId}] Bắt đầu xử lý đặt lệnh`);
    
    // Xác thực user
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

    // Lấy dữ liệu từ request
    const { sessionId, direction, amount } = await req.json();
    
    console.log(`📥 [${requestId}] Input data:`, { 
      sessionId, 
      direction, 
      amount, 
      userId: user.userId,
      timestamp: new Date().toISOString()
    });

    // Validate input
    if (!sessionId || !direction || !amount) {
      console.log(`❌ [${requestId}] Thiếu thông tin bắt buộc:`, { sessionId, direction, amount });
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    if (!['UP', 'DOWN'].includes(direction)) {
      console.log(`❌ [${requestId}] Hướng không hợp lệ:`, direction);
      return NextResponse.json({ message: 'Invalid direction' }, { status: 400 });
    }

    if (amount <= 0) {
      console.log(`❌ [${requestId}] Số tiền phải lớn hơn 0:`, amount);
      return NextResponse.json({ message: 'Amount must be greater than 0' }, { status: 400 });
    }

    // Giới hạn amount
    const MAX_AMOUNT = 1000000000000; // 1000 tỷ VND
    const MIN_AMOUNT = 1000; // 1,000 VND
    
    if (amount > MAX_AMOUNT) {
      console.log(`❌ [${requestId}] Số tiền vượt quá giới hạn:`, { amount, MAX_AMOUNT });
      return NextResponse.json({ message: `Amount cannot exceed ${MAX_AMOUNT.toLocaleString()} VND` }, { status: 400 });
    }
    
    if (amount < MIN_AMOUNT) {
      console.log(`❌ [${requestId}] Số tiền dưới mức tối thiểu:`, { amount, MIN_AMOUNT });
      return NextResponse.json({ message: `Amount must be at least ${MIN_AMOUNT.toLocaleString()} VND` }, { status: 400 });
    }

    console.log(`✅ [${requestId}] Validation thành công`);

    console.log(`🔌 [${requestId}] Đang kết nối database...`);
    const db = await getMongoDb();
    if (!db) {
      console.log(`❌ [${requestId}] Kết nối database thất bại`);
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 });
    }
    console.log(`✅ [${requestId}] Kết nối database thành công`);

    // 1. Kiểm tra phiên giao dịch
    console.log(`🔍 [${requestId}] Kiểm tra trading session: ${sessionId}`);
    const tradingSession = await db.collection('trading_sessions').findOne({ sessionId });
    
    if (!tradingSession) {
      console.log(`❌ [${requestId}] Không tìm thấy trading session: ${sessionId}`);
      return NextResponse.json({ message: 'Trading session not found' }, { status: 404 });
    }

    console.log(`📋 [${requestId}] Session info:`, {
      sessionId: tradingSession.sessionId,
      status: tradingSession.status,
      endTime: tradingSession.endTime,
      currentTime: new Date()
    });

    if (tradingSession.status !== 'ACTIVE') {
      console.log(`❌ [${requestId}] Session không active:`, tradingSession.status);
      return NextResponse.json({ message: 'Trading session is not active' }, { status: 400 });
    }

    // Kiểm tra phiên đã kết thúc chưa
    if (tradingSession.endTime <= new Date()) {
      console.log(`❌ [${requestId}] Session đã kết thúc:`, {
        endTime: tradingSession.endTime,
        currentTime: new Date()
      });
      return NextResponse.json({ message: 'Trading session has ended' }, { status: 400 });
    }

    console.log(`✅ [${requestId}] Session validation thành công`);

    // 2. Kiểm tra số lệnh đã đặt trong phiên này
    console.log(`🔍 [${requestId}] Kiểm tra số lệnh đã đặt trong session`);
    const userTradesInSession = await db.collection('trades').countDocuments({
      sessionId,
      userId: new ObjectId(user.userId),
      status: 'pending'
    });

    console.log(`📊 [${requestId}] Số lệnh đã đặt: ${userTradesInSession}`);

    const MAX_TRADES_PER_SESSION = 5; // Giới hạn 5 lệnh per session
    if (userTradesInSession >= MAX_TRADES_PER_SESSION) {
      console.log(`❌ [${requestId}] Đã đạt giới hạn lệnh: ${userTradesInSession}/${MAX_TRADES_PER_SESSION}`);
      return NextResponse.json({ 
        message: `Bạn đã đặt tối đa ${MAX_TRADES_PER_SESSION} lệnh cho phiên này` 
      }, { status: 400 });
    }

    // 3. Lấy balance trước khi đặt lệnh
    console.log(`💰 [${requestId}] Lấy balance hiện tại của user: ${user.userId}`);
    const userBefore = await db.collection('users').findOne(
      { _id: new ObjectId(user.userId) },
      { projection: { balance: 1 } }
    );
    
    if (!userBefore) {
      console.log(`❌ [${requestId}] Không tìm thấy user: ${user.userId}`);
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const balanceBefore = userBefore.balance || { available: 0, frozen: 0 };
    
    console.log(`💰 [${requestId}] Balance trước khi đặt lệnh:`, {
      available: balanceBefore.available,
      frozen: balanceBefore.frozen,
      requestedAmount: amount
    });
    
    // Kiểm tra balance đủ
    if (balanceBefore.available < amount) {
      console.log(`❌ [${requestId}] Balance không đủ:`, {
        available: balanceBefore.available,
        requested: amount,
        deficit: amount - balanceBefore.available
      });
      return NextResponse.json({ 
        message: `Insufficient balance. Available: ${balanceBefore.available.toLocaleString()} VND` 
      }, { status: 400 });
    }

    console.log(`✅ [${requestId}] Balance validation thành công`);

    // 4. Trừ balance với atomic operation
    console.log(`💳 [${requestId}] Bắt đầu cập nhật balance (atomic operation)`);
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

    console.log(`💳 [${requestId}] Kết quả cập nhật balance:`, {
      matchedCount: balanceUpdateResult.matchedCount,
      modifiedCount: balanceUpdateResult.modifiedCount,
      upsertedCount: balanceUpdateResult.upsertedCount
    });

    if (balanceUpdateResult.modifiedCount === 0) {
      console.log(`❌ [${requestId}] Cập nhật balance thất bại - có thể balance đã bị thay đổi`);
      return NextResponse.json({ message: 'Insufficient balance or user not found' }, { status: 400 });
    }

    console.log(`✅ [${requestId}] Cập nhật balance thành công`);

    // 5. Tạo lệnh giao dịch
    console.log(`📝 [${requestId}] Tạo trade record`);
    const trade = {
      sessionId,
      userId: new ObjectId(user.userId),
      direction,
      amount: Number(amount),
      status: 'pending',
      appliedToBalance: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log(`📝 [${requestId}] Trade data:`, {
      sessionId: trade.sessionId,
      userId: trade.userId.toString(),
      direction: trade.direction,
      amount: trade.amount,
      status: trade.status
    });

    const tradeResult = await db.collection('trades').insertOne(trade);
    
    console.log(`📝 [${requestId}] Kết quả tạo trade:`, {
      insertedId: tradeResult.insertedId?.toString(),
      acknowledged: tradeResult.acknowledged
    });
    
    if (!tradeResult.insertedId) {
      console.log(`❌ [${requestId}] Tạo trade thất bại, bắt đầu rollback balance`);
      // Nếu tạo trade thất bại, hoàn lại balance
      const rollbackResult = await db.collection('users').updateOne(
        { _id: new ObjectId(user.userId) },
        {
          $inc: {
            'balance.available': amount,
            'balance.frozen': -amount
          },
          $set: { updatedAt: new Date() }
        }
      );
      
      console.log(`🔄 [${requestId}] Rollback balance kết quả:`, {
        matchedCount: rollbackResult.matchedCount,
        modifiedCount: rollbackResult.modifiedCount
      });
      
      return NextResponse.json({ message: 'Failed to create trade' }, { status: 500 });
    }

    console.log(`✅ [${requestId}] Tạo trade thành công`);

    console.log(`✅ [${requestId}] Đặt lệnh thành công: User ${user.userId} - ${direction} ${amount} VND - Session ${sessionId}`);

    // Lấy lại lệnh vừa tạo để trả về
    console.log(`🔍 [${requestId}] Lấy trade vừa tạo để trả về`);
    const insertedTrade = await db.collection('trades').findOne({
      _id: tradeResult.insertedId
    });

    if (!insertedTrade) {
      console.log(`❌ [${requestId}] Không tìm thấy trade vừa tạo: ${tradeResult.insertedId}`);
      return NextResponse.json({ message: 'Inserted trade not found' }, { status: 500 });
    }

    const balanceAfter = {
      available: (balanceBefore.available || 0) - amount,
      frozen: (balanceBefore.frozen || 0) + amount
    };

    console.log(`💰 [${requestId}] Balance sau khi đặt lệnh:`, {
      before: balanceBefore,
      after: balanceAfter,
      change: {
        available: -amount,
        frozen: amount
      }
    });

    console.log(`🎉 [${requestId}] Hoàn thành đặt lệnh thành công`);

    return NextResponse.json({
      success: true,
      message: 'Trade placed successfully',
      trade: {
        ...insertedTrade,
        _id: insertedTrade._id.toString(),
        userId: insertedTrade.userId.toString()
      },
      balanceBefore: {
        available: balanceBefore.available || 0,
        frozen: balanceBefore.frozen || 0
      },
      balanceAfter: balanceAfter,
      tradesInSession: userTradesInSession + 1
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Lỗi khi đặt lệnh:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      success: false,
      message: errorMessage
    }, { status: 400 });
  }
}