import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';

export async function DELETE(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const db = await getMongoDb();
      if (!db) {
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
      }

      const now = new Date();
      
      // Xóa tất cả phiên tương lai
      const result = await db.collection('trading_sessions').deleteMany({
        startTime: { $gt: now }
      });

      return NextResponse.json({
        success: true,
        message: `Đã xóa ${result.deletedCount} phiên giao dịch tương lai`
      });

    } catch (error) {
      console.error('Error clearing future sessions:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
