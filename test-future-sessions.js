// Test script cho tính năng 30 phiên tương lai
const BASE_URL = 'http://localhost:3000';

async function testFutureSessions() {
  console.log('🧪 Test tính năng 30 phiên tương lai...\n');

  try {
    // Test 1: Xem 30 phiên tương lai
    console.log('1️⃣ Test xem 30 phiên tương lai...');
    const futureResponse = await fetch(`${BASE_URL}/api/admin/session-results/future`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer admin_token_here', // Cần token admin thật
        'Content-Type': 'application/json'
      }
    });

    if (futureResponse.ok) {
      const futureResult = await futureResponse.json();
      if (futureResult.success) {
        console.log('✅ Xem phiên tương lai:', `Có ${futureResult.data.sessions.length} phiên`);
        console.log('   - Phiên đầu tiên:', futureResult.data.sessions[0]?.sessionId);
        console.log('   - Phiên cuối cùng:', futureResult.data.sessions[futureResult.data.sessions.length - 1]?.sessionId);
      } else {
        console.log('❌ Xem phiên tương lai:', futureResult.message);
      }
    } else {
      console.log('❌ Xem phiên tương lai:', futureResponse.status);
    }

    // Test 2: Tạo lại 30 phiên tương lai
    console.log('\n2️⃣ Test tạo lại 30 phiên tương lai...');
    const regenerateResponse = await fetch(`${BASE_URL}/api/admin/session-results/future`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer admin_token_here', // Cần token admin thật
        'Content-Type': 'application/json'
      }
    });

    if (regenerateResponse.ok) {
      const regenerateResult = await regenerateResponse.json();
      console.log('✅ Tạo lại phiên:', regenerateResult.success ? 'Thành công' : 'Thất bại');
    } else {
      console.log('❌ Tạo lại phiên:', regenerateResponse.status);
    }

    // Test 3: Điều khiển background service
    console.log('\n3️⃣ Test điều khiển background service...');
    const controlResponse = await fetch(`${BASE_URL}/api/admin/future-sessions/control`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer admin_token_here', // Cần token admin thật
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'status' })
    });

    if (controlResponse.ok) {
      const controlResult = await controlResponse.json();
      if (controlResult.success) {
        console.log('✅ Trạng thái service:', controlResult.data);
      } else {
        console.log('❌ Trạng thái service:', controlResult.message);
      }
    } else {
      console.log('❌ Trạng thái service:', controlResponse.status);
    }

    console.log('\n🎉 Test hoàn thành!');
    console.log('📝 Lưu ý:');
    console.log('   - Cần token admin thật để test');
    console.log('   - Background service tự động chạy mỗi 5 phút');
    console.log('   - Admin có thể xem 30 phiên tương lai trong trang admin');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error);
  }
}

// Chạy test
testFutureSessions();
