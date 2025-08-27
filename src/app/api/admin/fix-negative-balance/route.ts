import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  try {
    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 });
    }

    console.log('🔧 [FIX NEGATIVE BALANCE] Bắt đầu sửa balance bị âm...');

    // Tìm tất cả users có balance bị âm
    const usersWithNegativeBalance = await db.collection('users').find({
      $or: [
        { 'balance.available': { $lt: 0 } },
        { 'balance.frozen': { $lt: 0 } }
      ]
    }).toArray();

    console.log(`📊 [FIX NEGATIVE BALANCE] Tìm thấy ${usersWithNegativeBalance.length} users có balance âm`);

    const fixResults = [];
    let fixedCount = 0;

    for (const user of usersWithNegativeBalance) {
      try {
        console.log(`🔄 [FIX NEGATIVE BALANCE] Đang sửa balance cho user: ${user.username}`);
        
        // Tính toán balance chính xác dựa trên trade history
        let calculatedAvailable = 0;
        let calculatedFrozen = 0;

        // Lấy tất cả trades của user
        const userTrades = await db.collection('trades').find({
          userId: user._id
        }).sort({ createdAt: 1 }).toArray();

        for (const trade of userTrades) {
          if (trade.status === 'pending') {
            // Trade đang pending: tiền đã bị trừ khỏi available và cộng vào frozen
            calculatedFrozen += (trade.amount || 0);
          } else if (trade.status === 'completed') {
            if (trade.result === 'win') {
              // ✅ SỬA LỖI: Khi thắng, chỉ cộng profit vào available, KHÔNG trừ frozen
              calculatedAvailable += (trade.amount || 0) + (trade.profit || 0);
              // calculatedFrozen -= trade.amount || 0; // ❌ XOÁ: Không trừ frozen khi thắng!
            } else if (trade.result === 'lose') {
              // Trade thua: tiền gốc đã bị trừ khỏi frozen
              calculatedFrozen -= trade.amount || 0;
            }
          }
        }

        // Đảm bảo balance không âm
        calculatedAvailable = Math.max(0, calculatedAvailable);
        calculatedFrozen = Math.max(0, calculatedFrozen);

        // Cập nhật balance
        await db.collection('users').updateOne(
          { _id: user._id },
          {
            $set: {
              balance: {
                available: calculatedAvailable,
                frozen: calculatedFrozen
              },
              updatedAt: new Date()
            }
          }
        );

        fixedCount++;
        console.log(`✅ [FIX NEGATIVE BALANCE] Đã sửa balance cho user ${user.username}: available=${calculatedAvailable}, frozen=${calculatedFrozen}`);

        fixResults.push({
          userId: user._id.toString(),
          username: user.username,
          oldBalance: user.balance,
          newBalance: {
            available: calculatedAvailable,
            frozen: calculatedFrozen
          },
          tradesCount: userTrades.length,
          status: 'fixed'
        });

      } catch (error) {
        console.error(`❌ [FIX NEGATIVE BALANCE] Lỗi khi sửa balance cho user ${user.username}:`, error);
        
        fixResults.push({
          userId: user._id.toString(),
          username: user.username,
          oldBalance: user.balance,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'error'
        });
      }
    }

    console.log(`✅ [FIX NEGATIVE BALANCE] Hoàn thành: đã sửa ${fixedCount}/${usersWithNegativeBalance.length} users`);

    return NextResponse.json({
      success: true,
      message: `Đã sửa balance cho ${fixedCount} users`,
      data: {
        totalUsers: usersWithNegativeBalance.length,
        fixedCount,
        results: fixResults
      }
    });

  } catch (error) {
    console.error('❌ [FIX NEGATIVE BALANCE] Lỗi:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
