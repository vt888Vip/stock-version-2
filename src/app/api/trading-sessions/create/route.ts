import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { startTime, endTime, sessionId } = await request.json();
    
    if (!startTime || !endTime || !sessionId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required fields: startTime, endTime, sessionId' 
      }, { status: 400 });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ 
        success: false, 
        message: 'Database connection failed' 
      }, { status: 500 });
    }

    // Tạo kết quả ngẫu nhiên (50% UP, 50% DOWN)
    const result = Math.random() < 0.5 ? 'UP' : 'DOWN';

    // Tạo phiên giao dịch mới
    const newSession = {
      sessionId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: 'ACTIVE',
      result, // Kết quả được tạo sẵn
      processingComplete: false, // ✅ Thêm field này để đánh dấu chưa xử lý
      totalTrades: 0,
      totalWins: 0,
      totalLosses: 0,
      totalWinAmount: 0,
      totalLossAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Sử dụng upsert để tránh tạo trùng lặp
    const upsertResult = await db.collection('trading_sessions').updateOne(
      { sessionId },
      { $setOnInsert: newSession },
      { upsert: true }
    );

    if (!upsertResult.upsertedId && !upsertResult.modifiedCount) {
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to create trading session' 
      }, { status: 500 });
    }

    // Kiểm tra xem phiên đã tồn tại trước đó chưa
    const isNewSession = upsertResult.upsertedId;
    
    if (isNewSession) {
      console.log(`✅ Created new trading session ${sessionId} with result: ${result}`);
    } else {
      console.log(`ℹ️ Trading session ${sessionId} already exists`);
    }

    return NextResponse.json({
      success: true,
      message: isNewSession ? 'Trading session created successfully' : 'Trading session already exists',
      data: {
        sessionId,
        startTime: newSession.startTime,
        endTime: newSession.endTime,
        status: newSession.status,
        result: newSession.result,
        isNew: !!isNewSession
      }
    });

  } catch (error) {
    console.error('Error creating trading session:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// API để lấy danh sách phiên giao dịch
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ 
        success: false, 
        message: 'Database connection failed' 
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    const filter: any = {};
    if (status) {
      filter.status = status;
    }

    const sessions = await db.collection('trading_sessions')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      data: sessions.map(session => ({
        ...session,
        _id: session._id.toString()
      }))
    });

  } catch (error) {
    console.error('Error fetching trading sessions:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
