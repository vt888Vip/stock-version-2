import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const db = await getMongoDb();
      if (!db) {
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
      }

      const now = new Date();
      
      // Thống kê phiên tương lai
      const futureSessions = await db.collection('trading_sessions')
        .find({
          startTime: { $gt: now }
        })
        .sort({ startTime: 1 })
        .toArray();

      // Thống kê kết quả
      const upCount = futureSessions.filter(s => s.result === 'UP').length;
      const downCount = futureSessions.filter(s => s.result === 'DOWN').length;
      const pendingCount = futureSessions.filter(s => !s.result).length;

      // Thống kê theo thời gian
      const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const next24hCount = futureSessions.filter(s => s.startTime <= next24Hours).length;
      const nextWeekCount = futureSessions.filter(s => s.startTime <= nextWeek).length;

      // Phiên gần nhất
      const nextSession = futureSessions[0];
      const timeUntilNext = nextSession ? nextSession.startTime.getTime() - now.getTime() : 0;

      return NextResponse.json({
        success: true,
        data: {
          total: futureSessions.length,
          results: {
            up: upCount,
            down: downCount,
            pending: pendingCount
          },
          timeframes: {
            next24Hours: next24hCount,
            nextWeek: nextWeekCount
          },
          nextSession: nextSession ? {
            sessionId: nextSession.sessionId,
            startTime: nextSession.startTime.toISOString(),
            result: nextSession.result,
            timeUntilStart: timeUntilNext
          } : null,
          note: "Thống kê dựa trên các phiên đã được Scheduler tạo"
        }
      });

    } catch (error) {
      console.error('Error getting future sessions stats:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

