import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(req: Request) {
  try {
    // Xác thực user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 });
    }

    // Lấy phiên hiện tại
    const now = new Date();
    const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
    const sessionId = `${currentMinute.getUTCFullYear()}${String(currentMinute.getUTCMonth() + 1).padStart(2, '0')}${String(currentMinute.getUTCDate()).padStart(2, '0')}${String(currentMinute.getUTCHours()).padStart(2, '0')}${String(currentMinute.getUTCMinutes()).padStart(2, '0')}`;

    // Đếm số lệnh pending của user trong phiên hiện tại
    const pendingTradesCount = await db.collection('trades').countDocuments({
      sessionId,
      userId: new ObjectId(user.userId),
      status: 'pending'
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        pendingTradesCount,
        currentTime: now.toISOString()
      }
    });

  } catch (error) {
    console.error('Error getting session trade count:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      success: false,
      message: errorMessage
    }, { status: 400 });
  }
}
