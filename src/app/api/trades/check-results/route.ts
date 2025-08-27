import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ message: 'Session ID is required' }, { status: 400 });
    }

    const db = await getMongoDb();
    
    // ⚡ TỐI ƯU: Lấy kết quả phiên từ trading_sessions với index
    const session = await db.collection('trading_sessions').findOne(
      { sessionId },
      { projection: { result: 1, status: 1, actualResult: 1, endTime: 1 } } // Thêm endTime để kiểm tra
    );
    
    if (!session) {
      return NextResponse.json({ 
        hasResult: false, 
        message: 'Session not found',
        shouldRetry: true 
      });
    }

    // Kiểm tra xem phiên đã kết thúc chưa
    const now = new Date();
    const sessionEnded = session.endTime && session.endTime <= now;
    
    // ⚡ RANDOM KẾT QUẢ: Nếu chưa có kết quả và phiên đã kết thúc
    if (!session.result && sessionEnded) {
      console.log(`🎲 Session ${sessionId} đã kết thúc nhưng chưa có kết quả, tạo kết quả random`);
      
      // Tạo kết quả random (50% UP, 50% DOWN)
      const randomResult = Math.random() < 0.5 ? 'UP' : 'DOWN';
      
      // Cập nhật session với kết quả random
      await db.collection('trading_sessions').updateOne(
        { sessionId },
        { 
          $set: { 
            result: randomResult,
            actualResult: randomResult,
            status: 'COMPLETED',
            completedAt: now,
            updatedAt: now,
            createdBy: 'system_random'
          }
        }
      );
      
      console.log(`🎲 Đã tạo kết quả random: ${randomResult} cho session ${sessionId}`);
      
      // Cập nhật session object để sử dụng kết quả mới
      session.result = randomResult;
      session.actualResult = randomResult;
      session.status = 'COMPLETED';
    }

    // Nếu chưa có kết quả (phiên chưa kết thúc)
    if (!session.result) {
      return NextResponse.json({ 
        hasResult: false,
        sessionEnded,
        shouldRetry: !sessionEnded // Chỉ retry nếu phiên chưa kết thúc
      });
    }

    // ⚡ TỐI ƯU: Cập nhật tất cả các lệnh chưa có kết quả cho phiên này với bulk operation
    const pendingTrades = await db.collection('trades')
      .find({ 
        sessionId,
        status: 'pending',
        result: null
      })
      .toArray();

    if (pendingTrades.length > 0) {
      // ⚡ TỐI ƯU: Sử dụng bulk operations để cập nhật nhanh hơn
      const bulkOps = [];
      const userUpdates = new Map<string, { available: number; frozen: number }>();

      for (const trade of pendingTrades) {
        const isWin = trade.direction.toLowerCase() === session.result?.toLowerCase();
        const profit = isWin ? Math.floor(trade.amount * 0.9) : 0; // 90% tiền thắng (10 ăn 9)
        
        console.log(`🎯 [TRADE RESULT] Trade ${trade._id}: direction=${trade.direction}, sessionResult=${session.result}, isWin=${isWin}, amount=${trade.amount}, profit=${profit}`);
        
        // Cập nhật trạng thái lệnh
        bulkOps.push({
          updateOne: {
            filter: { _id: trade._id },
            update: {
              $set: {
                status: 'completed',
                result: isWin ? 'win' : 'lose',
                profit: profit,
                completedAt: new Date(),
                updatedAt: new Date()
              }
            }
          }
        });

        // Tích lũy cập nhật balance cho user
        const userId = trade.userId.toString();
        if (!userUpdates.has(userId)) {
          userUpdates.set(userId, { available: 0, frozen: 0 });
        }
        
        const userUpdate = userUpdates.get(userId)!;
        const oldAvailable = userUpdate.available;
        const oldFrozen = userUpdate.frozen;
        
        if (isWin) {
          // ✅ CHUẨN HÓA: Khi thắng, cần:
          // 1. Trả lại tiền gốc từ frozen về available
          // 2. Cộng thêm profit vào available
          userUpdate.available += trade.amount + profit; // Trả tiền gốc + cộng profit
          userUpdate.frozen -= trade.amount; // Trừ tiền gốc khỏi frozen
        } else {
          // Khi thua, chỉ trừ tiền gốc khỏi frozen
          userUpdate.frozen -= trade.amount;
        }
        
        console.log(`💰 [BALANCE UPDATE] User ${userId}: available ${oldAvailable} → ${userUpdate.available} (+${userUpdate.available - oldAvailable}), frozen ${oldFrozen} → ${userUpdate.frozen} (${userUpdate.frozen - oldFrozen > 0 ? '+' : ''}${userUpdate.frozen - oldFrozen})`);
      }

      // ⚡ TỐI ƯU: Thực hiện bulk update trades
      if (bulkOps.length > 0) {
        await db.collection('trades').bulkWrite(bulkOps);
        console.log(`✅ Updated ${bulkOps.length} trades for session ${sessionId}`);
      }

      // ✅ SỬA LỖI: Sử dụng $set thay vì $inc để tránh race condition
      const userBulkOps: any[] = [];
      userUpdates.forEach((update, userId) => {
        console.log(`🔄 [USER UPDATE] User ${userId}: available +${update.available}, frozen ${update.frozen > 0 ? '+' : ''}${update.frozen}`);
        
        // Lấy balance hiện tại của user để tính toán chính xác
        userBulkOps.push({
          updateOne: {
            filter: { _id: new ObjectId(userId) },
            update: {
              $set: { 
                updatedAt: new Date() 
              }
            }
          }
        });
      });

      // ✅ SỬA LỖI: Cập nhật balance từng user một để tránh race condition
      for (const [userId, update] of Array.from(userUpdates.entries())) {
        try {
          // Lấy balance hiện tại của user
          const currentUser = await db.collection('users').findOne({ _id: new ObjectId(userId) });
          if (!currentUser) {
            console.error(`❌ [USER UPDATE] Không tìm thấy user ${userId}`);
            continue;
          }

          // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
          let currentBalance = currentUser.balance || { available: 0, frozen: 0 };
          
          // Nếu balance là number (kiểu cũ), chuyển đổi thành object
          if (typeof currentBalance === 'number') {
            currentBalance = {
              available: currentBalance,
              frozen: 0
            };
            
            console.log(`🔄 [CHECK RESULTS MIGRATION] User ${currentUser.username}: Chuyển đổi balance từ number sang object`);
          }

          // Tính toán balance mới
          const newAvailableBalance = currentBalance.available + update.available;
          const newFrozenBalance = currentBalance.frozen + update.frozen;

          console.log(`💰 [USER UPDATE] User ${currentUser.username}: available ${currentBalance.available} → ${newAvailableBalance} (+${update.available}), frozen ${currentBalance.frozen} → ${newFrozenBalance} (${update.frozen > 0 ? '+' : ''}${update.frozen})`);

          // Cập nhật balance
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { 
              $set: { 
                balance: {
                  available: newAvailableBalance,
                  frozen: newFrozenBalance
                },
                updatedAt: new Date()
              }
            }
          );

        } catch (error) {
          console.error(`❌ [USER UPDATE] Lỗi khi cập nhật user ${userId}:`, error);
        }
      }

      if (userBulkOps.length > 0) {
        await db.collection('users').bulkWrite(userBulkOps);
        console.log(`✅ Updated ${userBulkOps.length} users for session ${sessionId}`);
      }
    }

    // ⚡ TỐI ƯU: Trả về kết quả ngay lập tức
    return NextResponse.json({ 
      hasResult: true,
      result: session.actualResult || session.result,
      sessionStatus: session.status,
      updatedTrades: pendingTrades.length,
      isRandom: session.createdBy === 'system_random'
    });

  } catch (error) {
    console.error('❌ Error in check-results:', error);
    return NextResponse.json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      shouldRetry: true
    }, { status: 500 });
  }
}
