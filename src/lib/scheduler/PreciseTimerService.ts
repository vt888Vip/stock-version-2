/**
 * Precise Timer Service
 * Quản lý timing chính xác đến millisecond
 */

export interface TimerCallback {
  (context: any): void;
}

export interface TimerContext {
  sessionId: string;
  type: 'trade_window' | 'settlement' | 'cleanup';
  data?: any;
}

export class PreciseTimerService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private interval: number = 100; // Check every 100ms for precision
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startPrecisionCheck();
  }

  /**
   * Schedule exact time execution
   */
  scheduleAt(exactTime: number, callback: TimerCallback, context: TimerContext): string {
    const timerId = `timer_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();
    const delay = exactTime - now;

    if (delay <= 0) {
      // Execute immediately
      callback(context);
      return timerId;
    }

    // Schedule with precise timing
    const timer = setTimeout(() => {
      callback(context);
      this.timers.delete(timerId);
    }, delay);

    this.timers.set(timerId, timer);
    return timerId;
  }

  /**
   * Schedule relative time execution
   */
  scheduleIn(delayMs: number, callback: TimerCallback, context: TimerContext): string {
    const exactTime = Date.now() + delayMs;
    return this.scheduleAt(exactTime, callback, context);
  }

  /**
   * Cancel timer
   */
  cancel(timerId: string): boolean {
    const timer = this.timers.get(timerId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(timerId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all timers for a session
   */
  cancelSessionTimers(sessionId: string): number {
    let cancelledCount = 0;
    for (const [timerId, timer] of this.timers) {
      if (timerId.includes(sessionId)) {
        clearTimeout(timer);
        this.timers.delete(timerId);
        cancelledCount++;
      }
    }
    return cancelledCount;
  }

  /**
   * Get all active timers
   */
  getActiveTimers(): Array<{ id: string; type: string; sessionId: string }> {
    const activeTimers: Array<{ id: string; type: string; sessionId: string }> = [];
    
    for (const timerId of this.timers.keys()) {
      // Parse timer info from ID (basic parsing)
      const parts = timerId.split('_');
      if (parts.length >= 3) {
        activeTimers.push({
          id: timerId,
          type: 'unknown',
          sessionId: 'unknown'
        });
      }
    }
    
    return activeTimers;
  }

  /**
   * Start precision check to ensure timers execute on time
   */
  private startPrecisionCheck(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.checkInterval = setInterval(() => {
      this.checkPrecision();
    }, this.interval);
  }

  /**
   * Stop precision check
   */
  stopPrecisionCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Check timer precision
   */
  private checkPrecision(): void {
    // This method can be extended to add precision monitoring
    // For now, it just ensures the service is running
  }

  /**
   * Cleanup all timers
   */
  cleanup(): void {
    for (const [timerId, timer] of this.timers) {
      clearTimeout(timer);
    }
    
    this.timers.clear();
    this.stopPrecisionCheck();
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeTimers: number;
    isRunning: boolean;
    precisionInterval: number;
  } {
    return {
      activeTimers: this.timers.size,
      isRunning: this.isRunning,
      precisionInterval: this.interval
    };
  }
}

// Singleton instance
export const preciseTimerService = new PreciseTimerService();
