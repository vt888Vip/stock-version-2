import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';

export async function DELETE(request: NextRequest) {
  try {
    // Kiểm tra quyền admin
    const authResult = await requireAdmin(request, async (req: NextRequest, user: any) => {
      const db = await getMongoDb();
      const now = new Date();

      // Tìm tất cả phiên giao dịch tương lai (startTime > now)
      const futureSessions = await db.collection('trading_sessions')
        .find({
          startTime: { $gt: now }
        })
        .toArray();

      if (futureSessions.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'Không có phiên giao dịch tương lai nào để xóa',
          data: { deletedCount: 0 }
        });
      }

      // Xóa tất cả phiên giao dịch tương lai
      const deleteResult = await db.collection('trading_sessions')
        .deleteMany({
          startTime: { $gt: now }
        });

      console.log(`🗑️ Đã xóa ${deleteResult.deletedCount} phiên giao dịch tương lai`);

      return NextResponse.json({
        success: true,
        message: `Đã xóa thành công ${deleteResult.deletedCount} phiên giao dịch tương lai`,
        data: { 
          deletedCount: deleteResult.deletedCount,
          sessions: futureSessions.map(session => ({
            id: session._id.toString(),
            startTime: session.startTime,
            endTime: session.endTime,
            result: session.result
          }))
        }
      });
    });

    return authResult;

  } catch (error) {
    console.error('❌ Lỗi khi xóa phiên giao dịch tương lai:', error);
    return NextResponse.json({
      success: false,
      message: 'Lỗi khi xóa phiên giao dịch tương lai',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 