/**
 * Scheduler Service Main
 * Entry point và orchestration cho toàn bộ scheduler system
 */

import { tradingScheduler } from './TradingScheduler';
import { sessionLifecycleManager } from './SessionLifecycleManager';
import { preciseTimerService } from './PreciseTimerService';

export interface SchedulerServiceConfig {
  autoStart: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  metricsInterval: number;
}

export class SchedulerService {
  private config: SchedulerServiceConfig;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;

  constructor(config?: Partial<SchedulerServiceConfig>) {
    this.config = {
      autoStart: true,
      logLevel: 'info',
      metricsInterval: 5 * 60 * 1000, // 5 minutes
      ...config
    };
  }

  /**
   * Initialize scheduler service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {

      this.isInitialized = true;

      // Auto start if configured
      if (this.config.autoStart) {
        await this.start();
      }

    } catch (error) {
      console.error('❌ [SCHEDULER-SERVICE] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Start scheduler service
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start trading scheduler
    await tradingScheduler.start();

    // Start metrics logging
    this.startMetricsLogging();
  }

  /**
   * Stop scheduler service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {

      // Stop trading scheduler
      await tradingScheduler.stop();

      this.isRunning = false;

    } catch (error) {
      console.error('❌ [SCHEDULER-SERVICE] Error stopping service:', error);
      throw error;
    }
  }

  /**
   * Restart scheduler service
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Get service status
   */
  getStatus(): {
    isInitialized: boolean;
    isRunning: boolean;
    config: SchedulerServiceConfig;
    scheduler: any;
    lifecycle: any;
    timers: any;
  } {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      config: this.config,
      scheduler: tradingScheduler.getStatus(),
      lifecycle: sessionLifecycleManager.getStats(),
      timers: preciseTimerService.getStats()
    };
  }

  /**
   * Start metrics logging
   */
  private startMetricsLogging(): void {
    setInterval(() => {
      if (this.isRunning) {
        this.logMetrics();
      }
    }, this.config.metricsInterval);
  }

  /**
   * Log metrics
   */
  private logMetrics(): void {
    // Metrics logging disabled for cleaner console
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    details: any;
  }> {
    try {
      const status = this.getStatus();
      
      const healthy = status.isInitialized && 
                     status.isRunning && 
                     status.scheduler.isRunning &&
                     status.timers.isRunning;

      return {
        healthy,
        status: healthy ? 'healthy' : 'unhealthy',
        details: {
          service: {
            initialized: status.isInitialized,
            running: status.isRunning
          },
          scheduler: {
            running: status.scheduler.isRunning,
            uptime: status.scheduler.uptime
          },
          timers: {
            running: status.timers.isRunning,
            activeTimers: status.timers.activeTimers
          },
          lifecycle: {
            totalSessions: status.lifecycle.totalSessions,
            activeSessions: status.lifecycle.activeSessions
          }
        }
      };

    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    
    if (this.isRunning) {
      await this.stop();
    }

    // Cleanup individual services
    sessionLifecycleManager.cleanup();
    preciseTimerService.cleanup();

    this.isInitialized = false;
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();

// Auto-initialize when module is imported
if (typeof window === 'undefined') { // Only on server side
  schedulerService.initialize().catch(error => {
    console.error('❌ [SCHEDULER-SERVICE] Auto-initialization failed:', error);
  });
}
