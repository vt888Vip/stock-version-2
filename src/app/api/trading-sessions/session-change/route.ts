import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

// API để theo dõi sự thay đổi phiên và tạo phiên mới với kết quả có sẵn
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const now = new Date();
    const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
    const nextMinute = new Date(currentMinute.getTime() + 60000);

    // Tạo sessionId cho phiên hiện tại
    const sessionId = `${currentMinute.getUTCFullYear()}${String(currentMinute.getUTCMonth() + 1).padStart(2, '0')}${String(currentMinute.getUTCDate()).padStart(2, '0')}${String(currentMinute.getUTCHours()).padStart(2, '0')}${String(currentMinute.getUTCMinutes()).padStart(2, '0')}`;

    // Lấy phiên hiện tại từ database
    let currentSession = await db.collection('trading_sessions').findOne({ 
      sessionId: sessionId,
      status: { $in: ['ACTIVE', 'COMPLETED'] }
    });

    // Kiểm tra xem phiên hiện tại có kết thúc chưa
    const sessionEnded = currentSession && currentSession.endTime <= now;
    const sessionChanged = sessionEnded || !currentSession;

    if (sessionChanged) {
      // Tạo phiên mới nếu cần
      if (!currentSession || sessionEnded) {
        // Tạo kết quả ngẫu nhiên (50% UP, 50% DOWN)
        const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
        
        const newSession = {
          sessionId,
          startTime: currentMinute,
          endTime: nextMinute,
          status: 'ACTIVE',
          result, // Kết quả được tạo sẵn
          totalTrades: 0,
          totalWins: 0,
          totalLosses: 0,
          totalWinAmount: 0,
          totalLossAmount: 0,
          createdAt: now,
          updatedAt: now
        };

        // Sử dụng upsert để tránh tạo trùng lặp
        await db.collection('trading_sessions').updateOne(
          { sessionId },
          { $setOnInsert: newSession },
          { upsert: true }
        );
        
        currentSession = newSession as any;
        console.log(`✅ Đã tạo phiên mới ${sessionId} với kết quả: ${result}`);
      }
    }

    // Tính thời gian còn lại
    const timeLeft = Math.max(0, Math.floor((nextMinute.getTime() - now.getTime()) / 1000));

    return NextResponse.json({
      success: true,
      sessionChanged,
      currentSession: {
        sessionId: currentSession?.sessionId || sessionId,
        startTime: currentSession?.startTime || currentMinute,
        endTime: currentSession?.endTime || nextMinute,
        timeLeft,
        status: currentSession?.status || 'ACTIVE',
        result: currentSession?.result || null
      },
      serverTime: now.toISOString()
    });

  } catch (error) {
    console.error('Lỗi khi theo dõi thay đổi phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
} 