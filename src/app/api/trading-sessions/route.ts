import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    console.log('📋 [TRADING-SESSIONS] Getting current session info');
    
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const now = new Date();
    const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
    const nextMinute = new Date(currentMinute.getTime() + 60000);

    // Tạo sessionId cho phiên hiện tại
    const sessionId = `${currentMinute.getUTCFullYear()}${String(currentMinute.getUTCMonth() + 1).padStart(2, '0')}${String(currentMinute.getUTCDate()).padStart(2, '0')}${String(currentMinute.getUTCHours()).padStart(2, '0')}${String(currentMinute.getUTCMinutes()).padStart(2, '0')}`;

    // Tìm session hiện tại
    const currentSession = await db.collection('trading_sessions').findOne({ 
      sessionId: sessionId
    });

    // Tính thời gian còn lại
    const timeLeft = Math.max(0, Math.floor((nextMinute.getTime() - now.getTime()) / 1000));

    const response = {
      success: true,
      currentSession: {
        sessionId: sessionId,
        startTime: currentMinute.toISOString(),
        endTime: nextMinute.toISOString(),
        status: currentSession?.status || 'ACTIVE',
        result: currentSession?.result || null,
        timeLeft: timeLeft
      }
    };

    console.log(`✅ [TRADING-SESSIONS] Retrieved session ${sessionId} with ${timeLeft}s left`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [TRADING-SESSIONS] Error getting session info:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to get session info',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
