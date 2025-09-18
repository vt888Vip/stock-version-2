import { NextRequest, NextResponse } from 'next/server';
import { schedulerService } from '@/lib/scheduler/SchedulerService';

export interface SchedulerInitResponse {
  success: boolean;
  message?: string;
  data?: {
    isInitialized: boolean;
    isRunning: boolean;
    status: any;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<SchedulerInitResponse>> {
  try {
    console.log('🔄 [SCHEDULER-INIT] Initializing scheduler service');

    // Initialize scheduler service
    await schedulerService.initialize();

    // Get status
    const status = schedulerService.getStatus();

    console.log('✅ [SCHEDULER-INIT] Scheduler service initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Scheduler service initialized successfully',
      data: {
        isInitialized: status.isInitialized,
        isRunning: status.isRunning,
        status: status
      }
    });

  } catch (error) {
    console.error('❌ [SCHEDULER-INIT] Error initializing scheduler:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to initialize scheduler service',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<SchedulerInitResponse>> {
  try {
    console.log('📊 [SCHEDULER-INIT] Getting scheduler service status');

    const status = schedulerService.getStatus();

    return NextResponse.json({
      success: true,
      data: {
        isInitialized: status.isInitialized,
        isRunning: status.isRunning,
        status: status
      }
    });

  } catch (error) {
    console.error('❌ [SCHEDULER-INIT] Error getting status:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to get scheduler status',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
