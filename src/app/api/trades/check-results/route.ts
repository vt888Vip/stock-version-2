import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getMongoDb } from '@/lib/db';
import { publishTradeToQueue } from '@/lib/rabbitmq';

// Types
interface CheckResultsRequest {
  sessionId?: string;
  tradeId?: string;
  userId?: string;
}

interface CheckResultsResponse {
  success: boolean;
  message?: string;
  results?: Array<{
    tradeId: string;
    sessionId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: 'win' | 'lose';
    profit?: number;
    processedAt?: string;
  }>;
  sessionInfo?: {
    sessionId: string;
    result: 'UP' | 'DOWN';
    status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<CheckResultsResponse>> {
  try {
    // 1. Authentication check
    const { userId, isAuthenticated } = await getUserFromRequest(request);
    if (!isAuthenticated || !userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body: CheckResultsRequest = await request.json();
    const { sessionId, tradeId } = body;

    if (!sessionId && !tradeId) {
      return NextResponse.json(
        { success: false, message: 'SessionId or tradeId is required' },
        { status: 400 }
      );
    }

    console.log('🔍 [CHECK-RESULTS] Bắt đầu kiểm tra kết quả:', {
      userId,
      sessionId,
      tradeId
    });

    // 3. Connect to database
    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json(
        { success: false, message: 'Database connection failed' },
        { status: 500 }
      );
    }

    // 4. Check session info
    let sessionInfo = null;
    if (sessionId) {
      const sessionDoc = await db.collection('trading_sessions').findOne(
        { sessionId },
        { 
          projection: {
            sessionId: 1,
            result: 1,
            status: 1,
            totalTrades: 1,
            totalWins: 1,
            totalLosses: 1
          }
        }
      );

      if (sessionDoc) {
        sessionInfo = {
          sessionId: sessionDoc.sessionId as string,
          result: sessionDoc.result as 'UP' | 'DOWN',
          status: sessionDoc.status as 'ACTIVE' | 'COMPLETED' | 'EXPIRED',
          totalTrades: sessionDoc.totalTrades || 0,
          totalWins: sessionDoc.totalWins || 0,
          totalLosses: sessionDoc.totalLosses || 0
        };
      }
    }

    // 5. Check trades
    const query: any = { userId: new (await import('mongodb')).ObjectId(userId) };
    
    if (tradeId) {
      query.tradeId = tradeId;
    } else if (sessionId) {
      query.sessionId = sessionId;
    }

    const trades = await db.collection('trades').find(query, {
      projection: {
        tradeId: 1,
        sessionId: 1,
        status: 1,
        result: 1,
        profit: 1,
        processedAt: 1,
        createdAt: 1,
        amount: 1,
        type: 1,
        direction: 1
      },
      sort: { createdAt: -1 }
    }).toArray();

    // 6. Process results
    const results = trades.map(trade => ({
      tradeId: trade.tradeId as string,
      sessionId: trade.sessionId as string,
      status: trade.status as 'pending' | 'processing' | 'completed' | 'failed',
      result: trade.result?.isWin ? 'win' as const : trade.result?.isWin === false ? 'lose' as const : undefined,
      profit: trade.result?.profit || trade.profit,
      processedAt: trade.processedAt || trade.result?.processedAt,
      amount: trade.amount,
      type: trade.type,
      direction: trade.direction || (trade.type === 'buy' ? 'UP' : 'DOWN')
    }));

    // 7. Gửi chỉ trades chưa xử lý vào queue để xử lý kết quả an toàn
    console.log(`📊 [CHECK-RESULTS] Tổng số trades: ${trades.length}`);
    
    // ✅ SỬA: Chỉ gửi trades chưa completed hoặc chưa appliedToBalance
    const unsettledTrades = trades.filter(trade => 
      trade.status === 'pending' || 
      (trade.status === 'completed' && !trade.appliedToBalance)
    );
    
    console.log(`📊 [CHECK-RESULTS] Trades cần xử lý: ${unsettledTrades.length}`);
    
    // Gửi message cho trades chưa xử lý
    for (const trade of unsettledTrades) {
      try {
        const queueData = {
          tradeId: trade.tradeId,
          userId: userId,
          sessionId: trade.sessionId,
          amount: trade.amount,
          type: trade.type,
          action: 'check-result'
        };

        // Auto-initialize RabbitMQ connection
        const { initializeRabbitMQ } = await import('@/lib/rabbitmq-auto-init');
        await initializeRabbitMQ();
        
        console.log(`🧪 [CHECK-RESULTS] Gửi message cho trade: ${trade.tradeId} (status: ${trade.status})`);

        const published = await publishTradeToQueue(queueData);
        
        if (published) {
          console.log(`✅ [CHECK-RESULTS] Đã gửi trade ${trade.tradeId} vào queue để xử lý`);
        } else {
          console.log(`❌ [CHECK-RESULTS] Không thể gửi trade ${trade.tradeId} vào queue`);
        }
      } catch (error) {
        console.error(`❌ [CHECK-RESULTS] Lỗi gửi trade ${trade.tradeId} vào queue:`, error);
      }
    }

    // 8. Worker đã gửi Socket.IO events rồi, không cần gửi lại
    // Worker sẽ gửi: trade:completed, balance:updated, trade:history:updated
    console.log(`📡 [CHECK-RESULTS] Worker đã gửi Socket.IO events cho ${results.filter(r => r.status === 'completed').length} trades hoàn thành`);

    // 9. Return response
    const response: CheckResultsResponse = {
      success: true,
      results,
      sessionInfo: sessionInfo || undefined
    };

    console.log(`✅ [CHECK-RESULTS] Hoàn thành kiểm tra: ${results.length} trades`);
    console.log(`📡 [CHECK-RESULTS] Đã gửi Socket.IO events cho ${results.filter(r => r.status === 'completed').length} trades hoàn thành`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [CHECK-RESULTS] Lỗi:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET method for backward compatibility
export async function GET(request: NextRequest): Promise<NextResponse<CheckResultsResponse>> {
  try {
    // 1. Authentication check
    const { userId, isAuthenticated } = await getUserFromRequest(request);
    if (!isAuthenticated || !userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Get query parameters
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const tradeId = searchParams.get('tradeId');

    if (!sessionId && !tradeId) {
      return NextResponse.json(
        { success: false, message: 'SessionId or tradeId is required' },
        { status: 400 }
      );
    }

    // 3. Create POST request body
    const body: CheckResultsRequest = {
      sessionId: sessionId || undefined,
      tradeId: tradeId || undefined
    };

    // 4. Create a mock request for POST method
    const mockRequest = new NextRequest(request.url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: request.headers
    });

    // 5. Call POST method
    return await POST(mockRequest);

  } catch (error) {
    console.error('❌ [CHECK-RESULTS] GET method error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
