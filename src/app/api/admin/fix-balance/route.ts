import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// API để admin kiểm tra và sửa lỗi balance
export async function POST(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }

    // Kiểm tra quyền admin
    const db = await getMongoDb();
    const admin = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    console.log('🔍 [BALANCE FIX] Bắt đầu kiểm tra và sửa lỗi balance...');

    // Lấy tất cả users
    const allUsers = await db.collection('users').find({}).toArray();
    console.log(`📊 [BALANCE FIX] Tìm thấy ${allUsers.length} users cần kiểm tra`);

    const fixResults = [];
    let fixedCount = 0;
    let errorCount = 0;

    for (const user of allUsers) {
      try {
        console.log(`🔍 [BALANCE FIX] Đang kiểm tra user: ${user.username}`);
        
        // 1. Kiểm tra và chuẩn hóa balance
        let userBalance = user.balance || { available: 0, frozen: 0 };
        let needsFix = false;
        let fixReason = '';

        // Nếu balance là number (kiểu cũ), chuyển đổi thành object
        if (typeof userBalance === 'number') {
          userBalance = {
            available: userBalance,
            frozen: 0
          };
          needsFix = true;
          fixReason = 'Chuyển đổi từ number sang object';
        }

        // 2. Kiểm tra balance có âm không
        if (userBalance.available < 0) {
          userBalance.available = 0;
          needsFix = true;
          fixReason = 'Sửa balance available âm';
        }

        if (userBalance.frozen < 0) {
          userBalance.frozen = 0;
          needsFix = true;
          fixReason = 'Sửa balance frozen âm';
        }

        // 3. Kiểm tra balance có hợp lý không (dựa trên trade history)
        const userTrades = await db.collection('trades').find({ 
          userId: user._id 
        }).toArray();

        // Tính toán balance theo trade history
        let calculatedAvailable = userBalance.available;
        let calculatedFrozen = userBalance.frozen;

        for (const trade of userTrades) {
          if (trade.status === 'pending') {
            // Trade đang pending: tiền đã bị trừ khỏi available và cộng vào frozen
            // Không cần thay đổi gì
          } else if (trade.status === 'completed') {
            if (trade.result === 'win') {
              // Trade thắng: tiền gốc đã được trả từ frozen về available, cộng thêm profit
              calculatedAvailable += (trade.amount || 0) + (trade.profit || 0);
              calculatedFrozen -= trade.amount || 0;
            } else if (trade.result === 'lose') {
              // Trade thua: tiền gốc đã bị trừ khỏi frozen
              calculatedFrozen -= trade.amount;
            }
          }
        }

        // Kiểm tra sự khác biệt
        const availableDiff = Math.abs(calculatedAvailable - userBalance.available);
        const frozenDiff = Math.abs(calculatedFrozen - userBalance.frozen);
        
        if (availableDiff > 1000 || frozenDiff > 1000) { // Cho phép sai số 1000 VND
          userBalance.available = calculatedAvailable;
          userBalance.frozen = calculatedFrozen;
          needsFix = true;
          fixReason = `Sửa balance theo trade history (available: ${availableDiff}, frozen: ${frozenDiff})`;
        }

        // 4. Cập nhật balance nếu cần
        if (needsFix) {
          await db.collection('users').updateOne(
            { _id: user._id },
            { 
              $set: { 
                balance: userBalance,
                updatedAt: new Date()
              } 
            }
          );

          fixedCount++;
          console.log(`✅ [BALANCE FIX] User ${user.username}: ${fixReason}`);
        }

        fixResults.push({
          userId: user._id.toString(),
          username: user.username,
          oldBalance: user.balance,
          newBalance: userBalance,
          needsFix,
          fixReason,
          tradeCount: userTrades.length
        });

      } catch (error) {
        errorCount++;
        console.error(`❌ [BALANCE FIX] Lỗi khi xử lý user ${user.username}:`, error);
        fixResults.push({
          userId: user._id.toString(),
          username: user.username,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`🎉 [BALANCE FIX] Hoàn thành! Đã sửa ${fixedCount} users, ${errorCount} lỗi`);

    return NextResponse.json({
      success: true,
      message: `Đã kiểm tra và sửa lỗi balance cho ${fixedCount} users`,
      totalUsers: allUsers.length,
      fixedCount,
      errorCount,
      results: fixResults
    });

  } catch (error) {
    console.error('❌ [BALANCE FIX] Lỗi:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Đã xảy ra lỗi khi kiểm tra và sửa balance',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// API để kiểm tra trạng thái balance của một user cụ thể
export async function GET(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }

    // Kiểm tra quyền admin
    const db = await getMongoDb();
    const admin = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');

    if (!targetUserId) {
      return NextResponse.json({ message: 'Thiếu userId' }, { status: 400 });
    }

    // Lấy thông tin user
    const targetUser = await db.collection('users').findOne({ _id: new ObjectId(targetUserId) });
    if (!targetUser) {
      return NextResponse.json({ message: 'Không tìm thấy user' }, { status: 404 });
    }

    // Lấy trade history
    const userTrades = await db.collection('trades').find({ 
      userId: new ObjectId(targetUserId) 
    }).sort({ createdAt: -1 }).limit(20).toArray();

    // Tính toán balance theo trade history
    let currentBalance = targetUser.balance || { available: 0, frozen: 0 };
    
    if (typeof currentBalance === 'number') {
      currentBalance = {
        available: currentBalance,
        frozen: 0
      };
    }

    let calculatedAvailable = currentBalance.available;
    let calculatedFrozen = currentBalance.frozen;

    for (const trade of userTrades) {
      if (trade.status === 'pending') {
        // Trade đang pending: tiền đã bị trừ khỏi available và cộng vào frozen
        // Không cần thay đổi gì
      } else if (trade.status === 'completed') {
        if (trade.result === 'win') {
          // Trade thắng: tiền gốc đã được trả từ frozen về available, cộng thêm profit
          calculatedAvailable += (trade.amount || 0) + (trade.profit || 0);
          calculatedFrozen -= trade.amount || 0;
        } else if (trade.result === 'lose') {
          // Trade thua: tiền gốc đã bị trừ khỏi frozen
          calculatedFrozen -= trade.amount;
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: targetUser._id.toString(),
        username: targetUser.username,
        email: targetUser.email
      },
      currentBalance: {
        available: currentBalance.available,
        frozen: currentBalance.frozen,
        total: currentBalance.available + currentBalance.frozen
      },
      calculatedBalance: {
        available: calculatedAvailable,
        frozen: calculatedFrozen,
        total: calculatedAvailable + calculatedFrozen
      },
      differences: {
        available: calculatedAvailable - currentBalance.available,
        frozen: calculatedFrozen - currentBalance.frozen,
        total: (calculatedAvailable + calculatedFrozen) - (currentBalance.available + currentBalance.frozen)
      },
      recentTrades: userTrades.map(trade => ({
        id: trade._id.toString(),
        sessionId: trade.sessionId,
        direction: trade.direction,
        amount: trade.amount,
        status: trade.status,
        result: trade.result,
        profit: trade.profit,
        createdAt: trade.createdAt
      }))
    });

  } catch (error) {
    console.error('❌ [BALANCE CHECK] Lỗi:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Đã xảy ra lỗi khi kiểm tra balance',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
