import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// API để admin chạy migration script chuyển đổi balance
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

    console.log('🚀 [BALANCE MIGRATION] Bắt đầu migration script...');

    // Tìm tất cả users có balance kiểu number
    const usersWithNumberBalance = await db.collection('users')
      .find({ 
        balance: { $type: 'number' } 
      })
      .toArray();

    console.log(`📊 [BALANCE MIGRATION] Tìm thấy ${usersWithNumberBalance.length} users cần migration`);

    if (usersWithNumberBalance.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Không có users nào cần migration. Tất cả balance đã ở dạng object.',
        migratedCount: 0
      });
    }

    // Thực hiện migration
    let migratedCount = 0;
    const migrationResults = [];

    for (const user of usersWithNumberBalance) {
      try {
        const oldBalance = user.balance;
        const newBalance = {
          available: oldBalance,
          frozen: 0
        };

        // Cập nhật balance
        await db.collection('users').updateOne(
          { _id: user._id },
          { 
            $set: { 
              balance: newBalance,
              updatedAt: new Date()
            } 
          }
        );

        migratedCount++;
        migrationResults.push({
          userId: user._id.toString(),
          username: user.username,
          oldBalance: oldBalance,
          newBalance: newBalance
        });

        console.log(`✅ [BALANCE MIGRATION] User ${user.username}: ${oldBalance} → ${JSON.stringify(newBalance)}`);

      } catch (error) {
        console.error(`❌ [BALANCE MIGRATION] Lỗi khi migration user ${user.username}:`, error);
        migrationResults.push({
          userId: user._id.toString(),
          username: user.username,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`🎉 [BALANCE MIGRATION] Hoàn thành! Đã migration ${migratedCount}/${usersWithNumberBalance.length} users`);

    return NextResponse.json({
      success: true,
      message: `Migration hoàn thành! Đã chuyển đổi ${migratedCount} users`,
      totalUsers: usersWithNumberBalance.length,
      migratedCount: migratedCount,
      results: migrationResults
    });

  } catch (error) {
    console.error('❌ [BALANCE MIGRATION] Lỗi:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Đã xảy ra lỗi khi chạy migration script',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// API để kiểm tra trạng thái migration
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

    // Thống kê balance types
    const totalUsers = await db.collection('users').countDocuments();
    const usersWithNumberBalance = await db.collection('users').countDocuments({ 
      balance: { $type: 'number' } 
    });
    const usersWithObjectBalance = await db.collection('users').countDocuments({ 
      balance: { $type: 'object' } 
    });
    const usersWithoutBalance = totalUsers - usersWithNumberBalance - usersWithObjectBalance;

    return NextResponse.json({
      success: true,
      statistics: {
        totalUsers,
        usersWithNumberBalance,
        usersWithObjectBalance,
        usersWithoutBalance,
        migrationProgress: {
          percentage: totalUsers > 0 ? Math.round(((usersWithObjectBalance + usersWithNumberBalance) / totalUsers) * 100) : 0,
          needsMigration: usersWithNumberBalance > 0
        }
      }
    });

  } catch (error) {
    console.error('❌ [BALANCE MIGRATION STATUS] Lỗi:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Đã xảy ra lỗi khi kiểm tra trạng thái migration',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
