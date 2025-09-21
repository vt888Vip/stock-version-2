import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const { count = 30 } = await request.json();

      const db = await getMongoDb();
      if (!db) {
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
      }

      const now = new Date();
      
      // Xóa tất cả phiên tương lai hiện tại
      await db.collection('trading_sessions').deleteMany({
        startTime: { $gt: now }
      });

      // Tạo lại phiên tương lai
      await createFutureSessions(db, now, count);

      return NextResponse.json({
        success: true,
        message: `Đã tạo lại ${count} phiên giao dịch tương lai`
      });

    } catch (error) {
      console.error('Error regenerating future sessions:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Hàm tạo phiên giao dịch tương lai
async function createFutureSessions(db: any, startTime: Date, targetCount: number = 30) {
  const now = new Date();
  const sessions = [];
  let createdCount = 0;
  let i = 0;

  while (createdCount < targetCount && i < 100) {
    const sessionStartTime = new Date(startTime.getTime() + (i + 1) * 60000);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 60000);
    const sessionId = generateSessionId(sessionStartTime);

    // Tự động tạo kết quả cho phiên tương lai (50% UP, 50% DOWN)
    const random = Math.random();
    const autoResult = random < 0.5 ? 'UP' : 'DOWN';
    
    sessions.push({
      sessionId,
      startTime: sessionStartTime,
      endTime: sessionEndTime,
      status: 'PENDING',           // ✅ Tương thích với Scheduler
      result: autoResult,
      schedulerStatus: 'PENDING',  // ✅ Thêm field cho Scheduler
      tradeWindowOpen: false,      // ✅ Thêm field cho trade window
      settlementScheduled: false,  // ✅ Thêm field cho settlement
      processingComplete: false,   // ✅ Thêm field cho processing
      totalTrades: 0,             // ✅ Thêm field cho stats
      totalWins: 0,               // ✅ Thêm field cho stats
      totalLosses: 0,             // ✅ Thêm field cho stats
      totalWinAmount: 0,          // ✅ Thêm field cho stats
      totalLossAmount: 0,         // ✅ Thêm field cho stats
      createdBy: 'admin',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    createdCount++;
    i++;
  }

  if (sessions.length > 0) {
    await db.collection('trading_sessions').insertMany(sessions);
    console.log(`✅ Đã tạo ${sessions.length} phiên tương lai mới`);
  }
}

// Hàm tạo sessionId
function generateSessionId(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}${minute}`;
}

