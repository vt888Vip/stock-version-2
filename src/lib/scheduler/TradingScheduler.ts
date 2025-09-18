/**
 * Trading Scheduler Service
 * Core service quản lý timing và lifecycle của trading sessions
 */

import { getMongoDb } from '../db';
import { publishSettlementMessage } from '../rabbitmq';
import { preciseTimerService, TimerContext } from './PreciseTimerService';
import { sessionLifecycleManager, SessionState } from './SessionLifecycleManager';

export interface SchedulerConfig {
  tradeWindowDuration: number; // 60 seconds
  settlementDelay: number; // 48 seconds after session end
  cleanupDelay: number; // 12 seconds after settlement
}

export interface SessionInfo {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  result: 'UP' | 'DOWN';
  status: string;
  schedulerStatus: string;
  tradeWindowOpen: boolean;
  settlementScheduled: boolean;
  settlementTime?: Date;
}

export class TradingScheduler {
  private config: SchedulerConfig;
  private isRunning: boolean = false;
  private metrics: {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    failedSettlements: number;
    averageSettlementTime: number;
    uptime: number;
  };

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = {
      tradeWindowDuration: 60 * 1000, // 60 seconds
      settlementDelay: 12 * 1000, // 12 seconds - tạo cảm giác kịch tính
      cleanupDelay: 12 * 1000, // 12 seconds
      ...config
    };

    this.metrics = {
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      failedSettlements: 0,
      averageSettlementTime: 0,
      uptime: Date.now()
    };
  }

  /**
   * Get running status
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: this.isRunning ? Date.now() - this.metrics.uptime : 0
    };
  }

  /**
   * Start scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.metrics.uptime = Date.now();

    // ✅ RECOVERY: Load existing sessions from database
    await this.recoverExistingSessions();

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Stop scheduler service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    preciseTimerService.cleanup();
    sessionLifecycleManager.cleanup();
  }

  /**
   * Create and start a new session
   */
  async startSession(sessionId: string, startTime: Date, endTime: Date, result: 'UP' | 'DOWN'): Promise<SessionInfo> {
    console.log(`🔄 [SCHEDULER] Start time: ${startTime.toISOString()}`);
    console.log(`🔄 [SCHEDULER] End time: ${endTime.toISOString()}`);
    try {
      // 1. Create session in database
      try {
        await this.createSessionInDatabase(sessionId, startTime, endTime, result);
      } catch (dbError) {
        console.error(`❌ [SCHEDULER] Step 1 failed: Database error:`, dbError);
        throw new Error(`Failed to create session in database: ${dbError.message}`);
      }

      // 2. Initialize session state
      try {
        await sessionLifecycleManager.initializeSession(sessionId, startTime, endTime);
      } catch (stateError) {
        console.error(`❌ [SCHEDULER] Step 2 failed: State error:`, stateError);
        throw new Error(`Failed to initialize session state: ${stateError.message}`);
      }

      // 3. Schedule trade window
      try {
        this.scheduleTradeWindow(sessionId, startTime);
      } catch (timerError) {
        console.error(`❌ [SCHEDULER] Step 3 failed: Timer error:`, timerError);
        throw new Error(`Failed to schedule trade window: ${timerError.message}`);
      }

      // 4. Schedule settlement with 12s delay for dramatic effect
      let settlementTime: Date;
      try {
        settlementTime = new Date(endTime.getTime() + this.config.settlementDelay); // 12s delay
        this.scheduleSettlement(sessionId, settlementTime);
      } catch (settlementError) {
        console.error(`❌ [SCHEDULER] Step 4 failed: Settlement error:`, settlementError);
        throw new Error(`Failed to setup settlement: ${settlementError.message}`);
      }

      // 5. Schedule cleanup
      try {
        const cleanupTime = new Date(settlementTime.getTime() + this.config.cleanupDelay);
        this.scheduleCleanup(sessionId, cleanupTime);
      } catch (cleanupError) {
        console.error(`❌ [SCHEDULER] Step 5 failed: Cleanup error:`, cleanupError);
        throw new Error(`Failed to schedule cleanup: ${cleanupError.message}`);
      }

      // 6. Update metrics
      this.metrics.totalSessions++;
      this.metrics.activeSessions++;

      const sessionInfo: SessionInfo = {
        sessionId,
        startTime,
        endTime,
        result,
        status: 'PENDING',
        schedulerStatus: 'PENDING',
        tradeWindowOpen: false,
        settlementScheduled: false,
        settlementTime
      };
      return sessionInfo;

    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to start session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule trade window
   */
  private scheduleTradeWindow(sessionId: string, startTime: Date): void {
    const context: TimerContext = {
      sessionId,
      type: 'trade_window',
      data: { startTime }
    };

    preciseTimerService.scheduleAt(
      startTime.getTime(),
      this.handleTradeWindowOpen.bind(this),
      context
    );

  }

  /**
   * Schedule settlement
   */
  private scheduleSettlement(sessionId: string, settlementTime: Date): void {
    const context: TimerContext = {
      sessionId,
      type: 'settlement',
      data: { settlementTime }
    };

    preciseTimerService.scheduleAt(
      settlementTime.getTime(),
      this.handleSettlement.bind(this),
      context
    );

  }

  /**
   * Schedule cleanup
   */
  private scheduleCleanup(sessionId: string, cleanupTime: Date): void {
    const context: TimerContext = {
      sessionId,
      type: 'cleanup',
      data: { cleanupTime }
    };

    preciseTimerService.scheduleAt(
      cleanupTime.getTime(),
      this.handleCleanup.bind(this),
      context
    );

  }

  /**
   * Handle trade window open
   */
  private async handleTradeWindowOpen(context: TimerContext): Promise<void> {
    const { sessionId } = context;
    try {
      await sessionLifecycleManager.transitionToActive(sessionId);
      this.notifyFrontend(sessionId, 'session:trade_window:opened', {
        sessionId,
        tradeWindowOpen: true,
        timeLeft: this.config.tradeWindowDuration / 1000
      });
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to open trade window for session ${sessionId}:`, error);
    }
  }

  /**
   * Handle settlement
   */
  private async handleSettlement(context: TimerContext): Promise<void> {
    const { sessionId } = context;
    const now = new Date();
    console.log(`🎯 [SCHEDULER] Settlement triggered for ${sessionId} at ${now.toISOString()}`);
    
    try {
      // 1. Transition to settling state
      const settlementTime = new Date();
      await sessionLifecycleManager.transitionToSettling(sessionId, settlementTime);

      // 2. Get session info
      const session = await this.getSessionFromDatabase(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // 3. Get pending trades
      const pendingTrades = await this.getPendingTrades(sessionId);
      if (pendingTrades.length === 0) {
        await sessionLifecycleManager.transitionToCompleted(sessionId);
        return;
      }

      // 4. Send settlement message to RabbitMQ
      const settlementData = {
        id: `scheduler_settlement_${sessionId}_${Date.now()}`,
        sessionId,
        result: session.result,
        timestamp: new Date().toISOString(),
        source: 'scheduler',
        tradeCount: pendingTrades.length
      };

      const success = await publishSettlementMessage(settlementData);
      
      if (success) {
        this.notifyFrontend(sessionId, 'session:settlement:triggered', {
          sessionId,
          result: session.result,
          tradeCount: pendingTrades.length
        });
      } else {
        console.error(`❌ [SCHEDULER] Failed to send settlement message for session ${sessionId}`);
        console.error(`❌ [SCHEDULER] ===== SETTLEMENT FAILED =====`);
        this.metrics.failedSettlements++;
      }

    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to trigger settlement for session ${sessionId}:`, error);
      this.metrics.failedSettlements++;
    }
  }

  /**
   * Handle cleanup
   */
  private async handleCleanup(context: TimerContext): Promise<void> {
    const { sessionId } = context;
    try {
      await sessionLifecycleManager.transitionToCompleted(sessionId);
      
      // Cancel all timers for this session
      preciseTimerService.cancelSessionTimers(sessionId);

      // Update metrics
      this.metrics.activeSessions--;
      this.metrics.completedSessions++;

      this.notifyFrontend(sessionId, 'session:completed', {
        sessionId,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to cleanup session ${sessionId}:`, error);
    }
  }

  /**
   * Create session in database
   */
  private async createSessionInDatabase(sessionId: string, startTime: Date, endTime: Date, result: 'UP' | 'DOWN'): Promise<void> {
    try {
      const db = await getMongoDb();
      if (!db) {
        throw new Error('Database connection failed');
      }
      const session = {
        sessionId,
        startTime,
        endTime,
        status: 'PENDING',
        result,
        schedulerStatus: 'PENDING',
        tradeWindowOpen: false,
        settlementScheduled: false,
        processingComplete: false,
        totalTrades: 0,
        totalWins: 0,
        totalLosses: 0,
        totalWinAmount: 0,
        totalLossAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result_operation = await db.collection('trading_sessions').updateOne(
        { sessionId },
        { $setOnInsert: session },
        { upsert: true }
      );
      if (result_operation.upsertedCount > 0) {
      } else if (result_operation.matchedCount > 0) {
      } else {
      }
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to create session ${sessionId} in database:`, error);
      throw error;
    }
  }

  /**
   * Get session from database
   */
  private async getSessionFromDatabase(sessionId: string): Promise<any> {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Database connection failed');
    }

    return await db.collection('trading_sessions').findOne({ sessionId });
  }

  /**
   * Get pending trades for session
   */
  private async getPendingTrades(sessionId: string): Promise<any[]> {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Database connection failed');
    }

    return await db.collection('trades').find({
      sessionId,
      status: 'pending'
    }).toArray();
  }

  /**
   * Update session settlement info in database
   */
  private async updateSessionSettlementInfo(sessionId: string, settlementTime: Date): Promise<void> {
    try {
      const db = await getMongoDb();
      if (!db) {
        throw new Error('Database connection failed');
      }

      await db.collection('trading_sessions').updateOne(
        { sessionId },
        { 
          $set: { 
            settlementScheduled: true,
            settlementTime: settlementTime,
            lastSchedulerUpdate: new Date()
          } 
        }
      );

      console.log(`💾 [SCHEDULER] Updated settlement info for session ${sessionId}: ${settlementTime.toISOString()}`);
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to update settlement info for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get current active session ID (latest)
   */
  private getCurrentSessionId(): string | null {
    const activeSessions = sessionLifecycleManager.getActiveSessions();
    let currentSessionId = null;
    let latestStartTime = 0;
    
    // Tìm trong memory trước
    for (const [sessionId, session] of activeSessions) {
      if (session.status === 'ACTIVE' || session.status === 'TRADING') {
        const year = sessionId.substring(0, 4);
        const month = sessionId.substring(4, 6);
        const day = sessionId.substring(6, 8);
        const hour = sessionId.substring(8, 10);
        const minute = sessionId.substring(10, 12);
        
        const sessionStartTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`);
        
        if (sessionStartTime.getTime() > latestStartTime) {
          latestStartTime = sessionStartTime.getTime();
          currentSessionId = sessionId;
        }
      }
    }
    
    // Nếu không tìm thấy trong memory, tính toán session hiện tại
    if (!currentSessionId) {
      const now = new Date();
      const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
      currentSessionId = `${currentMinute.getUTCFullYear()}${String(currentMinute.getUTCMonth() + 1).padStart(2, '0')}${String(currentMinute.getUTCDate()).padStart(2, '0')}${String(currentMinute.getUTCHours()).padStart(2, '0')}${String(currentMinute.getUTCMinutes()).padStart(2, '0')}`;
      
    }
    
    return currentSessionId;
  }

  /**
   * Send timer update to frontend
   */
  private sendTimerUpdate(sessionId: string, timeLeft: number): void {
    this.notifyFrontend(sessionId, 'session:timer:update', {
      sessionId,
      timeLeft,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Notify frontend
   */
  private notifyFrontend(sessionId: string, event: string, data: any): void {
    // Send event to socket server
    try {
      const socketData = {
        sessionId,
        ...data,
        timestamp: new Date().toISOString()
      };

      // Send to socket server
      
      fetch('http://localhost:3001/emit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: 'all', // Broadcast to all users
          event: event,
          data: socketData
        })
      }).then(response => {
        if (response.ok) {
        } else {
          console.error(`❌ [SCHEDULER] Failed to send event ${event} to frontend:`, response.status, response.statusText);
        }
      }).catch(error => {
        console.error(`❌ [SCHEDULER] Error sending event ${event} to frontend:`, error);
      });
    } catch (error) {
      console.error(`❌ [SCHEDULER] Error notifying frontend:`, error);
    }
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    // Log metrics every 5 minutes
    setInterval(() => {
      this.logMetrics();
    }, 5 * 60 * 1000);

    // ✅ TIMER UPDATES: Send timer updates every second
    setInterval(() => {
      this.sendTimerUpdates();
    }, 1000);

    // ✅ AUTO-RECOVERY: Check and recover sessions every 10 seconds
    setInterval(() => {
      this.autoRecovery();
    }, 10 * 1000);
  }

  /**
   * Send timer updates for current session only
   */
  private sendTimerUpdates(): void {
    const now = new Date();
    const activeSessions = sessionLifecycleManager.getActiveSessions();

    // ✅ FIX: Chỉ gửi timer updates cho session hiện tại (mới nhất)
    const currentSessionId = this.getCurrentSessionId();
    
    if (!currentSessionId) {
      return;
    }
    
    // Chỉ gửi timer update cho session hiện tại
    const year = currentSessionId.substring(0, 4);
    const month = currentSessionId.substring(4, 6);
    const day = currentSessionId.substring(6, 8);
    const hour = currentSessionId.substring(8, 10);
    const minute = currentSessionId.substring(10, 12);
    
    const sessionStartTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 60000); // +1 minute
    
    const timeLeft = Math.max(0, Math.floor((sessionEndTime.getTime() - now.getTime()) / 1000));

    if (timeLeft > 0) {
      this.sendTimerUpdate(currentSessionId, timeLeft);
    } else {
      // ✅ FIX: Session đã kết thúc, chuyển sang SETTLING
      this.handleSessionEnd(currentSessionId);
    }
  }

  /**
   * Handle session end - transition to SETTLING
   */
  private async handleSessionEnd(sessionId: string): Promise<void> {
    try {
      // Get session info
      const session = await this.getSessionFromDatabase(sessionId);
      if (!session) {
        console.error(`❌ [SCHEDULER] Session not found: ${sessionId}`);
        return;
      }
      
      // Calculate settlement time (12s delay)
      const sessionEndTime = new Date(session.endTime);
      const settlementTime = new Date(sessionEndTime.getTime() + this.config.settlementDelay);

      // Transition to SETTLING (settlement will be triggered by scheduled timer)
      await sessionLifecycleManager.transitionToSettling(sessionId, settlementTime);
      
      // Schedule settlement with 12s delay
      this.scheduleSettlement(sessionId, settlementTime);
      
      // Update database
      await this.updateSessionSettlementInfo(sessionId, settlementTime);
      
      // Notify frontend
      this.notifyFrontend(sessionId, 'session:trade_window:closed', {
        sessionId,
        tradeWindowOpen: false,
        settlementTime: settlementTime.toISOString()
      });
      
      // ✅ AUTO-CREATE NEW SESSION: Tự động tạo session mới
      await this.createNextSession();
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to handle session end for ${sessionId}:`, error);
    }
  }

  /**
   * Create next session automatically
   */
  private async createNextSession(): Promise<void> {
    try {
      const now = new Date();
      const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
      const nextMinute = new Date(currentMinute.getTime() + 60000);
      
      // Tạo sessionId cho phiên tiếp theo
      const nextSessionId = `${nextMinute.getUTCFullYear()}${String(nextMinute.getUTCMonth() + 1).padStart(2, '0')}${String(nextMinute.getUTCDate()).padStart(2, '0')}${String(nextMinute.getUTCHours()).padStart(2, '0')}${String(nextMinute.getUTCMinutes()).padStart(2, '0')}`;
      console.log(`🔄 [SCHEDULER] Start Time: ${nextMinute.toISOString()}`);
      console.log(`🔄 [SCHEDULER] End Time: ${new Date(nextMinute.getTime() + 60000).toISOString()}`);
      
      // Kiểm tra xem session đã tồn tại chưa
      const existingSession = await this.getSessionFromDatabase(nextSessionId);
      if (existingSession) {
        return;
      }
      
      // Tạo session mới
      const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
      const sessionInfo = await this.startSession(
        nextSessionId,
        nextMinute,
        new Date(nextMinute.getTime() + 60000),
        result
      );
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to create next session:`, error);
    }
  }

  /**
   * Auto recovery mechanism
   */
  private async autoRecovery(): Promise<void> {
    try {
      const activeSessions = sessionLifecycleManager.getActiveSessions();
      const currentSessionId = this.getCurrentSessionId();
      
      // Nếu không có active sessions, thử recovery từ database
      if (activeSessions.size === 0) {
        await this.recoverExistingSessions();
      }
      
      // Nếu có current session nhưng không có trong memory, recovery nó
      if (currentSessionId && !activeSessions.has(currentSessionId)) {
        await this.recoverSessionFromDatabase(currentSessionId);
      }
      
    } catch (error) {
      console.error(`❌ [SCHEDULER] Auto-recovery failed:`, error);
    }
  }

  /**
   * Recover single session from database
   */
  private async recoverSessionFromDatabase(sessionId: string): Promise<void> {
    try {
      const session = await this.getSessionFromDatabase(sessionId);
      if (!session) {
        return;
      }
      await this.recoverSession(session);
      
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to recover session ${sessionId}:`, error);
    }
  }

  /**
   * Update metrics from lifecycle manager
   */
  private updateMetricsFromLifecycle(): void {
    const lifecycleStats = sessionLifecycleManager.getStats();
    
    this.metrics.totalSessions = lifecycleStats.totalSessions;
    this.metrics.activeSessions = lifecycleStats.activeSessions;
    this.metrics.completedSessions = lifecycleStats.completedSessions;
    
  }

  /**
   * Log metrics
   */
  private logMetrics(): void {
    const uptime = Math.floor((Date.now() - this.metrics.uptime) / 1000);
    const lifecycleStats = sessionLifecycleManager.getStats();
    const timerStats = preciseTimerService.getStats();
  }

  /**
   * Get session info
   */
  async getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.getSessionFromDatabase(sessionId);
    if (!session) {
      return null;
    }

    const state = sessionLifecycleManager.getSessionState(sessionId);

    return {
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      result: session.result,
      status: session.status,
      schedulerStatus: session.schedulerStatus || 'PENDING',
      tradeWindowOpen: session.tradeWindowOpen || false,
      settlementScheduled: session.settlementScheduled || false,
      settlementTime: session.settlementTime
    };
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Database connection failed');
    }

    const sessions = await db.collection('trading_sessions').find({
      schedulerStatus: { $in: ['PENDING', 'ACTIVE', 'SETTLED'] }
    }).toArray();

    return sessions.map(session => ({
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      result: session.result,
      status: session.status,
      schedulerStatus: session.schedulerStatus || 'PENDING',
      tradeWindowOpen: session.tradeWindowOpen || false,
      settlementScheduled: session.settlementScheduled || false,
      settlementTime: session.settlementTime
    }));
  }

  /**
   * Recover existing sessions from database
   */
  private async recoverExistingSessions(): Promise<void> {
    try {
      const db = await getMongoDb();
      if (!db) {
        console.error('❌ [SCHEDULER] Database connection failed during recovery');
        return;
      }

      // Find active sessions that need recovery
      const activeSessions = await db.collection('trading_sessions').find({
        status: { $in: ['PENDING', 'ACTIVE', 'TRADING', 'SETTLING'] }
      }).toArray();
      for (const session of activeSessions) {
        try {
          await this.recoverSession(session);
        } catch (error) {
          console.error(`❌ [SCHEDULER] Failed to recover session ${session.sessionId}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ [SCHEDULER] Failed to recover existing sessions:', error);
    }
  }

  /**
   * Recover a single session
   */
  private async recoverSession(session: any): Promise<void> {
    const { sessionId, startTime, endTime, result, status, schedulerStatus } = session;
    const now = new Date();
    const sessionStartTime = new Date(startTime);
    const sessionEndTime = new Date(endTime);
    console.log(`🔄 [SCHEDULER] Start: ${sessionStartTime.toISOString()}, End: ${sessionEndTime.toISOString()}`);

    // 1. Initialize session state in memory
    await sessionLifecycleManager.initializeSession(sessionId, sessionStartTime, sessionEndTime);

    // 2. Determine current state and schedule remaining events
    if (now < sessionStartTime) {
      // Session hasn't started yet
      this.scheduleTradeWindow(sessionId, sessionStartTime);
    } else if (now < sessionEndTime) {
      // Session is active
      await sessionLifecycleManager.transitionToActive(sessionId);
      
      // ✅ SCHEDULE SETTLEMENT: Settlement sẽ được trigger sau 12s khi session kết thúc
      const settlementTime = new Date(sessionEndTime.getTime() + this.config.settlementDelay);
      this.scheduleSettlement(sessionId, settlementTime);
    } else {
      // Session has ended, check if settlement time has passed
      const settlementTime = new Date(sessionEndTime.getTime() + this.config.settlementDelay);
      
      if (now < settlementTime) {
        // Settlement time hasn't passed yet, schedule it
        await sessionLifecycleManager.transitionToSettling(sessionId, settlementTime);
        this.scheduleSettlement(sessionId, settlementTime);
      } else {
        // Settlement time has passed, trigger immediate settlement
        await sessionLifecycleManager.transitionToSettling(sessionId, settlementTime);
        await this.handleSettlement({
          sessionId,
          type: 'settlement',
          data: { settlementTime }
        });
      }
    }

    // 3. Update metrics
    this.metrics.totalSessions++;
    if (status === 'ACTIVE' || status === 'TRADING') {
      this.metrics.activeSessions++;
    }
    
    // ✅ FIX: Update metrics từ lifecycle manager
    this.updateMetricsFromLifecycle();
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    config: SchedulerConfig;
    metrics: typeof this.metrics;
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      metrics: this.metrics,
      uptime: Date.now() - this.metrics.uptime
    };
  }
}

// Singleton instance
export const tradingScheduler = new TradingScheduler();
