import mongoose from 'mongoose';
import { Trade, ITrade } from '../models/Trade';
import { TradeLock, ITradeLock } from '../models/TradeLock';
import UserModel from '../models/User';

// Types
export interface PlaceTradeData {
  userId: string;
  sessionId: string;
  amount: number;
  type: 'buy' | 'sell';
}

export interface PlaceTradeResult {
  success: boolean;
  tradeId?: string;
  error?: string;
  balance?: {
    available: number;
    frozen: number;
  };
}

// Generate unique trade ID
export const generateTradeId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `trade_${timestamp}_${random}`;
};

// Get user's trades count in current session (for statistics only)
export const getUserTradesCountInSession = async (
  userId: string, 
  sessionId: string
): Promise<number> => {
  return await Trade.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    sessionId,
    status: { $in: ['pending', 'processing', 'completed'] }
  });
};

// Atomic place trade operation
export const placeTradeAtomic = async (
  data: PlaceTradeData
): Promise<PlaceTradeResult> => {
  const session = await mongoose.startSession();
  
  try {
    let result: PlaceTradeResult = { success: false };
    
    console.log('🔍 [ATOMIC] Bắt đầu transaction với data:', data);
    
    await session.withTransaction(async () => {
      const { userId, sessionId, amount, type } = data;
      
      // 1. Generate unique trade ID
      const tradeId = generateTradeId();
      
      // 2. Check if trade ID already exists (very unlikely but safe)
      const existingTradeId = await Trade.findOne({ tradeId });
      if (existingTradeId) {
        result = {
          success: false,
          error: 'Trade ID collision, please try again'
        };
        return;
      }
      
      // 3. Atomic balance check and update
      console.log('🔍 [ATOMIC] Bắt đầu kiểm tra và cập nhật balance cho user:', userId);
      const userResult = await UserModel.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(userId),
          'balance.available': { $gte: amount },
          'status.active': true,
          'status.betLocked': { $ne: true },
          $or: [
            { isLocked: { $exists: false } },
            { isLocked: false },
            { lockExpiry: { $lt: new Date() } }
          ]
        },
        {
          $inc: {
            'balance.available': -amount,
            'balance.frozen': amount,
            version: 1
          },
          $set: {
            isLocked: true,
            lockExpiry: new Date(Date.now() + 30000), // 30 seconds
            lastTradeId: tradeId
          }
        },
        { 
          session, 
          returnDocument: 'after',
          new: true
        }
      );
      
      if (!userResult) {
        console.log('❌ [ATOMIC] User update thất bại - có thể do insufficient balance hoặc user locked');
        result = {
          success: false,
          error: 'Insufficient balance or user locked'
        };
        return;
      }
      
      console.log('✅ [ATOMIC] User update thành công:', {
        userId: userResult._id,
        availableBalance: userResult.balance?.available,
        frozenBalance: userResult.balance?.frozen
      });
      
      // 4. Create trade record
      const trade = new Trade({
        tradeId,
        userId: new mongoose.Types.ObjectId(userId),
        sessionId,
        amount,
        type,
        status: 'pending',
        createdAt: new Date(),
        retryCount: 0,
        // Thêm các trường tương thích với database cũ
        direction: type === 'buy' ? 'UP' : 'DOWN',
        appliedToBalance: false
      });
      
      await trade.save({ session });
      
      // 5. Create lock record
      const lock = new TradeLock({
        tradeId,
        userId: new mongoose.Types.ObjectId(userId),
        sessionId,
        lockExpiry: new Date(Date.now() + 30000),
        createdAt: new Date(),
        status: 'active',
        lockType: 'trade'
      });
      
      await lock.save({ session });
      
      // 6. Success result
      result = {
        success: true,
        tradeId,
        balance: {
          available: userResult.balance.available,
          frozen: userResult.balance.frozen
        }
      };
    });
    
    return result;
    
  } catch (error) {
    console.error('Atomic place trade error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  } finally {
    await session.endSession();
  }
};

// Release user lock
export const releaseUserLock = async (userId: string): Promise<boolean> => {
  try {
    const result = await UserModel.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          isLocked: false,
          lockExpiry: null
        }
      }
    );
    
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Release user lock error:', error);
    return false;
  }
};

// Release trade lock
export const releaseTradeLock = async (tradeId: string): Promise<boolean> => {
  try {
    const result = await TradeLock.updateOne(
      { tradeId },
      { $set: { status: 'released' } }
    );
    
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Release trade lock error:', error);
    return false;
  }
};

// Get trade status
export const getTradeStatus = async (tradeId: string): Promise<ITrade | null> => {
  try {
    return await Trade.findOne({ tradeId });
  } catch (error) {
    console.error('Get trade status error:', error);
    return null;
  }
};

// Cleanup expired locks (background task)
export const cleanupExpiredLocks = async (): Promise<void> => {
  try {
    const now = new Date();
    
    // Cleanup expired user locks
    await UserModel.updateMany(
      {
        isLocked: true,
        lockExpiry: { $lt: now }
      },
      {
        $set: {
          isLocked: false,
          lockExpiry: null
        }
      }
    );
    
    // Cleanup expired trade locks
    await TradeLock.updateMany(
      {
        status: 'active',
        lockExpiry: { $lt: now }
      },
      {
        $set: { status: 'expired' }
      }
    );
    
    console.log('Expired locks cleaned up successfully');
  } catch (error) {
    console.error('Cleanup expired locks error:', error);
  }
};
