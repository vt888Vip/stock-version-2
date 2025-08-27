const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value && !process.env[key]) {
      process.env[key] = value.trim();
    }
  });
}

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/finacial_platfom';

async function debugSession(sessionId) {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log(`\n🔍 === DEBUG SESSION: ${sessionId} ===\n`);

    // 1. Kiểm tra session
    console.log('📋 Kiểm tra trading session...');
    const session = await db.collection('trading_sessions').findOne({ sessionId });
    
    if (!session) {
      console.log('❌ Không tìm thấy session!');
      return;
    }

    console.log('✅ Session found:', {
      sessionId: session.sessionId,
      status: session.status,
      result: session.result,
      processingComplete: session.processingComplete,
      endTime: session.endTime,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });

    // 2. Kiểm tra trades trong session
    console.log('\n📊 Kiểm tra trades trong session...');
    const trades = await db.collection('trades').find({ sessionId }).toArray();
    
    console.log(`📈 Tổng trades: ${trades.length}`);
    
    const tradesByStatus = {};
    for (const trade of trades) {
      const status = trade.status || 'unknown';
      if (!tradesByStatus[status]) {
        tradesByStatus[status] = [];
      }
      tradesByStatus[status].push(trade);
    }

    for (const [status, statusTrades] of Object.entries(tradesByStatus)) {
      console.log(`   - ${status}: ${statusTrades.length} trades`);
      
      if (status === 'pending') {
        for (const trade of statusTrades.slice(0, 3)) {
          console.log(`     Trade ${trade._id}: ${trade.direction} ${trade.amount} VND - appliedToBalance: ${trade.appliedToBalance}`);
        }
      }
    }

    // 3. Kiểm tra session locks
    console.log('\n🔒 Kiểm tra session locks...');
    const locks = await db.collection('session_locks').find({
      _id: `session_lock_${sessionId}`
    }).toArray();

    console.log(`🔒 Active locks: ${locks.length}`);
    for (const lock of locks) {
      console.log(`   - ${lock._id}: ${lock.sessionId} - ${lock.processId} - ${lock.lockedUntil}`);
    }

    // 4. Kiểm tra balance của users có trades trong session
    console.log('\n💰 Kiểm tra balance của users...');
    const userIds = [...new Set(trades.map(t => t.userId.toString()))];
    
    for (const userId of userIds.slice(0, 5)) {
      const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(userId) });
      if (user) {
        console.log(`   User ${userId}: available=${user.balance?.available}, frozen=${user.balance?.frozen}`);
      }
    }

    // 5. Kiểm tra projection query
    console.log('\n🔍 Test projection query...');
    const projectionTest = await db.collection('trading_sessions').findOne(
      { sessionId },
      { projection: { sessionId: 1, status: 1, result: 1, processingComplete: 1, endTime: 1 } }
    );
    
    console.log('📋 Projection result:', projectionTest);

    // 6. Kiểm tra pending trades với appliedToBalance = false
    console.log('\n⏳ Kiểm tra pending trades chưa được xử lý...');
    const pendingTrades = await db.collection('trades').find({
      sessionId,
      status: 'pending',
      appliedToBalance: false
    }).toArray();

    console.log(`📊 Pending trades chưa xử lý: ${pendingTrades.length}`);
    for (const trade of pendingTrades.slice(0, 3)) {
      console.log(`   - ${trade._id}: ${trade.direction} ${trade.amount} VND`);
    }

    // 7. Kiểm tra processing trades
    console.log('\n⚙️ Kiểm tra trades đang processing...');
    const processingTrades = await db.collection('trades').find({
      sessionId,
      processing: true
    }).toArray();

    console.log(`⚙️ Processing trades: ${processingTrades.length}`);
    for (const trade of processingTrades) {
      console.log(`   - ${trade._id}: ${trade.processingId} - ${trade.processingStartedAt}`);
    }

    // 8. Recommendations
    console.log('\n💡 === RECOMMENDATIONS ===');
    
    if (pendingTrades.length > 0) {
      console.log('⚠️ Có pending trades chưa được xử lý');
    }
    
    if (processingTrades.length > 0) {
      console.log('⚠️ Có trades đang processing, có thể bị stuck');
    }
    
    if (locks.length > 0) {
      console.log('⚠️ Có active locks, cần kiểm tra timeout');
    }
    
    if (!session.processingComplete && trades.length > 0) {
      console.log('⚠️ Session chưa hoàn thành nhưng có trades');
    }

    console.log('\n✅ Debug hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi debug session:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  const sessionId = process.argv[2];
  
  if (!sessionId) {
    console.log('❌ Vui lòng cung cấp sessionId: node scripts/debug-session.cjs <sessionId>');
    process.exit(1);
  }

  debugSession(sessionId)
    .then(() => {
      console.log('✅ Script debug session hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script debug session thất bại:', error);
      process.exit(1);
    });
}

module.exports = { debugSession };
