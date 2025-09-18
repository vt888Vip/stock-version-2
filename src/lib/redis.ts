import { createClient, RedisClientType } from 'redis';

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
};

class RedisManager {
  private client: RedisClientType | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      console.log('🔌 Connecting to Redis...');
      
      this.client = createClient({
        socket: {
          host: REDIS_CONFIG.host,
          port: REDIS_CONFIG.port,
        },
        password: REDIS_CONFIG.password,
        database: REDIS_CONFIG.db,
      });

      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('🔌 Redis disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      console.log('✅ Redis connection established');
      
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('✅ Redis disconnected');
    }
  }

  getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  isConnectionActive(): boolean {
    return this.isConnected && this.client !== null;
  }

  // Redis Lock utilities với improved implementation
  async acquireLock(key: string, ttl: number = 30000): Promise<boolean> {
    const client = this.getClient();
    const lockKey = `lock:${key}`;
    const lockValue = `${Date.now()}-${Math.random()}`;
    
    try {
      const result = await client.set(lockKey, lockValue, {
        PX: ttl,
        NX: true
      });
      
      return result === 'OK';
    } catch (error) {
      console.error(`❌ Failed to acquire lock ${key}:`, error);
      return false;
    }
  }

  async releaseLock(key: string): Promise<boolean> {
    const client = this.getClient();
    const lockKey = `lock:${key}`;
    
    try {
      const result = await client.del(lockKey);
      return result > 0;
    } catch (error) {
      console.error(`❌ Failed to release lock ${key}:`, error);
      return false;
    }
  }

  // Atomic operations với Redis locks
  async withLock<T>(key: string, operation: () => Promise<T>, ttl: number = 30000): Promise<T | null> {
    const lockAcquired = await this.acquireLock(key, ttl);
    
    if (!lockAcquired) {
      console.log(`❌ Could not acquire lock for ${key}`);
      return null;
    }
    
    try {
      const result = await operation();
      return result;
    } catch (error) {
      console.error(`❌ Error in locked operation for ${key}:`, error);
      throw error;
    } finally {
      await this.releaseLock(key);
    }
  }

  // User balance atomic operations
  async atomicUpdateUserBalance(
    userId: string, 
    changes: { available?: number; frozen?: number },
    operation: () => Promise<any>
  ): Promise<any> {
    const lockKey = `user:${userId}:balance`;
    
    return await this.withLock(lockKey, async () => {
      // 1. Update cache first
      await this.updateBalance(userId, changes);
      
      // 2. Execute database operation
      const result = await operation();
      
      // 3. If database operation fails, rollback cache
      if (!result) {
        await this.updateBalance(userId, {
          available: changes.available ? -changes.available : 0,
          frozen: changes.frozen ? -changes.frozen : 0
        });
        throw new Error('Database operation failed, cache rolled back');
      }
      
      return result;
    });
  }

  // Trade processing atomic operations
  async atomicProcessTrade(tradeId: string, operation: () => Promise<any>): Promise<any> {
    const lockKey = `trade:${tradeId}:processing`;
    
    return await this.withLock(lockKey, async () => {
      // Check if trade already processed
      const isProcessed = await this.isTradeProcessed(tradeId);
      if (isProcessed) {
        console.log(`✅ Trade ${tradeId} already processed, skipping`);
        return { success: true, message: 'Already processed' };
      }
      
      // Execute operation
      const result = await operation();
      
      // Mark as processed if successful
      if (result && result.success !== false) {
        await this.markTradeProcessed(tradeId);
      }
      
      return result;
    });
  }

  // Balance cache utilities
  async getBalance(userId: string): Promise<{ available: number; frozen: number } | null> {
    const client = this.getClient();
    const balanceKey = `user:${userId}:balance`;
    
    try {
      const balance = await client.hGetAll(balanceKey);
      if (Object.keys(balance).length === 0) {
        return null;
      }
      
      return {
        available: parseInt(balance.available || '0'),
        frozen: parseInt(balance.frozen || '0')
      };
    } catch (error) {
      console.error(`❌ Failed to get balance for user ${userId}:`, error);
      return null;
    }
  }

  async setBalance(userId: string, balance: { available: number; frozen: number }): Promise<void> {
    const client = this.getClient();
    const balanceKey = `user:${userId}:balance`;
    
    try {
      await client.hSet(balanceKey, {
        available: balance.available.toString(),
        frozen: balance.frozen.toString(),
        updatedAt: new Date().toISOString()
      });
      
      // Set TTL to 1 hour
      await client.expire(balanceKey, 3600);
    } catch (error) {
      console.error(`❌ Failed to set balance for user ${userId}:`, error);
    }
  }

  async updateBalance(userId: string, changes: { available?: number; frozen?: number }): Promise<void> {
    const client = this.getClient();
    const balanceKey = `user:${userId}:balance`;
    
    try {
      const multi = client.multi();
      
      if (changes.available !== undefined) {
        multi.hIncrBy(balanceKey, 'available', changes.available);
      }
      
      if (changes.frozen !== undefined) {
        multi.hIncrBy(balanceKey, 'frozen', changes.frozen);
      }
      
      multi.hSet(balanceKey, 'updatedAt', new Date().toISOString());
      multi.expire(balanceKey, 3600);
      
      await multi.exec();
    } catch (error) {
      console.error(`❌ Failed to update balance for user ${userId}:`, error);
    }
  }

  // Trade status cache utilities
  async isTradeProcessed(tradeId: string): Promise<boolean> {
    const client = this.getClient();
    const tradeKey = `trade:${tradeId}:processed`;
    
    try {
      const exists = await client.exists(tradeKey);
      return exists === 1;
    } catch (error) {
      console.error(`❌ Failed to check trade status ${tradeId}:`, error);
      return false;
    }
  }

  async markTradeProcessed(tradeId: string, ttl: number = 3600): Promise<void> {
    const client = this.getClient();
    const tradeKey = `trade:${tradeId}:processed`;
    
    try {
      await client.set(tradeKey, 'true', { EX: ttl });
    } catch (error) {
      console.error(`❌ Failed to mark trade processed ${tradeId}:`, error);
    }
  }

  // Session result cache utilities
  async getSessionResult(sessionId: string): Promise<string | null> {
    const client = this.getClient();
    const sessionKey = `session:${sessionId}:result`;
    
    try {
      return await client.get(sessionKey);
    } catch (error) {
      console.error(`❌ Failed to get session result ${sessionId}:`, error);
      return null;
    }
  }

  async setSessionResult(sessionId: string, result: string, ttl: number = 7200): Promise<void> {
    const client = this.getClient();
    const sessionKey = `session:${sessionId}:result`;
    
    try {
      await client.set(sessionKey, result, { EX: ttl });
    } catch (error) {
      console.error(`❌ Failed to set session result ${sessionId}:`, error);
    }
  }

  // Session statistics atomic operations
  async atomicUpdateSessionStats(
    sessionId: string,
    stats: { totalTrades?: number; totalWins?: number; totalLosses?: number; totalWinAmount?: number; totalLossAmount?: number },
    operation: () => Promise<any>
  ): Promise<any> {
    const lockKey = `session:${sessionId}:stats`;
    
    return await this.withLock(lockKey, async () => {
      // Execute database operation
      const result = await operation();
      
      // Update session result cache if needed
      if (result && result.result) {
        await this.setSessionResult(sessionId, result.result);
      }
      
      return result;
    });
  }

  // Distributed lock với retry mechanism
  async acquireLockWithRetry(
    key: string, 
    ttl: number = 30000, 
    maxRetries: number = 5, 
    retryDelay: number = 100
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const acquired = await this.acquireLock(key, ttl);
      
      if (acquired) {
        return true;
      }
      
      if (attempt < maxRetries) {
        console.log(`⏳ Lock ${key} attempt ${attempt}/${maxRetries}, retrying in ${retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2; // Exponential backoff
      }
    }
    
    console.log(`❌ Failed to acquire lock ${key} after ${maxRetries} attempts`);
    return false;
  }

  // Health check cho Redis connection
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.getClient().ping();
      const latency = Date.now() - start;
      
      return {
        healthy: true,
        latency
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Batch operations để tối ưu performance
  async batchUpdateBalances(updates: Array<{ userId: string; changes: { available?: number; frozen?: number } }>): Promise<void> {
    const client = this.getClient();
    const multi = client.multi();
    
    try {
      for (const update of updates) {
        const balanceKey = `user:${update.userId}:balance`;
        
        if (update.changes.available !== undefined) {
          multi.hIncrBy(balanceKey, 'available', update.changes.available);
        }
        
        if (update.changes.frozen !== undefined) {
          multi.hIncrBy(balanceKey, 'frozen', update.changes.frozen);
        }
        
        multi.hSet(balanceKey, 'updatedAt', new Date().toISOString());
        multi.expire(balanceKey, 3600);
      }
      
      await multi.exec();
    } catch (error) {
      console.error('❌ Failed to batch update balances:', error);
    }
  }
}

// Singleton instance
export const redisManager = new RedisManager();

// Auto-initialize Redis connection
export async function initializeRedis(): Promise<void> {
  try {
    await redisManager.connect();
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error);
    // Don't throw error, let the application continue without Redis
    // Redis will be retried on next usage
  }
}

export default redisManager;
