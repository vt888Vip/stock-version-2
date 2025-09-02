import { rabbitMQManager } from './rabbitmq';

// Global flag to track initialization
let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Auto-initialize RabbitMQ connection
 * This function is safe to call multiple times
 */
export async function initializeRabbitMQ(): Promise<void> {
  // If already initialized, return immediately
  if (isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = performInitialization();
  
  try {
    await initPromise;
    isInitialized = true;
    console.log('✅ RabbitMQ auto-initialized successfully');
  } catch (error) {
    console.error('❌ RabbitMQ auto-initialization failed:', error);
    initPromise = null; // Reset so we can try again
    throw error;
  }
}

async function performInitialization(): Promise<void> {
  try {
    console.log('🔄 Auto-initializing RabbitMQ connection...');
    
    // Check if already connected - SỬA: Chỉ connect nếu thực sự cần
    if (rabbitMQManager.isConnectionActive()) {
      console.log('✅ RabbitMQ already connected - reusing existing connection');
      return;
    }

    // Chỉ connect khi thực sự cần thiết
    console.log('🔗 Creating new RabbitMQ connection...');
    await rabbitMQManager.connect();
    
    console.log('✅ RabbitMQ connection established');
  } catch (error) {
    console.error('❌ Failed to initialize RabbitMQ:', error);
    throw error;
  }
}

/**
 * Get RabbitMQ connection status
 */
export function getRabbitMQStatus(): { isInitialized: boolean; isConnected: boolean } {
  return {
    isInitialized,
    isConnected: rabbitMQManager.isConnectionActive()
  };
}

/**
 * Reset initialization state (for testing)
 */
export function resetRabbitMQInitialization(): void {
  isInitialized = false;
  initPromise = null;
}
