import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { publishSettlementMessage } from '@/lib/rabbitmq';
import TradingSessionModel from '@/models/TradingSession';
import { tradingScheduler } from '@/lib/scheduler/TradingScheduler';

// Hàm gửi settlement message vào queue sử dụng RabbitMQ Manager
async function sendSettlementMessage(settlementData: {
  sessionId: string;
  id: string;
  timestamp: string;
}): Promise<boolean> {
  try {
    console.log('📤 Gửi settlement message qua RabbitMQ Manager:', settlementData.sessionId);
    
    // Auto-initialize RabbitMQ connection
    const { initializeRabbitMQ } = await import('@/lib/rabbitmq-auto-init');
    await initializeRabbitMQ();
    
    const success = await publishSettlementMessage(settlementData);
    
    if (success) {
      console.log('✅ Settlement message đã được gửi thành công');
    } else {
      console.log('❌ Không thể gửi settlement message');
    }
    
    return success;
  } catch (error) {
    console.error('❌ Lỗi gửi settlement message:', error);
    return false;
  }
}

// API để theo dõi sự thay đổi phiên và tạo phiên mới với kết quả có sẵn
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 [SESSION-CHANGE] Bắt đầu xử lý request');
    
    const db = await getMongoDb();
    if (!db) {
      console.error('❌ [SESSION-CHANGE] Không thể kết nối database');
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const now = new Date();
    const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
    const nextMinute = new Date(currentMinute.getTime() + 60000);

    // Tạo sessionId cho phiên hiện tại
    const sessionId = `${currentMinute.getUTCFullYear()}${String(currentMinute.getUTCMonth() + 1).padStart(2, '0')}${String(currentMinute.getUTCDate()).padStart(2, '0')}${String(currentMinute.getUTCHours()).padStart(2, '0')}${String(currentMinute.getUTCMinutes()).padStart(2, '0')}`;

    // ✅ SCHEDULER ONLY: Kiểm tra session hiện tại trước khi tạo mới
    let currentSession = null;
    let sessionChanged = false;
    let sessionEnded = false;
    
    // Kiểm tra session hiện tại trong database
    try {
      currentSession = await db.collection('trading_sessions').findOne({ 
        sessionId: sessionId
      });
      
      if (currentSession) {
        // Session đã tồn tại
        sessionEnded = currentSession.endTime <= now;
        sessionChanged = sessionEnded; // Chỉ thay đổi khi session kết thúc
      } else {
        // Session chưa tồn tại, cần tạo mới
        sessionChanged = true;
      }
    } catch (dbError) {
      console.error('❌ Database query error:', dbError);
      // Fallback: tạo session mới
      sessionChanged = true;
    }
    

    // ✅ SCHEDULER ONLY: Không cần gửi settlement message nữa
    // Scheduler sẽ tự động xử lý settlement

    // ✅ SCHEDULER ONLY: Chỉ tạo session mới khi cần thiết
    if (sessionChanged) {
      const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
      
      // ✅ AUTO-START SCHEDULER: Tự động start Scheduler nếu chưa chạy
      if (!tradingScheduler.running) {
        try {
          await tradingScheduler.start();
        } catch (schedulerError) {
          console.error(`❌ Failed to start scheduler:`, schedulerError);
          throw new Error(`Failed to start scheduler: ${schedulerError.message}`);
        }
      }
      
      try {
        const sessionInfo = await tradingScheduler.startSession(
          sessionId,
          currentMinute,
          nextMinute,
          result
        );
        
        currentSession = {
          sessionId: sessionInfo.sessionId,
          startTime: sessionInfo.startTime,
          endTime: sessionInfo.endTime,
          status: sessionInfo.status,
          result: sessionInfo.result,
          processingComplete: false,
          totalTrades: 0,
          totalWins: 0,
          totalLosses: 0,
          totalWinAmount: 0,
          totalLossAmount: 0
        };
        
      } catch (sessionError) {
        console.error(`❌ Failed to create session:`, sessionError);
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }
    }

    // Tính thời gian còn lại
    const timeLeft = Math.max(0, Math.floor((nextMinute.getTime() - now.getTime()) / 1000));

    const response = {
      success: true,
      sessionChanged,
      currentSession: currentSession ? {
        sessionId: currentSession.sessionId,
        startTime: currentSession.startTime,
        endTime: currentSession.endTime,
        timeLeft,
        status: currentSession.status,
        result: currentSession.result
      } : null,
      serverTime: now.toISOString()
    };

    console.log('✅ [SESSION-CHANGE] Response:', {
      sessionId: response.currentSession.sessionId,
      timeLeft: response.currentSession.timeLeft,
      sessionChanged: response.sessionChanged
    });

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('Lỗi khi theo dõi thay đổi phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
} 