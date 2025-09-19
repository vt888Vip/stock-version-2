import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const count = parseInt(searchParams.get('count') || '30');

      const now = new Date();
      const predictions = [];

      // ✅ SAFE: Chỉ tạo dự đoán, không tạo session thật
      for (let i = 1; i <= count; i++) {
        const sessionStartTime = new Date(now.getTime() + (i * 60000));
        const sessionEndTime = new Date(sessionStartTime.getTime() + 60000);
        const sessionId = generateSessionId(sessionStartTime);
        
        // Tạo dự đoán kết quả (50% UP, 50% DOWN)
        const random = Math.random();
        const predictedResult = random < 0.5 ? 'UP' : 'DOWN';
        
        predictions.push({
          sessionId,
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          predictedResult,
          timeUntilStart: Math.max(0, sessionStartTime.getTime() - now.getTime()),
          minutesFromNow: i
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          predictions,
          total: predictions.length,
          note: "Đây chỉ là dự đoán, không phải session thật. Scheduler sẽ tạo session thật khi đến thời điểm."
        }
      });

    } catch (error) {
      console.error('Error generating predictions:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Hàm tạo sessionId
function generateSessionId(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}${minute}`;
}
