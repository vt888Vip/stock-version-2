#!/usr/bin/env node

// Script để khởi động Socket.IO server với cấu hình production
const { spawn } = require('child_process');
const path = require('path');

// Set environment variables
process.env.NODE_ENV = 'production';
process.env.SOCKET_PORT = '3001';

console.log('🚀 Starting Socket.IO server in production mode...');
console.log('📡 Domain: hcmlondonvn.com');
console.log('🔒 Protocol: HTTPS');
console.log('⚡ Port: 3001');

// Start the socket server
const socketServer = spawn('node', ['socket-server.js'], {
  stdio: 'inherit',
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    SOCKET_PORT: '3001'
  }
});

socketServer.on('error', (error) => {
  console.error('❌ Failed to start socket server:', error);
  process.exit(1);
});

socketServer.on('exit', (code) => {
  console.log(`📡 Socket server exited with code ${code}`);
  process.exit(code);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down socket server...');
  socketServer.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down socket server...');
  socketServer.kill('SIGTERM');
});
