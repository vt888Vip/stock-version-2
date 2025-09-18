import { NextRequest, NextResponse } from 'next/server';
import { schedulerService } from '@/lib/scheduler/SchedulerService';

export interface SchedulerHealthResponse {
  healthy: boolean;
  status: string;
  timestamp: string;
  details: {
    service: {
      initialized: boolean;
      running: boolean;
    };
    scheduler: {
      running: boolean;
      uptime: number;
    };
    timers: {
      running: boolean;
      activeTimers: number;
    };
    lifecycle: {
      totalSessions: number;
      activeSessions: number;
    };
  };
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<SchedulerHealthResponse>> {
  try {
    console.log('🏥 [SCHEDULER-HEALTH] Performing health check');

    const healthCheck = await schedulerService.healthCheck();

    const response: SchedulerHealthResponse = {
      healthy: healthCheck.healthy,
      status: healthCheck.status,
      timestamp: new Date().toISOString(),
      details: healthCheck.details
    };

    const statusCode = healthCheck.healthy ? 200 : 503;

    console.log(`✅ [SCHEDULER-HEALTH] Health check completed: ${healthCheck.status}`);

    return NextResponse.json(response, { status: statusCode });

  } catch (error) {
    console.error('❌ [SCHEDULER-HEALTH] Health check failed:', error);

    const response: SchedulerHealthResponse = {
      healthy: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      details: {
        service: {
          initialized: false,
          running: false
        },
        scheduler: {
          running: false,
          uptime: 0
        },
        timers: {
          running: false,
          activeTimers: 0
        },
        lifecycle: {
          totalSessions: 0,
          activeSessions: 0
        }
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    return NextResponse.json(response, { status: 503 });
  }
}
