/**
 * Session Lifecycle Manager
 * Quản lý trạng thái và chuyển đổi của trading sessions
 */

import { getMongoDb } from '../db';
import { publishSettlementMessage } from '../rabbitmq';

export interface SessionState {
  sessionId: string;
  status: 'PENDING' | 'ACTIVE' | 'TRADING' | 'SETTLING' | 'COMPLETED';
  schedulerStatus: 'PENDING' | 'ACTIVE' | 'SETTLED' | 'COMPLETED';
  tradeWindowOpen: boolean;
  settlementScheduled: boolean;
  settlementTime?: Date;
  lastSchedulerUpdate: Date;
}

export interface SessionTransition {
  from: string;
  to: string;
  timestamp: Date;
  reason: string;
}

export class SessionLifecycleManager {
  private activeSessions: Map<string, SessionState> = new Map();
  private transitions: Map<string, SessionTransition[]> = new Map();

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Initialize session state
   */
  async initializeSession(sessionId: string, startTime: Date, endTime: Date): Promise<SessionState> {
    const sessionState: SessionState = {
      sessionId,
      status: 'PENDING',
      schedulerStatus: 'PENDING',
      tradeWindowOpen: false,
      settlementScheduled: false,
      lastSchedulerUpdate: new Date()
    };

    this.activeSessions.set(sessionId, sessionState);
    this.recordTransition(sessionId, 'INIT', 'PENDING', 'Session initialized');

    return sessionState;
  }

  /**
   * Transition to ACTIVE state
   */
  async transitionToActive(sessionId: string): Promise<SessionState> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const previousStatus = session.status;
    session.status = 'ACTIVE';
    session.schedulerStatus = 'ACTIVE';
    session.tradeWindowOpen = true;
    session.lastSchedulerUpdate = new Date();

    this.activeSessions.set(sessionId, session);
    this.recordTransition(sessionId, previousStatus, 'ACTIVE', 'Session started');

    // Update database
    await this.updateDatabaseStatus(sessionId, {
      status: 'ACTIVE',
      schedulerStatus: 'ACTIVE',
      tradeWindowOpen: true,
      lastSchedulerUpdate: new Date()
    });

    return session;
  }

  /**
   * Transition to TRADING state
   */
  async transitionToTrading(sessionId: string): Promise<SessionState> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const previousStatus = session.status;
    session.status = 'TRADING';
    session.tradeWindowOpen = true;
    session.lastSchedulerUpdate = new Date();

    this.activeSessions.set(sessionId, session);
    this.recordTransition(sessionId, previousStatus, 'TRADING', 'Trade window opened');

    // Update database
    await this.updateDatabaseStatus(sessionId, {
      status: 'TRADING',
      tradeWindowOpen: true,
      lastSchedulerUpdate: new Date()
    });

    return session;
  }

  /**
   * Transition to SETTLING state
   */
  async transitionToSettling(sessionId: string, settlementTime: Date): Promise<SessionState> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const previousStatus = session.status;
    session.status = 'SETTLING';
    session.schedulerStatus = 'SETTLED';
    session.tradeWindowOpen = false;
    session.settlementScheduled = true;
    session.settlementTime = settlementTime;
    session.lastSchedulerUpdate = new Date();

    this.activeSessions.set(sessionId, session);
    this.recordTransition(sessionId, previousStatus, 'SETTLING', 'Settlement scheduled');

    // Update database
    await this.updateDatabaseStatus(sessionId, {
      status: 'SETTLING',
      schedulerStatus: 'SETTLED',
      tradeWindowOpen: false,
      settlementScheduled: true,
      settlementTime: settlementTime,
      lastSchedulerUpdate: new Date()
    });

    return session;
  }

  /**
   * Transition to COMPLETED state
   */
  async transitionToCompleted(sessionId: string): Promise<SessionState> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const previousStatus = session.status;
    session.status = 'COMPLETED';
    session.schedulerStatus = 'COMPLETED';
    session.tradeWindowOpen = false;
    session.settlementScheduled = false;
    session.lastSchedulerUpdate = new Date();

    this.activeSessions.set(sessionId, session);
    this.recordTransition(sessionId, previousStatus, 'COMPLETED', 'Session completed');

    // Update database
    await this.updateDatabaseStatus(sessionId, {
      status: 'COMPLETED',
      schedulerStatus: 'COMPLETED',
      tradeWindowOpen: false,
      settlementScheduled: false,
      processingComplete: true,
      lastSchedulerUpdate: new Date()
    });

    return session;
  }

  /**
   * Get session state
   */
  getSessionState(sessionId: string): SessionState | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Check if session can accept trades
   */
  canAcceptTrades(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return session ? session.tradeWindowOpen && (session.status === 'ACTIVE' || session.status === 'TRADING') : false;
  }

  /**
   * Check if session is settling
   */
  isSettling(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return session ? session.status === 'SETTLING' : false;
  }

  /**
   * Check if session is completed
   */
  isCompleted(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return session ? session.status === 'COMPLETED' : false;
  }

  /**
   * Record transition
   */
  private recordTransition(sessionId: string, from: string, to: string, reason: string): void {
    if (!this.transitions.has(sessionId)) {
      this.transitions.set(sessionId, []);
    }

    const transition: SessionTransition = {
      from,
      to,
      timestamp: new Date(),
      reason
    };

    this.transitions.get(sessionId)!.push(transition);
  }

  /**
   * Get session transitions
   */
  getSessionTransitions(sessionId: string): SessionTransition[] {
    return this.transitions.get(sessionId) || [];
  }

  /**
   * Update database status
   */
  private async updateDatabaseStatus(sessionId: string, updates: any): Promise<void> {
    try {
      const db = await getMongoDb();
      if (!db) {
        throw new Error('Database connection failed');
      }

      await db.collection('trading_sessions').updateOne(
        { sessionId },
        { $set: updates }
      );

    } catch (error) {
      console.error(`❌ [LIFECYCLE] Failed to update database for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    // Cleanup completed sessions every 5 minutes
    setInterval(() => {
      this.cleanupCompletedSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Cleanup completed sessions
   */
  private cleanupCompletedSessions(): void {
    const now = Date.now();
    const cleanupThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [sessionId, session] of this.activeSessions) {
      if (session.status === 'COMPLETED') {
        const timeSinceCompletion = now - session.lastSchedulerUpdate.getTime();
        if (timeSinceCompletion > cleanupThreshold) {
          this.activeSessions.delete(sessionId);
          this.transitions.delete(sessionId);
        }
      }
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Map<string, SessionState> {
    return this.activeSessions;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    tradingSessions: number;
    settlingSessions: number;
    completedSessions: number;
  } {
    const sessions = Array.from(this.activeSessions.values());
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'ACTIVE').length,
      tradingSessions: sessions.filter(s => s.status === 'TRADING').length,
      settlingSessions: sessions.filter(s => s.status === 'SETTLING').length,
      completedSessions: sessions.filter(s => s.status === 'COMPLETED').length
    };
  }

  /**
   * Cleanup all sessions
   */
  cleanup(): void {
    this.activeSessions.clear();
    this.transitions.clear();
  }
}

// Singleton instance
export const sessionLifecycleManager = new SessionLifecycleManager();
