import { NextResponse } from 'next/server';
import { startTradeWorker } from '@/lib/tradeWorker';

export async function POST() {
  try {
    console.log('🚀 Khởi động Trade Worker từ API...');
    
    // Khởi động worker
    await startTradeWorker();
    
    return NextResponse.json({
      success: true,
      message: 'Trade Worker đã được khởi động thành công'
    });
  } catch (error) {
    console.error('❌ Lỗi khởi động Trade Worker:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Lỗi khởi động Trade Worker',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
