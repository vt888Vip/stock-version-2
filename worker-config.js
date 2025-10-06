// ✅ CẤU HÌNH CHO MULTIPLE WORKERS
export const WORKER_CONFIG = {
  // Số lượng workers
  WORKER_COUNT: 4,
  
  // Prefetch count cho mỗi worker
  PREFETCH_COUNT: 10,
  
  // Timeout settings
  LOCK_TIMEOUT: 30000,        // 30 giây
  PROCESSING_TIMEOUT: 60000,  // 1 phút
  SHUTDOWN_TIMEOUT: 10000,    // 10 giây
  
  // Retry settings
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 5000,          // 5 giây
  
  // Health check interval
  HEALTH_CHECK_INTERVAL: 30000, // 30 giây
  
  // Log settings
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: true,
  
  // Performance settings
  BATCH_SIZE: 50,
  CONCURRENT_PROCESSING: true,
  
  // Database settings
  MONGODB_POOL_SIZE: 100,
  REDIS_POOL_SIZE: 50,
  
  // Queue settings
  QUEUE_PRIORITY: {
    HIGH: 10,
    NORMAL: 5,
    LOW: 1
  }
};

// ✅ ENVIRONMENT VARIABLES
export const ENV_CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  WORKER_ID: process.env.WORKER_ID || 'default',
  WORKER_NUMBER: process.env.WORKER_NUMBER || '1',
  WORKER_PREFETCH: process.env.WORKER_PREFETCH || '10',
  
  // Database URLs
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://stock-version-2:Vincent79@stockdb.ssitqfx.mongodb.net/finacial_platfom',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://trading_user:trading_password@localhost:5672',
  
  // Socket.IO
  SOCKET_SERVER_URL: process.env.SOCKET_SERVER_URL || (process.env.NODE_ENV === 'production' ? 'https://hcmlondonvn.com:3001' : 'http://localhost:3001'),
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key'
};

// ✅ WORKER HEALTH STATUS
export const WORKER_STATUS = {
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
  RESTARTING: 'restarting'
};

// ✅ PERFORMANCE METRICS
export const METRICS = {
  MESSAGES_PROCESSED: 0,
  ERRORS_COUNT: 0,
  START_TIME: Date.now(),
  LAST_ACTIVITY: Date.now()
};

// ✅ UTILITY FUNCTIONS
export function getWorkerInfo() {
  return {
    id: ENV_CONFIG.WORKER_ID,
    number: ENV_CONFIG.WORKER_NUMBER,
    pid: process.pid,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    startTime: METRICS.START_TIME
  };
}

export function updateMetrics(type, count = 1) {
  switch (type) {
    case 'message':
      METRICS.MESSAGES_PROCESSED += count;
      break;
    case 'error':
      METRICS.ERRORS_COUNT += count;
      break;
  }
  METRICS.LAST_ACTIVITY = Date.now();
}

export function getMetrics() {
  return {
    ...METRICS,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    workerInfo: getWorkerInfo()
  };
}
