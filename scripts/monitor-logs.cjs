const mongoose = require('mongoose');

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial_platform';

async function monitorLogs() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log('\n📊 === MONITORING TRADING SYSTEM ===');
    console.log('🔍 Kiểm tra trạng thái hệ thống...\n');

    // 1. Kiểm tra sessions đang active
    const activeSessions = await db.collection('trading_sessions').find({
      status: 'ACTIVE',
      endTime: { $gt: new Date() }
    }).toArray();

    console.log(`📅 Sessions đang active: ${activeSessions.length}`);
    for (const session of activeSessions) {
      console.log(`   - ${session.sessionId}: ${session.endTime}`);
    }

    // 2. Kiểm tra trades pending
    const pendingTrades = await db.collection('trades').find({
      status: 'pending'
    }).toArray();

    console.log(`\n⏳ Trades pending: ${pendingTrades.length}`);
    
    // Group by session
    const tradesBySession = {};
    for (const trade of pendingTrades) {
      if (!tradesBySession[trade.sessionId]) {
        tradesBySession[trade.sessionId] = [];
      }
      tradesBySession[trade.sessionId].push(trade);
    }

    for (const [sessionId, trades] of Object.entries(tradesBySession)) {
      console.log(`   - Session ${sessionId}: ${trades.length} trades`);
      
      // Group by user
      const tradesByUser = {};
      for (const trade of trades) {
        const userId = trade.userId.toString();
        if (!tradesByUser[userId]) {
          tradesByUser[userId] = [];
        }
        tradesByUser[userId].push(trade);
      }
      
      for (const [userId, userTrades] of Object.entries(tradesByUser)) {
        const totalAmount = userTrades.reduce((sum, t) => sum + t.amount, 0);
        console.log(`     User ${userId}: ${userTrades.length} trades, ${totalAmount.toLocaleString()} VND`);
      }
    }

    // 3. Kiểm tra balance issues
    const usersWithNegativeFrozen = await db.collection('users').find({
      'balance.frozen': { $lt: 0 }
    }).toArray();

    console.log(`\n🚨 Users có frozen âm: ${usersWithNegativeFrozen.length}`);
    for (const user of usersWithNegativeFrozen.slice(0, 5)) {
      console.log(`   - User ${user._id}: available=${user.balance?.available}, frozen=${user.balance?.frozen}`);
    }

    // 4. Kiểm tra balance errors
    const balanceErrorTrades = await db.collection('trades').find({
      balanceError: true
    }).toArray();

    console.log(`\n❌ Trades có lỗi balance: ${balanceErrorTrades.length}`);
    for (const trade of balanceErrorTrades.slice(0, 5)) {
      console.log(`   - Trade ${trade._id}: ${trade.balanceErrorReason} - ${trade.amount} VND`);
    }

    // 5. Kiểm tra session locks
    const activeLocks = await db.collection('session_locks').find({
      lockedUntil: { $gt: new Date() }
    }).toArray();

    console.log(`\n🔒 Session locks đang active: ${activeLocks.length}`);
    for (const lock of activeLocks) {
      console.log(`   - ${lock._id}: ${lock.sessionId} - ${lock.processId}`);
    }

    // 6. Kiểm tra completed trades hôm nay
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const completedTradesToday = await db.collection('trades').find({
      status: 'completed',
      completedAt: { $gte: today }
    }).toArray();

    console.log(`\n✅ Trades completed hôm nay: ${completedTradesToday.length}`);
    
    const winTrades = completedTradesToday.filter(t => t.result === 'win');
    const loseTrades = completedTradesToday.filter(t => t.result === 'lose');
    
    console.log(`   - Thắng: ${winTrades.length}`);
    console.log(`   - Thua: ${loseTrades.length}`);
    
    const totalProfit = winTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    console.log(`   - Tổng profit: ${totalProfit.toLocaleString()} VND`);

    // 7. Kiểm tra performance
    console.log('\n📈 === PERFORMANCE METRICS ===');
    
    // Average processing time
    const recentCompletedTrades = await db.collection('trades').find({
      status: 'completed',
      completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24h
    }).toArray();

    if (recentCompletedTrades.length > 0) {
      const avgProcessingTime = recentCompletedTrades.reduce((sum, trade) => {
        const processingTime = trade.completedAt - trade.createdAt;
        return sum + processingTime;
      }, 0) / recentCompletedTrades.length;

      console.log(`⏱️ Thời gian xử lý trung bình: ${Math.round(avgProcessingTime / 1000)}s`);
    }

    // 8. Recommendations
    console.log('\n💡 === RECOMMENDATIONS ===');
    
    if (usersWithNegativeFrozen.length > 0) {
      console.log('⚠️ Cần chạy script fix-negative-balance');
    }
    
    if (balanceErrorTrades.length > 0) {
      console.log('⚠️ Cần kiểm tra logic balance update');
    }
    
    if (activeLocks.length > 10) {
      console.log('⚠️ Có nhiều locks active, cần kiểm tra cleanup');
    }

    console.log('\n✅ Monitoring hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi monitoring:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  monitorLogs()
    .then(() => {
      console.log('✅ Script monitor logs hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script monitor logs thất bại:', error);
      process.exit(1);
    });
}

module.exports = { monitorLogs };
