import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { sendTradeOrder } from '@/lib/rabbitmq';

export async function POST(req: Request) {
  const requestId = `place_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🚀 [${requestId}] Bắt đầu xử lý đặt lệnh (Queue Mode)`);
    
    // Xác thực user
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
    const { sessionId, direction, amount } = await req.json();
    
    console.log(`📥 [${requestId}] Input data:`, { 
      sessionId, 
      direction, 
      amount, 
      userId: user.userId,
      timestamp: new Date().toISOString()
    });

    // Validate input
    if (!sessionId || !direction || !amount) {
      console.log(`❌ [${requestId}] Thiếu thông tin bắt buộc:`, { sessionId, direction, amount });
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    if (!['UP', 'DOWN'].includes(direction)) {
      console.log(`❌ [${requestId}] Hướng không hợp lệ:`, direction);
      return NextResponse.json({ message: 'Invalid direction' }, { status: 400 });
    }

    if (amount <= 0) {
      console.log(`❌ [${requestId}] Số tiền phải lớn hơn 0:`, amount);
      return NextResponse.json({ message: 'Amount must be greater than 0' }, { status: 400 });
    }

    // Giới hạn amount
    const MAX_AMOUNT = 1000000000000; // 1000 tỷ VND
    const MIN_AMOUNT = 1000; // 1,000 VND
    
    if (amount > MAX_AMOUNT) {
      console.log(`❌ [${requestId}] Số tiền vượt quá giới hạn:`, { amount, MAX_AMOUNT });
      return NextResponse.json({ message: `Amount cannot exceed ${MAX_AMOUNT.toLocaleString()} VND` }, { status: 400 });
    }
    
    if (amount < MIN_AMOUNT) {
      console.log(`❌ [${requestId}] Số tiền dưới mức tối thiểu:`, { amount, MIN_AMOUNT });
      return NextResponse.json({ message: `Amount must be at least ${MIN_AMOUNT.toLocaleString()} VND` }, { status: 400 });
    }

    console.log(`✅ [${requestId}] Validation thành công`);

    // Tạo order data để gửi vào queue
    const orderData = {
      sessionId,
      userId: user.userId,
      direction,
      amount: Number(amount),
      priority: 1, // Priority cho lệnh đặt
      timestamp: new Date().toISOString()
    };

    console.log(`🐰 [${requestId}] Gửi order vào RabbitMQ queue...`);
    
    // Gửi vào queue
    const queueSuccess = await sendTradeOrder(orderData);
    
    if (!queueSuccess) {
      console.log(`❌ [${requestId}] Không thể gửi order vào queue`);
      return NextResponse.json({ 
        message: 'Service temporarily unavailable. Please try again.' 
      }, { status: 503 });
    }

    console.log(`✅ [${requestId}] Order đã được gửi vào queue thành công`);

    return NextResponse.json({
      success: true,
      message: 'Order queued successfully',
      orderId: orderData.timestamp, // Temporary ID
      status: 'queued',
      estimatedProcessingTime: '5-10 seconds'
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Lỗi khi đặt lệnh:`, {
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
