#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';

const WORKER_COUNT = 3; // Số lượng workers
const workers = [];

console.log(`🚀 Khởi động ${WORKER_COUNT} workers...`);

// Khởi động nhiều workers
for (let i = 0; i < WORKER_COUNT; i++) {
  const workerId = i + 1;
  console.log(`📦 Khởi động Worker ${workerId}...`);
  
  const worker = spawn('node', ['worker.js'], {
    cwd: path.join(process.cwd(), 'worker'),
    stdio: 'pipe',
    env: {
      ...process.env,
      WORKER_ID: workerId.toString()
    }
  });

  // Log output của từng worker
  worker.stdout.on('data', (data) => {
    console.log(`[Worker ${workerId}] ${data.toString().trim()}`);
  });

  worker.stderr.on('data', (data) => {
    console.error(`[Worker ${workerId}] ERROR: ${data.toString().trim()}`);
  });

  worker.on('close', (code) => {
    console.log(`[Worker ${workerId}] Đã tắt với code: ${code}`);
  });

  worker.on('error', (error) => {
    console.error(`[Worker ${workerId}] Lỗi:`, error.message);
  });

  workers.push(worker);
}

// Xử lý tắt tất cả workers khi nhận SIGINT
process.on('SIGINT', () => {
  console.log('\n🛑 Đang tắt tất cả workers...');
  
  workers.forEach((worker, index) => {
    console.log(`Tắt Worker ${index + 1}...`);
    worker.kill('SIGINT');
  });
  
  setTimeout(() => {
    console.log('✅ Tất cả workers đã tắt');
    process.exit(0);
  }, 2000);
});

console.log(`✅ Đã khởi động ${WORKER_COUNT} workers thành công!`);
console.log('📋 Workers đang chạy:');
workers.forEach((_, index) => {
  console.log(`   - Worker ${index + 1}`);
});
console.log('\n💡 Nhấn Ctrl+C để tắt tất cả workers');
