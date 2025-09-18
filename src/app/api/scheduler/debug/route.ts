import { NextRequest, NextResponse } from 'next/server';
import { tradingScheduler } from '@/lib/scheduler/TradingScheduler';
import { schedulerService } from '@/lib/scheduler/SchedulerService';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [SCHEDULER-DEBUG] Checking scheduler status...');

    const schedulerStatus = {
      service: {
        isInitialized: schedulerService.getStatus().isInitialized,
        isRunning: schedulerService.getStatus().isRunning
      },
      tradingScheduler: {
        isRunning: tradingScheduler.running,
        metrics: tradingScheduler.getMetrics()
      }
    };

    console.log('🔍 [SCHEDULER-DEBUG] Status:', schedulerStatus);

    return NextResponse.json({
      success: true,
      message: 'Scheduler debug info',
      data: schedulerStatus
    });

  } catch (error) {
    console.error('❌ [SCHEDULER-DEBUG] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to get scheduler debug info',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
