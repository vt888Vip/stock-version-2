import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '31');

      const db = await getMongoDb();
      if (!db) {
        throw new Error('Could not connect to database');
      }

      const now = new Date();

      // Chỉ lấy 31 phiên bao gồm phiên hiện tại và các phiên tương lai
      // (KHÔNG bao gồm phiên đã hoàn thành để UI luôn thấy phiên sắp diễn ra)
      const sessions = await db.collection('trading_sessions')
        .find({
          $or: [
            // Future sessions (startTime > now)
            { startTime: { $gt: now }, status: 'PENDING' },
            // Current session (startTime <= now <= endTime)
            {
              startTime: { $lte: now },
              endTime: { $gte: now },
              status: { $in: ['ACTIVE', 'TRADING', 'SETTLING'] }
            }
          ]
        })
        .sort({ startTime: 1 })
        .limit(limit)
        .toArray();

      // Format sessions for frontend
      const formattedSessions = sessions.map(session => ({
        _id: session._id,
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        result: session.result,
        createdBy: session.createdBy || 'scheduler',
        totalTrades: session.totalTrades || 0,
        totalWins: session.totalWins || 0,
        totalLosses: session.totalLosses || 0,
        totalWinAmount: session.totalWinAmount || 0,
        totalLossAmount: session.totalLossAmount || 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        // Calculate time until session starts (negative if already started)
        timeUntilStart: Math.floor((session.startTime.getTime() - now.getTime()) / 1000),
        // Calculate time until session ends (for current sessions)
        timeUntilEnd: Math.max(0, Math.floor((session.endTime.getTime() - now.getTime()) / 1000))
      }));

      return NextResponse.json({
        success: true,
        data: {
          sessions: formattedSessions,
          total: formattedSessions.length,
          currentTime: now.toISOString()
        }
      });

    } catch (error) {
      console.error('Error fetching future sessions:', error);
      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
