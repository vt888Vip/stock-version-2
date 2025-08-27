// Test script để kiểm tra race condition
const BASE_URL = 'http://localhost:3000';

// Giả lập token (cần thay bằng token thật)
const TOKEN = 'your_token_here';

async function testRaceCondition() {
  console.log('🧪 Test Race Condition...\n');

  try {
    // Test 1: Đặt lệnh và đồng thời gọi balance API
    console.log('1️⃣ Test đặt lệnh + balance API đồng thời...');
    
    const amount = 100000; // 100k VND
    const sessionId = '202501271200'; // Session ID mẫu
    
    // Tạo 5 request đồng thời
    const promises = [];
    
    // Request 1: Đặt lệnh
    promises.push(
      fetch(`${BASE_URL}/api/trades/place`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`
        },
        body: JSON.stringify({
          sessionId,
          direction: 'UP',
          amount
        })
      }).then(res => res.json()).then(data => ({ type: 'place_trade', data }))
    );
    
    // Request 2-5: Gọi balance API (giả lập polling)
    for (let i = 0; i < 4; i++) {
      promises.push(
        fetch(`${BASE_URL}/api/user/balance`, {
          headers: {
            'Authorization': `Bearer ${TOKEN}`
          }
        }).then(res => res.json()).then(data => ({ type: `balance_${i+1}`, data }))
      );
    }
    
    // Chạy tất cả request đồng thời
    const results = await Promise.all(promises);
    
    console.log('📊 Kết quả:');
    results.forEach(result => {
      console.log(`   ${result.type}:`, result.data.success ? '✅ Thành công' : '❌ Thất bại');
      if (result.type === 'place_trade' && result.data.success) {
        console.log(`   - Balance trước: ${result.data.balanceBefore}`);
        console.log(`   - Balance sau: ${result.data.balanceAfter}`);
      }
    });
    
    // Test 2: Kiểm tra balance consistency
    console.log('\n2️⃣ Test balance consistency...');
    const balanceResponse = await fetch(`${BASE_URL}/api/user/balance`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json();
      console.log('   Balance hiện tại:', balanceData.balance);
    }
    
    console.log('\n🎉 Test hoàn thành!');
    console.log('📝 Lưu ý:');
    console.log('   - Nếu balance không nhất quán, có race condition');
    console.log('   - Nếu tất cả request thành công, atomic operations hoạt động tốt');
    
  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error);
  }
}

// Chạy test
testRaceCondition();
