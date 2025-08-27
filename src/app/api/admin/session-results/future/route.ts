import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

// ✅ THÊM: Lock để tránh race condition khi tạo phiên
let isGeneratingSessions = false;

// ✅ THÊM: Helper function để kiểm tra admin
async function verifyAdmin(token: string) {
  const tokenData = await verifyToken(token);
  
  if (!tokenData?.userId || !tokenData.isValid) {
    return null;
  }

  const db = await getMongoDb();
  if (!db) {
    return null;
  }

  const user = await db.collection('users').findOne(
    { _id: new ObjectId(tokenData.userId) },
    { projection: { role: 1 } }
  );

  return user?.role === 'admin' ? user : null;
}

// API để admin xem 30 phiên tương lai với kết quả đã được tạo sẵn
export async function GET(request: Request) {
  try {
    // Xác thực admin
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const adminUser = await verifyAdmin(token);
    
    if (!adminUser) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 });
    }

    const now = new Date();
    
    // ✅ THÊM: Kiểm tra lock trước khi tạo phiên
    if (!isGeneratingSessions) {
      // Tạo 30 phiên tương lai nếu chưa có
      await generateFutureSessions(db, now);
    } else {
      console.log('⏸️ Đang tạo phiên, bỏ qua request này');
    }

    // Lấy 30 phiên tương lai
    const futureSessions = await db.collection('trading_sessions')
      .find({
        startTime: { $gt: now },
        status: 'ACTIVE'
      })
      .sort({ startTime: 1 })
      .limit(30)
      .toArray();

    console.log(`✅ API trả về ${futureSessions.length} phiên tương lai`);

    return NextResponse.json({
      success: true,
      data: {
        sessions: futureSessions.map(session => ({
          ...session,
          _id: session._id.toString()
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching future sessions:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Hàm tạo 30 phiên tương lai
async function generateFutureSessions(db: any, startTime: Date) {
  // ✅ THÊM: Set lock để tránh race condition
  if (isGeneratingSessions) {
    console.log('⏸️ Đang tạo phiên, bỏ qua');
    return;
  }
  
  isGeneratingSessions = true;
  console.log('🔒 Bắt đầu tạo phiên tương lai...');
  
  try {
    // Kiểm tra xem đã có bao nhiêu phiên tương lai
    const existingFutureSessions = await db.collection('trading_sessions')
      .find({
        startTime: { $gt: startTime },
        status: 'ACTIVE'
      })
      .count();

    // Nếu chưa đủ 30 phiên, tạo thêm
    if (existingFutureSessions < 30) {
      const sessionsToCreate = 30 - existingFutureSessions;
      
      // Tìm phiên cuối cùng để tính thời gian bắt đầu
      const lastSession = await db.collection('trading_sessions')
        .find({
          startTime: { $gt: startTime }
        })
        .sort({ startTime: -1 })
        .limit(1)
        .toArray();

      let nextStartTime: Date;
      
      if (lastSession.length > 0) {
        // Bắt đầu từ phiên cuối cùng + 1 phút
        nextStartTime = new Date(lastSession[0].endTime);
      } else {
        // Bắt đầu từ phút tiếp theo
        const currentMinute = new Date(Date.UTC(
          startTime.getUTCFullYear(), 
          startTime.getUTCMonth(), 
          startTime.getUTCDate(), 
          startTime.getUTCHours(), 
          startTime.getUTCMinutes()
        ));
        nextStartTime = new Date(currentMinute.getTime() + 60000);
      }

      // Tạo các phiên mới
      const newSessions = [];
      
      for (let i = 0; i < sessionsToCreate; i++) {
        const sessionStartTime = new Date(nextStartTime.getTime() + (i * 60000));
        const sessionEndTime = new Date(sessionStartTime.getTime() + 60000);
        
        // Tạo sessionId theo format: YYYYMMDDHHmm
        const sessionId = `${sessionStartTime.getUTCFullYear()}${String(sessionStartTime.getUTCMonth() + 1).padStart(2, '0')}${String(sessionStartTime.getUTCDate()).padStart(2, '0')}${String(sessionStartTime.getUTCHours()).padStart(2, '0')}${String(sessionStartTime.getUTCMinutes()).padStart(2, '0')}`;
        
        // Tạo kết quả ngẫu nhiên (50% UP, 50% DOWN)
        const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
        
        const newSession = {
          sessionId,
          startTime: sessionStartTime,
          endTime: sessionEndTime,
          status: 'ACTIVE',
          result, // Kết quả được tạo sẵn
          totalTrades: 0,
          totalWins: 0,
          totalLosses: 0,
          totalWinAmount: 0,
          totalLossAmount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        newSessions.push(newSession);
      }

      // ✅ SỬ DỤNG ATOMIC OPERATIONS: bulkWrite với upsert để tránh race condition
      if (newSessions.length > 0) {
        const bulkOps = newSessions.map(session => ({
          updateOne: {
            filter: { sessionId: session.sessionId },
            update: { $setOnInsert: session },
            upsert: true
          }
        }));

        await db.collection('trading_sessions').bulkWrite(bulkOps);
        
        console.log(`✅ Đã tạo ${newSessions.length} phiên tương lai`);
      }
    }
  } catch (error) {
    console.error('Error generating future sessions:', error);
  } finally {
    // ✅ THÊM: Release lock
    isGeneratingSessions = false;
    console.log('🔓 Hoàn thành tạo phiên tương lai');
  }
}

// API để tạo lại 30 phiên tương lai (admin có thể gọi để refresh)
export async function POST(request: Request) {
  try {
    // Xác thực admin
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const adminUser = await verifyAdmin(token);
    
    if (!adminUser) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 });
    }

    const now = new Date();
    
    // ✅ THÊM: Kiểm tra lock trước khi xóa và tạo lại
    if (isGeneratingSessions) {
      return NextResponse.json({
        success: false,
        message: 'Đang tạo phiên, vui lòng thử lại sau'
      }, { status: 429 });
    }
    
    // Xóa tất cả phiên tương lai cũ
    await db.collection('trading_sessions').deleteMany({
      startTime: { $gt: now },
      status: 'ACTIVE'
    });

    // Tạo lại 30 phiên tương lai
    await generateFutureSessions(db, now);

    return NextResponse.json({
      success: true,
      message: 'Đã tạo lại 30 phiên tương lai thành công'
    });

  } catch (error) {
    console.error('Error regenerating future sessions:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
