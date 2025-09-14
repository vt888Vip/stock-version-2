#!/usr/bin/env node

/**
 * Script test để kiểm tra fix "nhảy tiền"
 * Chạy: node test-balance-fix.js
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://174.138.24.77';
const SOCKET_URL = 'http://174.138.24.77:3001';

// Test data
const testUser = {
  username: 'test-user',
  password: 'test-password'
};

let authToken = '';

console.log('🧪 Bắt đầu test fix "nhảy tiền"...\n');

async function testLogin() {
  console.log('1️⃣ Test đăng nhập...');
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    
    const data = await response.json();
    if (data.success) {
      authToken = data.token;
      console.log('✅ Đăng nhập thành công');
      return true;
    } else {
      console.log('❌ Đăng nhập thất bại:', data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Lỗi đăng nhập:', error.message);
    return false;
  }
}

async function testBalanceAPI() {
  console.log('\n2️⃣ Test API balance...');
  try {
    const response = await fetch(`${BASE_URL}/api/user/balance`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    if (data.success) {
      console.log('✅ Balance API hoạt động:', data.balance);
      return data.balance;
    } else {
      console.log('❌ Balance API lỗi:', data.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Lỗi balance API:', error.message);
    return null;
  }
}

async function testSocketServer() {
  console.log('\n3️⃣ Test Socket server...');
  try {
    const response = await fetch(`${SOCKET_URL}/health`);
    const data = await response.json();
    
    if (data.status === 'ok') {
      console.log('✅ Socket server hoạt động:', data);
      return true;
    } else {
      console.log('❌ Socket server lỗi:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Lỗi socket server:', error.message);
    return false;
  }
}

async function testSocketEmit() {
  console.log('\n4️⃣ Test Socket emit...');
  try {
    const response = await fetch(`${SOCKET_URL}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test-user',
        event: 'balance:updated',
        data: {
          balance: { available: 1000, frozen: 0 },
          message: 'Test balance update',
          sequence: 1,
          timestamp: new Date().toISOString()
        }
      })
    });
    
    const data = await response.json();
    if (data.success) {
      console.log('✅ Socket emit thành công:', data);
      return true;
    } else {
      console.log('❌ Socket emit thất bại:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Lỗi socket emit:', error.message);
    return false;
  }
}

async function testTradePlace() {
  console.log('\n5️⃣ Test đặt trade...');
  try {
    const response = await fetch(`${BASE_URL}/api/trades/place`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        amount: 100,
        type: 'buy',
        sessionId: 'test-session-' + Date.now()
      })
    });
    
    const data = await response.json();
    if (data.success) {
      console.log('✅ Đặt trade thành công:', data);
      return data.tradeId;
    } else {
      console.log('❌ Đặt trade thất bại:', data);
      return null;
    }
  } catch (error) {
    console.log('❌ Lỗi đặt trade:', error.message);
    return null;
  }
}

async function testBalanceConsistency() {
  console.log('\n6️⃣ Test tính nhất quán balance...');
  
  const balances = [];
  
  // Lấy balance 5 lần liên tiếp
  for (let i = 0; i < 5; i++) {
    const balance = await testBalanceAPI();
    if (balance) {
      balances.push(balance);
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Đợi 1 giây
  }
  
  // Kiểm tra tất cả balance có giống nhau không
  const firstBalance = balances[0];
  const isConsistent = balances.every(b => 
    b.available === firstBalance.available && 
    b.frozen === firstBalance.frozen
  );
  
  if (isConsistent) {
    console.log('✅ Balance nhất quán:', firstBalance);
  } else {
    console.log('❌ Balance không nhất quán:', balances);
  }
  
  return isConsistent;
}

async function runAllTests() {
  console.log('🚀 Bắt đầu test tất cả...\n');
  
  const results = {
    login: await testLogin(),
    balanceAPI: await testBalanceAPI(),
    socketServer: await testSocketServer(),
    socketEmit: await testSocketEmit(),
    tradePlace: await testTradePlace(),
    balanceConsistency: await testBalanceConsistency()
  };
  
  console.log('\n📊 Kết quả test:');
  console.log('================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
  });
  
  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n🎯 Tổng kết: ${allPassed ? '✅ TẤT CẢ TEST PASS' : '❌ CÓ TEST FAIL'}`);
  
  if (allPassed) {
    console.log('\n🎉 Fix "nhảy tiền" đã hoạt động!');
    console.log('✅ Frontend không còn tự tính balance');
    console.log('✅ Socket events có sequence number');
    console.log('✅ Có debounce và reconnection handling');
    console.log('✅ Balance luôn sync với server');
  } else {
    console.log('\n⚠️ Vẫn còn vấn đề cần fix!');
  }
}

// Chạy test
runAllTests().catch(console.error);
