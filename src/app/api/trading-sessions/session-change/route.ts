import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import amqp from 'amqplib';

// RabbitMQ Configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqps://seecjpys:zQCC056kIx1vnMmrImQqAAVbVUUfmk0M@fuji.lmq.cloudamqp.com/seecjpys';
const SETTLEMENTS_QUEUE = 'settlements';

// Hàm gửi settlement message vào queue
async function sendSettlementMessage(settlementData: {
  sessionId: string;
  result: 'UP' | 'DOWN';
  id: string;
  timestamp: string;
}): Promise<boolean> {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    // Đảm bảo queue tồn tại
    await channel.assertQueue(SETTLEMENTS_QUEUE, {
      durable: true,
      maxPriority: 10
    });
    
    // Gửi message
    const success = channel.sendToQueue(
      SETTLEMENTS_QUEUE,
      Buffer.from(JSON.stringify(settlementData)),
      {
        persistent: true,
        priority: 1
      }
    );
    
    await channel.close();
    await connection.close();
    
    return success;
  } catch (error) {
    console.error('❌ Lỗi gửi settlement message:', error);
    return false;
  }
}

// API để theo dõi sự thay đổi phiên và tạo phiên mới với kết quả có sẵn
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

    // Lấy phiên hiện tại từ database
    let currentSession = await db.collection('trading_sessions').findOne({ 
      sessionId: sessionId,
      status: { $in: ['ACTIVE', 'COMPLETED'] }
    });

    // Kiểm tra xem phiên hiện tại có kết thúc chưa
    const sessionEnded = currentSession && currentSession.endTime <= now;
    const sessionChanged = sessionEnded || !currentSession;

    // Nếu phiên đã kết thúc và chưa được xử lý, gửi settlement message
    if (sessionEnded && currentSession && currentSession.status === 'ACTIVE') {
      console.log('⏰ Phiên đã kết thúc, gửi settlement message:', currentSession.sessionId);
      
      try {
        console.log(`🔍 [SESSION-CHANGE] Session ${currentSession.sessionId} có kết quả: ${currentSession.result}`);
        
        const settlementData = {
          sessionId: currentSession.sessionId,
          result: currentSession.result, // Kết quả đã được định sẵn
          id: `settlement_${currentSession.sessionId}_${Date.now()}`,
          timestamp: new Date().toISOString()
        };

        // Gửi vào queue settlements
        const queueResult = await sendSettlementMessage(settlementData);
        
        if (queueResult) {
          console.log('✅ Đã gửi settlement vào queue:', currentSession.sessionId);
        } else {
          console.log('❌ Không thể gửi settlement vào queue');
        }
      } catch (error) {
        console.error('❌ Lỗi khi gửi settlement vào queue:', error);
      }
    }

    if (sessionChanged) {
      // Tạo phiên mới nếu cần
      if (!currentSession || sessionEnded) {
        // ✅ KIỂM TRA XEM SESSION ĐÃ TỒN TẠI CHƯA
        const existingSession = await db.collection('trading_sessions').findOne({ sessionId });
        
        if (existingSession) {
          // ✅ SỬ DỤNG KẾT QUẢ CÓ SẴN
          console.log(`✅ Sử dụng session có sẵn ${sessionId} với kết quả: ${existingSession.result}`);
          currentSession = existingSession;
        } else {
          // ✅ CHỈ TẠO KẾT QUẢ RANDOM KHI THỰC SỰ TẠO SESSION MỚI
          const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
          
          const newSession = {
            sessionId,
            startTime: currentMinute,
            endTime: nextMinute,
            status: 'ACTIVE',
            result, // Kết quả được tạo sẵn
            processingComplete: false,
            totalTrades: 0,
            totalWins: 0,
            totalLosses: 0,
            totalWinAmount: 0,
            totalLossAmount: 0,
            createdAt: now,
            updatedAt: now
          };

          // Sử dụng upsert để tránh tạo trùng lặp
          await db.collection('trading_sessions').updateOne(
            { sessionId },
            { $setOnInsert: newSession },
            { upsert: true }
          );
          
          currentSession = newSession as any;
          console.log(`✅ Đã tạo phiên mới ${sessionId} với kết quả: ${result}`);
        }
      }
    }

    // Tính thời gian còn lại
    const timeLeft = Math.max(0, Math.floor((nextMinute.getTime() - now.getTime()) / 1000));

    return NextResponse.json({
      success: true,
      sessionChanged,
      currentSession: {
        sessionId: currentSession?.sessionId || sessionId,
        startTime: currentSession?.startTime || currentMinute,
        endTime: currentSession?.endTime || nextMinute,
        timeLeft,
        status: currentSession?.status || 'ACTIVE',
        result: currentSession?.result || null
      },
      serverTime: now.toISOString()
    });

  } catch (error) {
    console.error('Lỗi khi theo dõi thay đổi phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
} 