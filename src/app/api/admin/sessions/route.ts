import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any, sessionId: string) => {
    try {
      // ✅ SIMPLIFIED: Chỉ trả về thông tin session hiện tại
      // Không cần lấy danh sách admin sessions phức tạp
      
      const currentSession = {
        sessionId: sessionId,
        deviceInfo: {
          userAgent: req.headers.get('user-agent') || 'Unknown',
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'Unknown'
        },
        lastActivity: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        createdAt: new Date().toISOString(),
        isCurrentSession: true
      };

      return NextResponse.json({
        success: true,
        data: {
          sessions: [currentSession],
          currentSessionId: sessionId,
          totalSessions: 1
        }
      });

    } catch (error) {
      console.error('Error fetching admin sessions:', error);
      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

