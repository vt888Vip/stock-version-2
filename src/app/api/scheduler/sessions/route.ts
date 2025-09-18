import { NextRequest, NextResponse } from 'next/server';
import { tradingScheduler } from '@/lib/scheduler/TradingScheduler';

export interface SessionsResponse {
  success: boolean;
  data?: {
    sessions: Array<{
      sessionId: string;
      startTime: string;
      endTime: string;
      result: 'UP' | 'DOWN';
      status: string;
      schedulerStatus: string;
      tradeWindowOpen: boolean;
      settlementScheduled: boolean;
      settlementTime?: string;
    }>;
    total: number;
    active: number;
    completed: number;
  };
  message?: string;
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<SessionsResponse>> {
  try {
    console.log('📋 [SCHEDULER-API] Getting active sessions');

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get all active sessions
    const allSessions = await tradingScheduler.getActiveSessions();

    // Filter by status if provided
    let filteredSessions = allSessions;
    if (status) {
      filteredSessions = allSessions.filter(session => 
        session.status === status || session.schedulerStatus === status
      );
    }

    // Limit results
    const sessions = filteredSessions.slice(0, limit);

    // Count by status
    const total = allSessions.length;
    const active = allSessions.filter(s => s.status === 'ACTIVE' || s.status === 'TRADING').length;
    const completed = allSessions.filter(s => s.status === 'COMPLETED').length;

    const response: SessionsResponse = {
      success: true,
      data: {
        sessions: sessions.map(session => ({
          sessionId: session.sessionId,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime.toISOString(),
          result: session.result,
          status: session.status,
          schedulerStatus: session.schedulerStatus,
          tradeWindowOpen: session.tradeWindowOpen,
          settlementScheduled: session.settlementScheduled,
          settlementTime: session.settlementTime?.toISOString()
        })),
        total,
        active,
        completed
      }
    };

    console.log(`✅ [SCHEDULER-API] Retrieved ${sessions.length} sessions`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [SCHEDULER-API] Error getting sessions:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to get sessions',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
