import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { sendSettlementOrder } from '@/lib/rabbitmq';

export async function POST(req: Request) {
  const requestId = `settle_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🚀 [${requestId}] Bắt đầu xử lý settlement (Queue Mode)`);
    
    // Xác thực user (admin only)
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

    // Lấy dữ liệu từ request
    const { sessionId, result } = await req.json();
    
    console.log(`📥 [${requestId}] Settlement data:`, { 
      sessionId, 
      result,
      adminUserId: user.userId,
      timestamp: new Date().toISOString()
    });

    // Validate input
    if (!sessionId || !result) {
      console.log(`❌ [${requestId}] Thiếu thông tin bắt buộc:`, { sessionId, result });
      return NextResponse.json({ message: 'Missing required fields: sessionId, result' }, { status: 400 });
    }

    if (!['UP', 'DOWN'].includes(result)) {
      console.log(`❌ [${requestId}] Kết quả không hợp lệ:`, result);
      return NextResponse.json({ message: 'Invalid result. Must be UP or DOWN' }, { status: 400 });
    }

    console.log(`✅ [${requestId}] Validation thành công`);

    // Tạo settlement data để gửi vào queue
    const settlementData = {
      sessionId,
      result,
      adminUserId: user.userId,
      priority: 10, // High priority cho settlement
      timestamp: new Date().toISOString()
    };

    console.log(`🐰 [${requestId}] Gửi settlement vào RabbitMQ queue...`);
    
    // Gửi vào settlement queue
    const queueSuccess = await sendSettlementOrder(settlementData);
    
    if (!queueSuccess) {
      console.log(`❌ [${requestId}] Không thể gửi settlement vào queue`);
      return NextResponse.json({ 
        message: 'Service temporarily unavailable. Please try again.' 
      }, { status: 503 });
    }

    console.log(`✅ [${requestId}] Settlement đã được gửi vào queue thành công`);

    return NextResponse.json({
      success: true,
      message: 'Settlement queued successfully',
      sessionId,
      result,
      status: 'queued',
      estimatedProcessingTime: '10-30 seconds'
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Lỗi khi xử lý settlement:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      success: false,
      message: errorMessage
    }, { status: 500 });
  }
}
