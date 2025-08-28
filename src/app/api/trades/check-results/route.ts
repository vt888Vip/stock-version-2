import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import TradingSessionModel from '@/models/TradingSession';

export async function POST(req: Request) {
  const requestId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🚀 [${requestId}] Bắt đầu kiểm tra kết quả session`);
    
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log(`❌ [${requestId}] Không có authorization header`);
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      console.log(`❌ [${requestId}] Token không hợp lệ`);
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      console.log(`❌ [${requestId}] Thiếu sessionId`);
      return NextResponse.json({ message: 'Session ID is required' }, { status: 400 });
    }

    console.log(`📥 [${requestId}] Input data:`, { 
      sessionId, 
      userId: user.userId,
      timestamp: new Date().toISOString()
    });

    console.log(`🔌 [${requestId}] Đang kết nối database...`);
    const db = await getMongoDb();
    console.log(`✅ [${requestId}] Kết nối database thành công`);
    
    // ✅ BƯỚC 1: KIỂM TRA SESSION
    console.log(`🔍 [${requestId}] Kiểm tra session: ${sessionId}`);
    const tradingSession = await TradingSessionModel.findOne(
      { sessionId },
      { sessionId: 1, status: 1, result: 1, processingComplete: 1, endTime: 1, _id: 0 }
    ).lean();
    
    if (!tradingSession) {
      console.log(`❌ [${requestId}] Không tìm thấy session: ${sessionId}`);
      return NextResponse.json({ 
        hasResult: false, 
        message: 'Session not found',
        shouldRetry: true 
      });
    }
    
    console.log(`📋 [${requestId}] Session info:`, {
      sessionId: tradingSession.sessionId,
      status: tradingSession.status,
      result: tradingSession.result,
      processingComplete: tradingSession.processingComplete,
      endTime: tradingSession.endTime
    });
    
    // ✅ BƯỚC 2: KIỂM TRA PHIÊN ĐÃ KẾT THÚC CHƯA
    const now = new Date();
    const sessionEnded = tradingSession.endTime && tradingSession.endTime <= now;
    
    console.log(`⏰ [${requestId}] Session ended:`, {
      sessionEnded,
      endTime: tradingSession.endTime,
      currentTime: now
    });
    
    // ✅ BƯỚC 3: TRẢ VỀ KẾT QUẢ CÓ SẴN NGAY KHI PHIÊN KẾT THÚC
    if (sessionEnded && tradingSession.result) {
      console.log(`✅ [${requestId}] Phiên đã kết thúc, trả về kết quả có sẵn: ${tradingSession.result}`);
      return NextResponse.json({
        hasResult: true,
        result: tradingSession.result,
        sessionStatus: tradingSession.status,
        message: 'Kết quả có sẵn từ session'
      });
    }
    
    // ✅ BƯỚC 4: NẾU PHIÊN CHƯA KẾT THÚC, TRẢ VỀ CHƯA CÓ KẾT QUẢ
    if (!sessionEnded) {
      console.log(`⏳ [${requestId}] Session chưa kết thúc, chưa có kết quả`);
      return NextResponse.json({
        hasResult: false,
        message: 'Session chưa kết thúc',
        shouldRetry: true,
        sessionEnded: false
      });
    }
    
    // ✅ BƯỚC 5: NẾU PHIÊN ĐÃ KẾT THÚC NHƯNG KHÔNG CÓ KẾT QUẢ
    console.log(`❌ [${requestId}] Session đã kết thúc nhưng không có kết quả`);
    return NextResponse.json({
      hasResult: false,
      message: 'Session đã kết thúc nhưng không có kết quả',
      shouldRetry: false,
      error: 'MISSING_RESULT'
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Error in check-results:`, error);
    return NextResponse.json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      shouldRetry: true
    }, { status: 500 });
  }
}
