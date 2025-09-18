#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// ✅ CẤU HÌNH AN TOÀN
const WORKER_COUNT = 4; // Tăng lên 4 workers
const WORKER_RESTART_DELAY = 5000; // 5 giây delay khi restart
const MAX_RESTART_ATTEMPTS = 3; // Tối đa 3 lần restart
const GRACEFUL_SHUTDOWN_TIMEOUT = 10000; // 10 giây timeout

const workers = [];
const workerStats = new Map(); // Track worker stats

console.log(`🚀 Khởi động ${WORKER_COUNT} workers với cấu hình an toàn...`);

// ✅ HÀM TẠO WORKER ID UNIQUE
function generateWorkerId(index) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `worker_${index + 1}_${timestamp}_${random}`;
}

// ✅ HÀM KHỞI TẠO WORKER
function createWorker(index) {
  const workerId = generateWorkerId(index);
  const workerNumber = index + 1;
  
  console.log(`📦 Khởi động Worker ${workerNumber} (ID: ${workerId})...`);
  
  // ✅ KIỂM TRA FILE WORKER TỒN TẠI
  const workerPath = path.join(process.cwd(), 'worker', 'worker.js');
  if (!fs.existsSync(workerPath)) {
    console.error(`❌ Worker file không tồn tại: ${workerPath}`);
    return null;
  }
  
  const worker = spawn('node', ['worker.js'], {
    cwd: path.join(process.cwd(), 'worker'),
    stdio: 'pipe',
    env: {
      ...process.env,
      WORKER_ID: workerId,
      WORKER_NUMBER: workerNumber.toString(),
      NODE_ENV: process.env.NODE_ENV || 'production'
    },
    // ✅ CẤU HÌNH AN TOÀN
    detached: false,
    killSignal: 'SIGTERM'
  });

  // ✅ TRACK WORKER STATS
  workerStats.set(workerId, {
    id: workerId,
    number: workerNumber,
    startTime: Date.now(),
    restartCount: 0,
    lastRestart: null,
    status: 'starting',
    messageCount: 0,
    errorCount: 0
  });

  // ✅ LOG OUTPUT VỚI TIMESTAMP
  worker.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [Worker ${workerNumber}] ${line}`);
        
        // Track message count
        const stats = workerStats.get(workerId);
        if (stats) {
          stats.messageCount++;
        }
      }
    });
  });

  worker.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [Worker ${workerNumber}] ERROR: ${line}`);
        
        // Track error count
        const stats = workerStats.get(workerId);
        if (stats) {
          stats.errorCount++;
        }
      }
    });
  });

  // ✅ XỬ LÝ WORKER EXIT
  worker.on('close', (code, signal) => {
    const stats = workerStats.get(workerId);
    if (stats) {
      stats.status = 'stopped';
      stats.exitCode = code;
      stats.exitSignal = signal;
    }
    
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Worker ${workerNumber}] Đã tắt với code: ${code}, signal: ${signal}`);
    
    // ✅ AUTO RESTART NẾU CẦN THIẾT
    if (code !== 0 && stats && stats.restartCount < MAX_RESTART_ATTEMPTS) {
      console.log(`🔄 [Worker ${workerNumber}] Tự động restart (${stats.restartCount + 1}/${MAX_RESTART_ATTEMPTS})...`);
      
      setTimeout(() => {
        const newWorker = createWorker(index);
        if (newWorker) {
          // Update stats
          stats.restartCount++;
          stats.lastRestart = Date.now();
          stats.status = 'restarting';
          
          // Replace worker in array
          const workerIndex = workers.findIndex(w => w.pid === worker.pid);
          if (workerIndex !== -1) {
            workers[workerIndex] = newWorker;
          }
        }
      }, WORKER_RESTART_DELAY);
    } else if (stats && stats.restartCount >= MAX_RESTART_ATTEMPTS) {
      console.error(`❌ [Worker ${workerNumber}] Đã restart quá ${MAX_RESTART_ATTEMPTS} lần, dừng restart`);
    }
  });

  worker.on('error', (error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [Worker ${workerNumber}] Lỗi:`, error.message);
    
    const stats = workerStats.get(workerId);
    if (stats) {
      stats.errorCount++;
      stats.lastError = error.message;
    }
  });

  // ✅ WORKER STARTED SUCCESSFULLY
  worker.on('spawn', () => {
    const stats = workerStats.get(workerId);
    if (stats) {
      stats.status = 'running';
      stats.pid = worker.pid;
    }
    console.log(`✅ [Worker ${workerNumber}] Đã khởi động thành công (PID: ${worker.pid})`);
  });

  return worker;
}

// ✅ KHỞI TẠO TẤT CẢ WORKERS
for (let i = 0; i < WORKER_COUNT; i++) {
  const worker = createWorker(i);
  if (worker) {
    workers.push(worker);
  }
}

// ✅ HEALTH CHECK FUNCTION
function performHealthCheck() {
  console.log('\n📊 === WORKER HEALTH CHECK ===');
  console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
  console.log(`👥 Total Workers: ${workers.length}`);
  
  let runningCount = 0;
  let totalMessages = 0;
  let totalErrors = 0;
  
  workerStats.forEach((stats, workerId) => {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    const status = stats.status === 'running' ? '✅' : '❌';
    
    console.log(`   ${status} Worker ${stats.number}: ${stats.status} (${uptime}s uptime, ${stats.messageCount} msgs, ${stats.errorCount} errors)`);
    
    if (stats.status === 'running') {
      runningCount++;
    }
    totalMessages += stats.messageCount;
    totalErrors += stats.errorCount;
  });
  
  console.log(`📈 Summary: ${runningCount}/${workers.length} running, ${totalMessages} total messages, ${totalErrors} total errors`);
  console.log('================================\n');
}

// ✅ PERIODIC HEALTH CHECK
setInterval(performHealthCheck, 30000); // Mỗi 30 giây

// ✅ GRACEFUL SHUTDOWN
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Nhận signal ${signal}, đang tắt tất cả workers...`);
  
  // Set status to shutting down
  workerStats.forEach(stats => {
    stats.status = 'shutting_down';
  });
  
  // Send SIGTERM to all workers
  const shutdownPromises = workers.map((worker, index) => {
    return new Promise((resolve) => {
      console.log(`🔄 Đang tắt Worker ${index + 1} (PID: ${worker.pid})...`);
      
      // Send SIGTERM first
      worker.kill('SIGTERM');
      
      // Force kill after timeout
      const forceKillTimeout = setTimeout(() => {
        console.log(`⚡ Force kill Worker ${index + 1}...`);
        worker.kill('SIGKILL');
        resolve();
      }, GRACEFUL_SHUTDOWN_TIMEOUT);
      
      // Wait for graceful shutdown
      worker.on('close', () => {
        clearTimeout(forceKillTimeout);
        console.log(`✅ Worker ${index + 1} đã tắt gracefully`);
        resolve();
      });
    });
  });
  
  try {
    await Promise.all(shutdownPromises);
    console.log('✅ Tất cả workers đã tắt thành công');
    
    // Final health check
    performHealthCheck();
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi trong quá trình shutdown:', error);
    process.exit(1);
  }
}

// ✅ SIGNAL HANDLERS
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// ✅ UNCAUGHT EXCEPTION HANDLER
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ✅ STARTUP MESSAGE
console.log(`✅ Đã khởi động ${workers.length} workers thành công!`);
console.log('📋 Workers đang chạy:');
workers.forEach((worker, index) => {
  console.log(`   - Worker ${index + 1} (PID: ${worker.pid})`);
});
console.log('\n💡 Nhấn Ctrl+C để tắt tất cả workers');
console.log('📊 Health check sẽ chạy mỗi 30 giây');
console.log('🔄 Auto-restart enabled với tối đa 3 lần thử');
