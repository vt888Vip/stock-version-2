import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { processTradeOrder } from '@/lib/rabbitmq';
import { placeTrade } from '@/lib/balanceUtils';

/**
 * Worker để xử lý lệnh đặt từ RabbitMQ queue
 */
export async function startTradeWorker(): Promise<void> {
  console.log('🚀 Khởi động Trade Worker...');

  await processTradeOrder(async (orderData) => {
    try {
      console.log(`🔄 Xử lý lệnh: ${orderData.id}`);
      
      const db = await getMongoDb();
      if (!db) {
        throw new Error('Database connection failed');
      }

      const { sessionId, userId, direction, amount } = orderData;

      // 1. Kiểm tra phiên giao dịch
      const tradingSession = await db.collection('trading_sessions').findOne({ sessionId });
      
      if (!tradingSession) {
        return {
          success: false,
          error: 'Trading session not found'
        };
      }

      if (tradingSession.status !== 'ACTIVE') {
        return {
          success: false,
          error: 'Trading session is not active'
        };
      }

      if (tradingSession.endTime <= new Date()) {
        return {
          success: false,
          error: 'Trading session has ended'
        };
      }

      // 2. Kiểm tra balance
      const userData = await db.collection('users').findOne(
        { _id: new ObjectId(userId) },
        { projection: { balance: 1 } }
      );

      if (!userData) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const userBalance = userData.balance || { available: 0, frozen: 0 };
      const availableBalance = typeof userBalance === 'number' ? userBalance : userBalance.available || 0;

      if (availableBalance < amount) {
        return {
          success: false,
          error: 'Insufficient balance'
        };
      }

      // 3. Kiểm tra số lệnh đã đặt trong phiên này
      const userTradesInSession = await db.collection('trades').countDocuments({
        sessionId,
        userId: new ObjectId(userId),
        status: 'pending'
      });

      const MAX_TRADES_PER_SESSION = 5;
      if (userTradesInSession >= MAX_TRADES_PER_SESSION) {
        return {
          success: false,
          error: `Bạn đã đặt tối đa ${MAX_TRADES_PER_SESSION} lệnh cho phiên này`
        };
      }

      // 4. Xử lý lệnh với atomic operations
      try {
        // Trừ balance với atomic operation
        const balanceUpdateResult = await db.collection('users').updateOne(
          { 
            _id: new ObjectId(userId),
            'balance.available': { $gte: amount }
          },
          {
            $inc: {
              'balance.available': -amount,
              'balance.frozen': amount
            },
            $set: { updatedAt: new Date() }
          }
        );

        if (balanceUpdateResult.modifiedCount === 0) {
          return {
            success: false,
            error: 'Insufficient balance or user not found'
          };
        }

        // Tạo lệnh giao dịch
        const trade = {
          sessionId,
          userId: new ObjectId(userId),
          direction,
          amount: Number(amount),
          status: 'pending',
          appliedToBalance: false, // ✅ THÊM FIELD NÀY
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const tradeResult = await db.collection('trades').insertOne(trade);
        
        if (!tradeResult.insertedId) {
          // Nếu tạo trade thất bại, hoàn lại balance
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            {
              $inc: {
                'balance.available': amount,
                'balance.frozen': -amount
              },
              $set: { updatedAt: new Date() }
            }
          );
          throw new Error('Failed to create trade');
        }

        console.log(`✅ [WORKER] Xử lý lệnh thành công: ${orderData.id}`);

        // Lấy lại lệnh vừa tạo để trả về
        const insertedTrade = await db.collection('trades').findOne({
          _id: tradeResult.insertedId
        });

        return {
          success: true,
          result: {
            trade: {
              ...insertedTrade,
              _id: insertedTrade._id.toString(),
              userId: insertedTrade.userId.toString()
            }
          }
        };

      } catch (error) {
        console.error(`❌ [WORKER] Lỗi xử lý lệnh ${orderData.id}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

    } catch (error) {
      console.error(`❌ [WORKER] Lỗi xử lý lệnh ${orderData.id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('✅ Trade Worker đã sẵn sàng xử lý lệnh');
}

/**
 * Khởi động worker khi ứng dụng start
 */
export function initializeTradeWorker(): void {
  // Khởi động worker sau 2 giây để đảm bảo app đã sẵn sàng
  setTimeout(async () => {
    try {
      await startTradeWorker();
    } catch (error) {
      console.error('❌ Lỗi khởi động Trade Worker:', error);
      // Thử lại sau 5 giây
      setTimeout(async () => {
        try {
          await startTradeWorker();
        } catch (retryError) {
          console.error('❌ Lỗi khởi động Trade Worker lần 2:', retryError);
        }
      }, 5000);
    }
  }, 2000);
}
