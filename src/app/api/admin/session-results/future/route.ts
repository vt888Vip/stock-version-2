import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '30');

      const db = await getMongoDb();
      if (!db) {
        throw new Error('Could not connect to database');
      }

      const now = new Date();

      // Get future sessions (PENDING status, startTime > now)
      const futureSessions = await db.collection('trading_sessions')
        .find({
          startTime: { $gt: now },
          status: 'PENDING'
        })
        .sort({ startTime: 1 }) // Sort by start time ascending (earliest first)
        .limit(limit)
        .toArray();

      // Format sessions for frontend
      const formattedSessions = futureSessions.map(session => ({
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
        // Calculate time until session starts
        timeUntilStart: Math.max(0, Math.floor((session.startTime.getTime() - now.getTime()) / 1000))
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
