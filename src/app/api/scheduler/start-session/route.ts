import { NextRequest, NextResponse } from 'next/server';
import { tradingScheduler } from '@/lib/scheduler/TradingScheduler';

export interface StartSessionRequest {
  sessionId: string;
  startTime: string;
  endTime: string;
  result?: 'UP' | 'DOWN';
}

export interface StartSessionResponse {
  success: boolean;
  message?: string;
  data?: {
    sessionId: string;
    startTime: string;
    endTime: string;
    result: 'UP' | 'DOWN';
    status: string;
    schedulerStatus: string;
    tradeWindowOpen: boolean;
    settlementScheduled: boolean;
    settlementTime?: string;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<StartSessionResponse>> {
  try {
    console.log('🔄 [SCHEDULER-API] Starting new session');

    const body: StartSessionRequest = await request.json();
    const { sessionId, startTime, endTime, result } = body;

    // Validation
    if (!sessionId || !startTime || !endTime) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Missing required fields: sessionId, startTime, endTime' 
        },
        { status: 400 }
      );
    }

    // Parse dates
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid date format' 
        },
        { status: 400 }
      );
    }

    if (startDate >= endDate) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Start time must be before end time' 
        },
        { status: 400 }
      );
    }

    // Generate result if not provided
    const sessionResult = result || (Math.random() < 0.5 ? 'UP' : 'DOWN');

    // Start session
    const sessionInfo = await tradingScheduler.startSession(
      sessionId,
      startDate,
      endDate,
      sessionResult
    );

    console.log(`✅ [SCHEDULER-API] Session ${sessionId} started successfully`);

    return NextResponse.json({
      success: true,
      message: 'Session started successfully',
      data: {
        sessionId: sessionInfo.sessionId,
        startTime: sessionInfo.startTime.toISOString(),
        endTime: sessionInfo.endTime.toISOString(),
        result: sessionInfo.result,
        status: sessionInfo.status,
        schedulerStatus: sessionInfo.schedulerStatus,
        tradeWindowOpen: sessionInfo.tradeWindowOpen,
        settlementScheduled: sessionInfo.settlementScheduled,
        settlementTime: sessionInfo.settlementTime?.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [SCHEDULER-API] Error starting session:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to start session',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'SessionId is required' 
        },
        { status: 400 }
      );
    }

    const sessionInfo = await tradingScheduler.getSessionInfo(sessionId);

    if (!sessionInfo) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Session not found' 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionInfo.sessionId,
        startTime: sessionInfo.startTime.toISOString(),
        endTime: sessionInfo.endTime.toISOString(),
        result: sessionInfo.result,
        status: sessionInfo.status,
        schedulerStatus: sessionInfo.schedulerStatus,
        tradeWindowOpen: sessionInfo.tradeWindowOpen,
        settlementScheduled: sessionInfo.settlementScheduled,
        settlementTime: sessionInfo.settlementTime?.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [SCHEDULER-API] Error getting session info:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to get session info',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
