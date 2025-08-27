import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

// API để dọn dẹp phiên cũ và tối ưu hóa database
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ 
        success: false, 
        message: 'Database connection failed' 
      }, { status: 500 });
    }

    console.log('🧹 Bắt đầu dọn dẹp database...');

    // 1. Tìm và xóa các phiên trùng lặp (giữ lại phiên mới nhất)
    const duplicateSessions = await db.collection('trading_sessions').aggregate([
      {
        $group: {
          _id: '$sessionId',
          count: { $sum: 1 },
          sessions: { $push: '$$ROOT' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();

    let deletedCount = 0;
    for (const duplicate of duplicateSessions) {
      // Sắp xếp theo thời gian tạo, giữ lại phiên mới nhất
      const sortedSessions = duplicate.sessions.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      // Xóa các phiên cũ
      const sessionsToDelete = sortedSessions.slice(1);
      for (const session of sessionsToDelete) {
        await db.collection('trading_sessions').deleteOne({ _id: session._id });
        deletedCount++;
        console.log(`🗑️ Đã xóa phiên trùng lặp: ${session.sessionId}`);
      }
    }

    // 2. Cập nhật các phiên cũ không có result
    const sessionsWithoutResult = await db.collection('trading_sessions').find({
      result: null,
      status: { $in: ['ACTIVE', 'PREDICTED'] }
    }).toArray();

    let updatedCount = 0;
    for (const session of sessionsWithoutResult) {
      // Tạo kết quả ngẫu nhiên
      const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
      
      await db.collection('trading_sessions').updateOne(
        { _id: session._id },
        {
          $set: {
            result: result,
            status: 'ACTIVE',
            totalTrades: 0,
            totalWins: 0,
            totalLosses: 0,
            totalWinAmount: 0,
            totalLossAmount: 0,
            updatedAt: new Date()
          }
        }
      );
      
      updatedCount++;
      console.log(`🔄 Đã cập nhật phiên ${session.sessionId} với kết quả: ${result}`);
    }

    // 3. Cập nhật các phiên có status PREDICTED thành ACTIVE
    const predictedSessions = await db.collection('trading_sessions').find({
      status: 'PREDICTED'
    }).toArray();

    for (const session of predictedSessions) {
      await db.collection('trading_sessions').updateOne(
        { _id: session._id },
        {
          $set: {
            status: 'ACTIVE',
            updatedAt: new Date()
          }
        }
      );
      console.log(`🔄 Đã cập nhật status phiên ${session.sessionId}: PREDICTED → ACTIVE`);
    }

    console.log(`✅ Dọn dẹp hoàn tất: Xóa ${deletedCount} phiên trùng lặp, cập nhật ${updatedCount} phiên`);

    return NextResponse.json({
      success: true,
      message: 'Database cleanup completed',
      data: {
        deletedDuplicates: deletedCount,
        updatedSessions: updatedCount,
        updatedPredictedSessions: predictedSessions.length
      }
    });

  } catch (error) {
    console.error('Lỗi khi dọn dẹp database:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// API để xem thống kê phiên
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');

    const now = new Date();
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    // Thống kê tổng quan
    const totalSessions = await db.collection('trading_sessions').countDocuments();
    const activeSessions = await db.collection('trading_sessions').countDocuments({ status: 'ACTIVE' });
    const completedSessions = await db.collection('trading_sessions').countDocuments({ status: 'COMPLETED' });

    // Thống kê theo ngày
    const sessionsByDay = await db.collection('trading_sessions').aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt"
            }
          },
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] }
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] }
          }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]).toArray();

    // Phiên cũ nhất và mới nhất
    const oldestSession = await db.collection('trading_sessions')
      .find({})
      .sort({ createdAt: 1 })
      .limit(1)
      .toArray();

    const newestSession = await db.collection('trading_sessions')
      .find({})
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    return NextResponse.json({
      success: true,
      stats: {
        totalSessions,
        activeSessions,
        completedSessions,
        sessionsByDay,
        oldestSession: oldestSession[0] || null,
        newestSession: newestSession[0] || null,
        period: `${days} ngày gần đây`
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy thống kê phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
}

