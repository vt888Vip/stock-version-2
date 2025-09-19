import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '50');
      const skip = (page - 1) * limit;

      const db = await getMongoDb();
      if (!db) {
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
      }

      const now = new Date();
      
      // Lấy lịch sử phiên đã kết thúc
      const historySessions = await db.collection('trading_sessions')
        .find({
          endTime: { $lt: now }
        })
        .sort({ endTime: -1 }) // Mới nhất trước
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await db.collection('trading_sessions')
        .countDocuments({
          endTime: { $lt: now }
        });

      // Thống kê lịch sử
      const upCount = historySessions.filter(s => s.result === 'UP').length;
      const downCount = historySessions.filter(s => s.result === 'DOWN').length;
      const totalTrades = historySessions.reduce((sum, s) => sum + (s.totalTrades || 0), 0);
      const totalWins = historySessions.reduce((sum, s) => sum + (s.totalWins || 0), 0);
      const totalLosses = historySessions.reduce((sum, s) => sum + (s.totalLosses || 0), 0);

      return NextResponse.json({
        success: true,
        data: {
          sessions: historySessions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          },
          stats: {
            totalSessions: historySessions.length,
            upResults: upCount,
            downResults: downCount,
            totalTrades,
            totalWins,
            totalLosses,
            winRate: totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(2) : 0
          }
        }
      });

    } catch (error) {
      console.error('Error getting session history:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
