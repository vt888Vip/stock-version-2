import { NextResponse } from 'next/server';
import { initializeFutureSessionsManager } from '@/lib/futureSessionsManager';

export async function GET() {
  try {
    // Khởi động FutureSessionsManager
    initializeFutureSessionsManager();
    
    return NextResponse.json({
      success: true,
      message: 'Services initialized successfully'
    });
  } catch (error) {
    console.error('Error initializing services:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to initialize services',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
