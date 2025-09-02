import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { placeTradeAtomic, PlaceTradeData } from '@/lib/atomicTradeUtils';
import { publishTradeToQueue } from '@/lib/rabbitmq';

// Rate limiting (simple in-memory)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = {
  maxRequests: 10, // 10 requests
  windowMs: 60000, // per minute
};

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT.windowMs });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT.maxRequests) {
    return false;
  }
  
  userLimit.count++;
  return true;
};

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    const { userId, isAuthenticated } = await getUserFromRequest(request);
    if (!isAuthenticated || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Rate limiting check
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // 3. Validate request body
    const body = await request.json();
    const { sessionId, amount, type } = body;

    // Validation
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid sessionId' },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    if (!type || !['buy', 'sell'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "buy" or "sell"' },
        { status: 400 }
      );
    }

    // 4. Prepare trade data
    const tradeData: PlaceTradeData = {
      userId,
      sessionId,
      amount,
      type
    };

    console.log(`Placing trade for user ${userId}:`, {
      sessionId,
      amount,
      type
    });

    // 5. Auto-initialize RabbitMQ connection
    const { initializeRabbitMQ } = await import('@/lib/rabbitmq-auto-init');
    await initializeRabbitMQ();
    
    // 6. Gửi trade vào queue để xử lý an toàn (không tạo database ngay)
    console.log('🔍 [API] Gửi trade vào queue để xử lý:', tradeData);
    
    // Tạo tradeId mới
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const queueData = {
      tradeId,
      userId,
      sessionId,
      amount,
      type,
      action: 'place-trade'
    };

    const published = await publishTradeToQueue(queueData);
    
    if (!published) {
      console.log('❌ [API] Không thể gửi trade vào queue');
      return NextResponse.json(
        { error: 'Failed to process trade. Please try again.' },
        { status: 500 }
      );
    }

    console.log(`✅ [PLACE-TRADE] Trade ${tradeId} đã được gửi vào queue`);
    console.log(`📋 [PLACE-TRADE] Trade sẽ được xử lý bởi worker`);

    // 7. Send Socket.IO events to user
    const { sendTradePlacedEvent, sendTradeHistoryUpdatedEvent } = await import('@/lib/socket-client');
    
    // Gửi trade:placed event
    await sendTradePlacedEvent(userId, {
      tradeId,
      sessionId,
      direction: type === 'buy' ? 'UP' : 'DOWN',
      amount,
      type,
      status: 'queued',
      message: 'Lệnh đã được đặt thành công'
    });
    
    // Gửi trade:history:updated event
    await sendTradeHistoryUpdatedEvent(userId, {
      action: 'add',
      trade: {
        id: tradeId,
        sessionId,
        direction: type === 'buy' ? 'UP' : 'DOWN',
        amount,
        type,
        status: 'pending',
        result: null,
        profit: 0,
        createdAt: new Date().toISOString()
      },
      message: 'Lịch sử giao dịch đã được cập nhật'
    });

    // 8. Return success response
    return NextResponse.json({
      success: true,
      tradeId: tradeId,
      message: 'Trade placed successfully and queued for processing',
      status: 'queued'
    });

  } catch (error) {
    console.error('Place trade error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET method to check trade status
export async function GET(request: NextRequest) {
  try {
    // 1. Authentication check
    const { userId, isAuthenticated } = await getUserFromRequest(request);
    if (!isAuthenticated || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const tradeId = searchParams.get('tradeId');

    if (!tradeId) {
      return NextResponse.json(
        { error: 'Trade ID is required' },
        { status: 400 }
      );
    }

    // 2. Get trade status
    const { getTradeStatus } = await import('@/lib/atomicTradeUtils');
    const trade = await getTradeStatus(tradeId);

    if (!trade) {
      return NextResponse.json(
        { error: 'Trade not found' },
        { status: 404 }
      );
    }

    // 3. Check if user owns this trade
    if (trade.userId.toString() !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // 4. Return trade status
    return NextResponse.json({
      success: true,
      trade: {
        tradeId: trade.tradeId,
        sessionId: trade.sessionId,
        amount: trade.amount,
        type: trade.type,
        status: trade.status,
        createdAt: trade.createdAt,
        processedAt: trade.processedAt,
        result: trade.result
      }
    });

  } catch (error) {
    console.error('Get trade status error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
