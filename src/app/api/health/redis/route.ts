import { NextRequest, NextResponse } from 'next/server';
import { redisManager } from '@/lib/redis';
import { atomicOperationsHealthCheck } from '@/lib/atomicOperations';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('🔍 [HEALTH] Checking Redis and Atomic Operations health...');
    
    // Check Redis health
    const redisHealth = await redisManager.healthCheck();
    
    // Check atomic operations health
    const atomicHealth = await atomicOperationsHealthCheck();
    
    const isHealthy = redisHealth.healthy && atomicHealth.mongodb.healthy;
    
    const response = {
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
      services: {
        redis: redisHealth,
        mongodb: atomicHealth.mongodb,
        atomicOperations: {
          healthy: atomicHealth.redis.healthy && atomicHealth.mongodb.healthy,
          redis: atomicHealth.redis,
          mongodb: atomicHealth.mongodb
        }
      },
      status: isHealthy ? 'OK' : 'ERROR'
    };

    console.log(`✅ [HEALTH] Health check completed: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    
    return NextResponse.json(response, { 
      status: isHealthy ? 200 : 503 
    });

  } catch (error) {
    console.error('❌ [HEALTH] Health check failed:', error);
    
    return NextResponse.json({
      healthy: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'ERROR'
    }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'test-lock':
        return await testRedisLock();
      
      case 'test-atomic-operation':
        return await testAtomicOperation();
      
      case 'clear-cache':
        return await clearRedisCache();
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: test-lock, test-atomic-operation, clear-cache'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ [HEALTH] POST health check failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function testRedisLock(): Promise<NextResponse> {
  try {
    const testKey = `test:lock:${Date.now()}`;
    const ttl = 5000; // 5 seconds
    
    console.log(`🧪 [HEALTH] Testing Redis lock: ${testKey}`);
    
    // Test lock acquisition
    const acquired = await redisManager.acquireLock(testKey, ttl);
    
    if (!acquired) {
      return NextResponse.json({
        success: false,
        error: 'Failed to acquire test lock'
      }, { status: 500 });
    }
    
    // Test lock release
    const released = await redisManager.releaseLock(testKey);
    
    if (!released) {
      return NextResponse.json({
        success: false,
        error: 'Failed to release test lock'
      }, { status: 500 });
    }
    
    console.log(`✅ [HEALTH] Redis lock test successful`);
    
    return NextResponse.json({
      success: true,
      message: 'Redis lock test successful',
      testKey,
      ttl
    });

  } catch (error) {
    console.error('❌ [HEALTH] Redis lock test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function testAtomicOperation(): Promise<NextResponse> {
  try {
    console.log(`🧪 [HEALTH] Testing atomic operation...`);
    
    const testUserId = `test_user_${Date.now()}`;
    const testSessionId = `test_session_${Date.now()}`;
    
    // Test atomic operation with retry
    const result = await redisManager.acquireLockWithRetry(
      `test:atomic:${testUserId}`,
      5000, // 5 seconds TTL
      3, // 3 retries
      100 // 100ms initial delay
    );
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'Failed to acquire lock with retry'
      }, { status: 500 });
    }
    
    // Release the test lock
    await redisManager.releaseLock(`test:atomic:${testUserId}`);
    
    console.log(`✅ [HEALTH] Atomic operation test successful`);
    
    return NextResponse.json({
      success: true,
      message: 'Atomic operation test successful',
      testUserId,
      testSessionId
    });

  } catch (error) {
    console.error('❌ [HEALTH] Atomic operation test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function clearRedisCache(): Promise<NextResponse> {
  try {
    console.log(`🧹 [HEALTH] Clearing Redis cache...`);
    
    const client = redisManager.getClient();
    
    // Get all keys matching patterns
    const patterns = [
      'user:*:balance',
      'trade:*:processed',
      'session:*:result',
      'lock:*'
    ];
    
    let totalCleared = 0;
    
    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
        totalCleared += keys.length;
        console.log(`🧹 [HEALTH] Cleared ${keys.length} keys matching ${pattern}`);
      }
    }
    
    console.log(`✅ [HEALTH] Cache clear completed: ${totalCleared} keys cleared`);
    
    return NextResponse.json({
      success: true,
      message: `Cache cleared successfully`,
      keysCleared: totalCleared,
      patterns
    });

  } catch (error) {
    console.error('❌ [HEALTH] Cache clear failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
