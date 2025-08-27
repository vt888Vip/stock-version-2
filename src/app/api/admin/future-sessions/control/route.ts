import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { futureSessionsManager } from '@/lib/futureSessionsManager';

// API để admin điều khiển background service
export async function POST(request: Request) {
  try {
    // Xác thực admin
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId || user.role !== 'admin') {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const { action } = await request.json();

    switch (action) {
      case 'start':
        futureSessionsManager.start();
        return NextResponse.json({
          success: true,
          message: 'FutureSessionsManager đã được khởi động'
        });

      case 'stop':
        futureSessionsManager.stop();
        return NextResponse.json({
          success: true,
          message: 'FutureSessionsManager đã được dừng'
        });

      case 'regenerate':
        await futureSessionsManager.regenerateAllFutureSessions();
        return NextResponse.json({
          success: true,
          message: 'Đã tạo lại tất cả 30 phiên tương lai'
        });

      case 'status':
        const status = futureSessionsManager.getStatus();
        return NextResponse.json({
          success: true,
          data: status
        });

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error controlling FutureSessionsManager:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
