import { NextRequest, NextResponse } from 'next/server';
import { initializeTradeWorker, tradeWorker } from '@/lib/tradeWorker';
import { cleanupExpiredLocks } from '@/lib/atomicTradeUtils';
import { getQueueStats } from '@/lib/rabbitmq';

export async function POST(request: NextRequest) {
  try {
    // Initialize trade worker
    await initializeTradeWorker();
    
    // Start cleanup interval for expired locks
    setInterval(async () => {
      await cleanupExpiredLocks();
    }, 60000); // Run every minute
    
    return NextResponse.json({
      success: true,
      message: 'RabbitMQ services initialized successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Initialize services error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to initialize services',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get worker status
    const workerStatus = tradeWorker.getStatus();
    
    // Get queue statistics
    const queueStats = await getQueueStats();
    
    return NextResponse.json({
      success: true,
      workerStatus,
      queueStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get services status error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get services status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Stop worker
export async function DELETE(request: NextRequest) {
  try {
    const { stopTradeWorker } = await import('@/lib/tradeWorker');
    await stopTradeWorker();
    
    return NextResponse.json({
      success: true,
      message: 'RabbitMQ services stopped successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Stop services error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to stop services',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
