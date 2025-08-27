// Test script để kiểm tra balance update ngay lập tức
const BASE_URL = 'http://localhost:3000';

// Giả lập token (cần thay bằng token thật)
const TOKEN = 'your_token_here';

async function testBalanceUpdate() {
  console.log('🧪 Test Balance Update Ngay Lập Tức...\n');

  try {
    // Test 1: Lấy balance hiện tại
    console.log('1️⃣ Lấy balance hiện tại...');
    const balanceResponse = await fetch(`${BASE_URL}/api/user/balance`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });

    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json();
      if (balanceData.success) {
        console.log('💰 Balance hiện tại:', {
          available: balanceData.balance.available,
          frozen: balanceData.balance.frozen,
          total: balanceData.balance.total
        });
      } else {
        console.log('❌ Lấy balance:', balanceData.message);
        return;
      }
    } else {
      console.log('❌ Lấy balance:', balanceResponse.status);
      return;
    }

    // Test 2: Đặt lệnh và kiểm tra balance update
    console.log('\n2️⃣ Đặt lệnh và kiểm tra balance update...');
    const amount = 100000; // 100k VND
    const sessionId = '202501271200'; // Session ID mẫu
    
    const tradeResponse = await fetch(`${BASE_URL}/api/trades/place`, {
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
    });

    if (tradeResponse.ok) {
      const tradeData = await tradeResponse.json();
      if (tradeData.success) {
        console.log('✅ Đặt lệnh thành công!');
        console.log('📊 Thông tin balance:');
        console.log('   - Balance trước:', tradeData.balanceBefore);
        console.log('   - Balance sau:', tradeData.balanceAfter);
        console.log('   - Thay đổi available:', tradeData.balanceBefore.available - tradeData.balanceAfter.available);
        console.log('   - Thay đổi frozen:', tradeData.balanceAfter.frozen - tradeData.balanceBefore.frozen);
        
        // Kiểm tra tính chính xác
        const expectedAvailable = tradeData.balanceBefore.available - amount;
        const expectedFrozen = tradeData.balanceBefore.frozen + amount;
        
        if (tradeData.balanceAfter.available === expectedAvailable && 
            tradeData.balanceAfter.frozen === expectedFrozen) {
          console.log('✅ Balance update chính xác!');
        } else {
          console.log('❌ Balance update không chính xác!');
        }
      } else {
        console.log('❌ Đặt lệnh thất bại:', tradeData.message);
      }
    } else {
      console.log('❌ Đặt lệnh:', tradeResponse.status);
    }

    // Test 3: Kiểm tra balance sau khi đặt lệnh
    console.log('\n3️⃣ Kiểm tra balance sau khi đặt lệnh...');
    const balanceAfterResponse = await fetch(`${BASE_URL}/api/user/balance`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });

    if (balanceAfterResponse.ok) {
      const balanceAfterData = await balanceAfterResponse.json();
      if (balanceAfterData.success) {
        console.log('💰 Balance sau khi đặt lệnh:', {
          available: balanceAfterData.balance.available,
          frozen: balanceAfterData.balance.frozen,
          total: balanceAfterData.balance.total
        });
      }
    }

    console.log('\n🎉 Test hoàn thành!');
    console.log('📝 Kết quả mong đợi:');
    console.log('   - Balance available giảm đúng số tiền đặt lệnh');
    console.log('   - Balance frozen tăng đúng số tiền đặt lệnh');
    console.log('   - Frontend cập nhật balance ngay lập tức');
    console.log('   - Không có race condition');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error);
  }
}

// Chạy test
testBalanceUpdate();
