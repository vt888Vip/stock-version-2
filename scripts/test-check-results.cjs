const mongoose = require('mongoose');

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial_platform';

async function testCheckResults() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    // Tìm session có trades pending
    const sessionsWithPendingTrades = await db.collection('trades').aggregate([
      {
        $match: {
          status: 'pending'
        }
      },
      {
        $group: {
          _id: '$sessionId',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    console.log(`📊 Tìm thấy ${sessionsWithPendingTrades.length} sessions có trades pending`);

    if (sessionsWithPendingTrades.length === 0) {
      console.log('✅ Không có trades pending nào để test');
      return;
    }

    // Lấy session đầu tiên để test
    const testSessionId = sessionsWithPendingTrades[0]._id;
    const pendingCount = sessionsWithPendingTrades[0].count;
    
    console.log(`🎯 Test session: ${testSessionId} với ${pendingCount} trades pending`);

    // Kiểm tra session status
    const sessionInfo = await db.collection('trading_sessions').findOne({ sessionId: testSessionId });
    console.log(`📋 Session info:`, {
      sessionId: sessionInfo?.sessionId,
      status: sessionInfo?.status,
      result: sessionInfo?.result,
      endTime: sessionInfo?.endTime,
      processingComplete: sessionInfo?.processingComplete
    });

    // Test API check-results
    console.log('\n🚀 Bắt đầu test API check-results...');
    
    const startTime = Date.now();
    
    // Gọi API check-results
    const response = await fetch('http://localhost:3000/api/trades/check-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        sessionId: testSessionId
      })
    });

    const result = await response.json();
    const endTime = Date.now();
    
    console.log(`⏱️ Thời gian xử lý: ${endTime - startTime}ms`);
    console.log(`📊 Kết quả:`, result);

    // Kiểm tra trades sau khi xử lý
    const remainingPendingTrades = await db.collection('trades').countDocuments({
      sessionId: testSessionId,
      status: 'pending'
    });

    const completedTrades = await db.collection('trades').countDocuments({
      sessionId: testSessionId,
      status: 'completed'
    });

    const errorTrades = await db.collection('trades').countDocuments({
      sessionId: testSessionId,
      status: 'error'
    });

    console.log(`📊 Sau khi xử lý:`);
    console.log(`   - Trades pending còn lại: ${remainingPendingTrades}`);
    console.log(`   - Trades completed: ${completedTrades}`);
    console.log(`   - Trades error: ${errorTrades}`);

    // Kiểm tra balance errors
    const balanceErrorTrades = await db.collection('trades').find({
      sessionId: testSessionId,
      balanceError: true
    }).toArray();

    if (balanceErrorTrades.length > 0) {
      console.log(`🚨 Tìm thấy ${balanceErrorTrades.length} trades có lỗi balance:`);
      for (const trade of balanceErrorTrades.slice(0, 3)) {
        console.log(`   - Trade ${trade._id}: ${trade.balanceErrorReason}`);
      }
    }

    // Kiểm tra session completion
    const updatedSession = await db.collection('trading_sessions').findOne({ sessionId: testSessionId });
    console.log(`📋 Session sau khi xử lý:`, {
      processingComplete: updatedSession?.processingComplete,
      result: updatedSession?.result,
      status: updatedSession?.status
    });

  } catch (error) {
    console.error('❌ Lỗi test check-results:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  testCheckResults()
    .then(() => {
      console.log('✅ Script test check-results hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script test check-results thất bại:', error);
      process.exit(1);
    });
}

module.exports = { testCheckResults };
