import { NextRequest, NextResponse } from 'next/server';
import { tradingScheduler } from '@/lib/scheduler/TradingScheduler';
import { sessionLifecycleManager } from '@/lib/scheduler/SessionLifecycleManager';
import { preciseTimerService } from '@/lib/scheduler/PreciseTimerService';

export interface SchedulerStatusResponse {
  success: boolean;
  data?: {
    scheduler: {
      isRunning: boolean;
      uptime: number;
      config: {
        tradeWindowDuration: number;
        settlementDelay: number;
        cleanupDelay: number;
      };
      metrics: {
        totalSessions: number;
        activeSessions: number;
        completedSessions: number;
        failedSettlements: number;
        averageSettlementTime: number;
      };
    };
    lifecycle: {
      totalSessions: number;
      activeSessions: number;
      tradingSessions: number;
      settlingSessions: number;
      completedSessions: number;
    };
    timers: {
      activeTimers: number;
      isRunning: boolean;
      precisionInterval: number;
    };
    server: {
      timestamp: string;
      timezone: string;
    };
  };
  message?: string;
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<SchedulerStatusResponse>> {
  try {
    console.log('📊 [SCHEDULER-API] Getting scheduler status');

    // Get scheduler status
    const schedulerStatus = tradingScheduler.getStatus();
    
    // Get lifecycle stats
    const lifecycleStats = sessionLifecycleManager.getStats();
    
    // Get timer stats
    const timerStats = preciseTimerService.getStats();

    // Get active sessions
    const activeSessions = await tradingScheduler.getActiveSessions();

    const response: SchedulerStatusResponse = {
      success: true,
      data: {
        scheduler: {
          isRunning: schedulerStatus.isRunning,
          uptime: schedulerStatus.uptime,
          config: {
            tradeWindowDuration: schedulerStatus.config.tradeWindowDuration,
            settlementDelay: schedulerStatus.config.settlementDelay,
            cleanupDelay: schedulerStatus.config.cleanupDelay
          },
          metrics: {
            totalSessions: schedulerStatus.metrics.totalSessions,
            activeSessions: schedulerStatus.metrics.activeSessions,
            completedSessions: schedulerStatus.metrics.completedSessions,
            failedSettlements: schedulerStatus.metrics.failedSettlements,
            averageSettlementTime: schedulerStatus.metrics.averageSettlementTime
          }
        },
        lifecycle: {
          totalSessions: lifecycleStats.totalSessions,
          activeSessions: lifecycleStats.activeSessions,
          tradingSessions: lifecycleStats.tradingSessions,
          settlingSessions: lifecycleStats.settlingSessions,
          completedSessions: lifecycleStats.completedSessions
        },
        timers: {
          activeTimers: timerStats.activeTimers,
          isRunning: timerStats.isRunning,
          precisionInterval: timerStats.precisionInterval
        },
        server: {
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      }
    };

    console.log('✅ [SCHEDULER-API] Status retrieved successfully');

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [SCHEDULER-API] Error getting status:', error);
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
