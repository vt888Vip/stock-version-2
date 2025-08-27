import { NextResponse } from 'next/server';
import { getQueueInfo } from '@/lib/rabbitmq';

export async function GET() {
  try {
    const queueInfo = await getQueueInfo();
    
    return NextResponse.json({
      success: true,
      data: queueInfo
    });
  } catch (error) {
    console.error('❌ Lỗi lấy thông tin queue:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Lỗi lấy thông tin queue',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
