import { Trade } from '../models/Trade';
import { TradeLock } from '../models/TradeLock';
import { releaseUserLock, releaseTradeLock } from './atomicTradeUtils';
import { rabbitMQManager, RABBITMQ_CONFIG, publishTradeResult } from './rabbitmq';

// Trade processing worker
export class TradeWorker {
  private isRunning = false;

  // Start trade processing worker
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Trade worker is already running');
      return;
    }

    try {
      console.log('Starting trade worker...');
      
      // Sử dụng connection có sẵn từ RabbitMQ Manager
      if (!rabbitMQManager.isConnectionActive()) {
        await rabbitMQManager.connect();
      }
      
      // Start consuming trade processing queue
      await this.startTradeProcessingConsumer();
      
      // Start consuming trade settlement queue
      await this.startTradeSettlementConsumer();
      
      this.isRunning = true;
      console.log('Trade worker started successfully');
      
    } catch (error) {
      console.error('Failed to start trade worker:', error);
      throw error;
    }
  }

  // Stop trade processing worker
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Trade worker is not running');
      return;
    }

    try {
      console.log('Stopping trade worker...');
      
      // Close RabbitMQ connection
      await rabbitMQManager.close();
      
      this.isRunning = false;
      console.log('Trade worker stopped successfully');
      
    } catch (error) {
      console.error('Error stopping trade worker:', error);
    }
  }

  // Start trade processing consumer
  private async startTradeProcessingConsumer(): Promise<void> {
    await rabbitMQManager.consumeQueue(
      RABBITMQ_CONFIG.queues.tradeProcessing,
      async (message) => {
        await this.processTrade(message);
      },
      {
        prefetch: 1 // Process one message at a time
      }
    );
  }

  // Start trade settlement consumer
  private async startTradeSettlementConsumer(): Promise<void> {
    await rabbitMQManager.consumeQueue(
      RABBITMQ_CONFIG.queues.tradeSettlement,
      async (message) => {
        await this.processSettlement(message);
      },
      {
        prefetch: 1
      }
    );
  }

  // Process trade message
  private async processTrade(message: any): Promise<void> {
    const { tradeId, userId, sessionId, amount, type } = message.data;
    
    try {
      console.log(`Processing trade: ${tradeId}`);
      
      // 1. Check if trade is already processed
      const trade = await Trade.findOne({ tradeId });
      if (!trade) {
        throw new Error(`Trade not found: ${tradeId}`);
      }
      
      if (trade.status === 'completed' || trade.status === 'failed') {
        console.log(`Trade already processed: ${tradeId} with status: ${trade.status}`);
        return;
      }
      
      // 2. Check lock validity
      const lock = await TradeLock.findOne({ 
        tradeId, 
        status: 'active',
        lockExpiry: { $gt: new Date() }
      });
      
      if (!lock) {
        throw new Error(`Trade lock expired or invalid: ${tradeId}`);
      }
      
      // 3. Update trade status to processing
      await Trade.updateOne(
        { tradeId },
        { $set: { status: 'processing' } }
      );
      
      // 4. Process trade (simulate trading logic)
      const result = await this.executeTrade(tradeId, amount, type);
      
      // 5. Update trade with result
      await Trade.updateOne(
        { tradeId },
        {
          $set: {
            status: 'completed',
            processedAt: new Date(),
            result: result
          }
        }
      );
      
      // 6. Release locks
      await releaseTradeLock(tradeId);
      await releaseUserLock(userId);
      
      // 7. Publish trade result to exchange
      await publishTradeResult({
        tradeId,
        userId,
        sessionId,
        result,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Trade completed successfully: ${tradeId}, Result: ${result.win ? 'WIN' : 'LOSE'}`);
      
    } catch (error) {
      console.error(`Trade processing failed: ${tradeId}`, error);
      
      // Update trade status to failed
      await Trade.updateOne(
        { tradeId },
        { 
          $set: { 
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      );
      
      // Release locks on failure
      await releaseTradeLock(tradeId);
      await releaseUserLock(userId);
      
      throw error;
    }
  }

  // Process settlement message
  private async processSettlement(message: any): Promise<void> {
    const { tradeId, userId, result } = message.data;
    
    try {
      console.log(`Processing settlement for trade: ${tradeId}`);
      
      // Update user balance based on trade result
      await this.settleTrade(userId, result);
      
      console.log(`Settlement completed for trade: ${tradeId}`);
      
    } catch (error) {
      console.error(`Settlement failed for trade: ${tradeId}`, error);
      throw error;
    }
  }

  // Execute trade (simulate trading logic)
  private async executeTrade(tradeId: string, amount: number, type: 'buy' | 'sell'): Promise<any> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Simulate random result (replace with actual trading logic)
    const isWin = Math.random() > 0.5;
    const multiplier = isWin ? 1.8 + Math.random() * 0.4 : 0;
    const profit = isWin ? amount * multiplier - amount : -amount;
    
    return {
      win: isWin,
      profit,
      multiplier,
      type
    };
  }

  // Settle trade (update user balance)
  private async settleTrade(userId: string, result: any): Promise<void> {
    const { win, profit } = result;
    
    // Update user balance
    const updateData: any = {
      $inc: {
        'balance.frozen': -result.amount // Unfreeze the amount
      },
      $set: {
        isLocked: false,
        lockExpiry: null
      }
    };
    
    if (win) {
      // Add profit to available balance
      updateData.$inc['balance.available'] = result.amount + profit;
    } else {
      // Loss: amount is already deducted from frozen
      updateData.$inc['balance.available'] = 0;
    }
    
    await import('../models/User').then(({ default: UserModel }) => {
      return UserModel.updateOne(
        { _id: userId },
        updateData
      );
    });
  }

  // Get worker status
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      rabbitMQConnected: rabbitMQManager.isConnectionActive()
    };
  }
}

// Export singleton instance
export const tradeWorker = new TradeWorker();

// Initialize trade worker
export const initializeTradeWorker = async (): Promise<void> => {
  try {
    await tradeWorker.start();
  } catch (error) {
    console.error('Failed to initialize trade worker:', error);
    throw error;
  }
};

// Stop trade worker
export const stopTradeWorker = async (): Promise<void> => {
  try {
    await tradeWorker.stop();
  } catch (error) {
    console.error('Failed to stop trade worker:', error);
    throw error;
  }
};
