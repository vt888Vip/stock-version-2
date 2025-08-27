import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const now = new Date();
    const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
    const nextMinute = new Date(currentMinute.getTime() + 60000);

    // Tạo sessionId cho phiên hiện tại
    const sessionId = `${currentMinute.getUTCFullYear()}${String(currentMinute.getUTCMonth() + 1).padStart(2, '0')}${String(currentMinute.getUTCDate()).padStart(2, '0')}${String(currentMinute.getUTCHours()).padStart(2, '0')}${String(currentMinute.getUTCMinutes()).padStart(2, '0')}`;

    // Tính thời gian còn lại
    const timeLeft = Math.max(0, Math.floor((nextMinute.getTime() - now.getTime()) / 1000));

    // Kiểm tra phiên hiện tại
    let currentSession = await db.collection('trading_sessions').findOne({ 
      sessionId: sessionId,
      status: { $in: ['ACTIVE', 'COMPLETED'] }
    });

    console.log('🔍 Kiểm tra phiên hiện tại:', {
      sessionId,
      currentSession: currentSession?.sessionId,
      currentStatus: currentSession?.status,
      currentResult: currentSession?.result,
      now: now.toISOString(),
      currentMinute: currentMinute.toISOString()
    });

    // Xử lý phiên đã kết thúc
    if (currentSession && currentSession.endTime <= now && currentSession.status === 'ACTIVE') {
      console.log('⏰ Phiên hiện tại đã kết thúc, xử lý kết quả');
      
      try {
        // Gọi API xử lý kết quả
        const processResponse = await fetch(`${request.nextUrl.origin}/api/trading-sessions/process-result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: currentSession.sessionId })
        });
        
        if (processResponse.ok) {
          console.log('✅ Đã xử lý kết quả phiên');
        }
      } catch (error) {
        console.error('❌ Lỗi khi xử lý kết quả:', error);
      }
      
      // Cập nhật currentSession với dữ liệu mới
      currentSession = await db.collection('trading_sessions').findOne({ 
        sessionId: currentSession.sessionId
      });
    }

    // Lấy phiên tiếp theo
    const nextSessionId = `${nextMinute.getUTCFullYear()}${String(nextMinute.getUTCMonth() + 1).padStart(2, '0')}${String(nextMinute.getUTCDate()).padStart(2, '0')}${String(nextMinute.getUTCHours()).padStart(2, '0')}${String(nextMinute.getUTCMinutes()).padStart(2, '0')}`;

    return NextResponse.json({
      success: true,
      currentSession: {
        sessionId: currentSession?.sessionId || sessionId,
        startTime: currentSession?.startTime || currentMinute,
        endTime: currentSession?.endTime || nextMinute,
        timeLeft,
        status: currentSession?.status || 'ACTIVE',
        result: currentSession?.result || null
      },
      nextSession: {
        sessionId: nextSessionId,
        startTime: nextMinute,
        endTime: new Date(nextMinute.getTime() + 60000)
      },
      serverTime: now.toISOString()
    });

  } catch (error) {
    console.error('Lỗi khi lấy phiên hiện tại:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
}

// API để admin tạo dự đoán cho nhiều phiên
export async function POST(request: NextRequest) {
  try {
    const { action, sessions } = await request.json();
    const db = await getMongoDb();
    
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    if (action === 'create_predictions') {
      return NextResponse.json({
        success: false,
        message: 'Chức năng tạo dự đoán cho 30 phiên tiếp theo đã được tắt',
        data: []
      });
    }

    return NextResponse.json(
      { success: false, message: 'Hành động không hợp lệ' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Lỗi khi tạo dự đoán:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
} 