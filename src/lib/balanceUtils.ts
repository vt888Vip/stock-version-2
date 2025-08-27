import { ObjectId } from 'mongodb';

/**
 * Utility functions để xử lý balance một cách an toàn và chính xác
 * Sử dụng MongoDB transactions để tránh race condition
 */

export interface BalanceUpdate {
  available: number;
  frozen: number;
}

/**
 * Đặt lệnh giao dịch - Trừ tiền khả dụng và cộng tiền đóng băng
 * Sử dụng MongoDB transaction để đảm bảo tính nhất quán
 */
export async function placeTrade(db: any, userId: string, amount: number): Promise<boolean> {
  const session = db.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Kiểm tra balance hiện tại
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(userId) },
        { session }
      );

      if (!user) {
        throw new Error('User không tồn tại');
      }

      const balance = user.balance || { available: 0, frozen: 0 };
      const availableBalance = typeof balance === 'number' ? balance : balance.available || 0;

      if (availableBalance < amount) {
        throw new Error('Balance không đủ');
      }

      // Cập nhật balance
      const updateResult = await db.collection('users').updateOne(
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
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error('Không thể cập nhật balance');
      }

      console.log(`✅ [BALANCE] User ${userId} đặt lệnh ${amount} thành công`);
    });

    return true;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi đặt lệnh user ${userId}:`, error);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý kết quả thắng - Trả lại tiền gốc + cộng profit
 * Sử dụng MongoDB transaction
 */
export async function processWinTrade(db: any, userId: string, tradeAmount: number, profit: number): Promise<boolean> {
  const session = db.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const updateResult = await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        [
          {
            $set: {
              balance: {
                available: {
                  $add: [
                    { $ifNull: ['$balance.available', 0] },
                    { $ifNull: ['$balance.frozen', 0] },
                    profit
                  ]
                },
                frozen: {
                  $subtract: [
                    { $ifNull: ['$balance.frozen', 0] },
                    tradeAmount
                  ]
                }
              },
              updatedAt: new Date()
            }
          }
        ],
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error('Không thể cập nhật balance cho user thắng');
      }

      console.log(`✅ [BALANCE] User ${userId} thắng: +${tradeAmount + profit}`);
    });

    return true;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi xử lý thắng user ${userId}:`, error);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý kết quả thua - Chỉ trừ tiền đóng băng
 * Sử dụng MongoDB transaction
 */
export async function processLoseTrade(db: any, userId: string, tradeAmount: number): Promise<boolean> {
  const session = db.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const updateResult = await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        [
          {
            $set: {
              balance: {
                available: {
                  $add: [
                    { $ifNull: ['$balance.available', 0] },
                    0
                  ]
                },
                frozen: {
                  $subtract: [
                    { $ifNull: ['$balance.frozen', 0] },
                    tradeAmount
                  ]
                }
              },
              updatedAt: new Date()
            }
          }
        ],
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error('Không thể cập nhật balance cho user thua');
      }

      console.log(`✅ [BALANCE] User ${userId} thua: -${tradeAmount}`);
    });

    return true;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi xử lý thua user ${userId}:`, error);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Lấy balance hiện tại của user
 */
export async function getUserBalance(db: any, userId: string): Promise<BalanceUpdate> {
  try {
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { balance: 1 } }
    );

    if (!user) {
      throw new Error('User không tồn tại');
    }

    // Chuẩn hóa balance format
    let balance = user.balance || { available: 0, frozen: 0 };
    
    // Nếu balance là number (kiểu cũ), chuyển đổi thành object
    if (typeof balance === 'number') {
      balance = {
        available: balance,
        frozen: 0
      };
    }

    return {
      available: balance.available || 0,
      frozen: balance.frozen || 0
    };
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi lấy balance user ${userId}:`, error);
    throw error;
  }
}

/**
 * Kiểm tra balance có đủ để đặt lệnh không
 */
export async function checkBalanceSufficient(db: any, userId: string, amount: number): Promise<boolean> {
  try {
    const balance = await getUserBalance(db, userId);
    return balance.available >= amount;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi kiểm tra balance user ${userId}:`, error);
    return false;
  }
}

/**
 * Tính toán profit dựa trên amount và tỷ lệ thắng
 */
export function calculateProfit(amount: number, winRate: number = 0.9): number {
  return Math.floor(amount * winRate);
}

/**
 * Log balance change để debug
 */
export async function logBalanceChange(db: any, userId: string, operation: string, details: any): Promise<void> {
  try {
    const balance = await getUserBalance(db, userId);
    console.log(`📊 [BALANCE LOG] User ${userId} - ${operation}:`, {
      currentBalance: balance,
      ...details,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`❌ [BALANCE LOG] Lỗi log balance user ${userId}:`, error);
  }
}
