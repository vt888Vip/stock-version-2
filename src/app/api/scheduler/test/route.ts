import { NextRequest, NextResponse } from 'next/server';
import { tradingScheduler } from '@/lib/scheduler/TradingScheduler';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, startTime, endTime, result } = await request.json();

    console.log('🧪 [SCHEDULER-TEST] Testing scheduler with:', {
      sessionId,
      startTime,
      endTime,
      result
    });

    // Test session creation
    const sessionInfo = await tradingScheduler.startSession(
      sessionId,
      new Date(startTime),
      new Date(endTime),
      result
    );

    return NextResponse.json({
      success: true,
      message: 'Scheduler test completed',
      data: sessionInfo
    });

  } catch (error) {
    console.error('❌ [SCHEDULER-TEST] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Scheduler test failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
