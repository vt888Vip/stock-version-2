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

async function listSessions() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log('\n📅 === LIST ALL SESSIONS ===\n');

    // Lấy tất cả sessions
    const sessions = await db.collection('trading_sessions').find({}).sort({ createdAt: -1 }).limit(20).toArray();
    
    console.log(`📊 Tổng sessions: ${sessions.length}`);
    
    for (const session of sessions) {
      console.log(`\n📋 Session: ${session.sessionId}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Result: ${session.result || 'N/A'}`);
      console.log(`   ProcessingComplete: ${session.processingComplete || false}`);
      console.log(`   EndTime: ${session.endTime}`);
      console.log(`   CreatedAt: ${session.createdAt}`);
      
      // Đếm trades trong session
      const tradesCount = await db.collection('trades').countDocuments({ sessionId: session.sessionId });
      console.log(`   Trades: ${tradesCount}`);
      
      if (tradesCount > 0) {
        const tradesByStatus = await db.collection('trades').aggregate([
          { $match: { sessionId: session.sessionId } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]).toArray();
        
        for (const status of tradesByStatus) {
          console.log(`     - ${status._id}: ${status.count}`);
        }
      }
    }

    // Kiểm tra sessions gần đây
    console.log('\n🔍 === RECENT SESSIONS (last 10) ===');
    const recentSessions = await db.collection('trading_sessions').find({}).sort({ createdAt: -1 }).limit(10).toArray();
    
    for (const session of recentSessions) {
      console.log(`   ${session.sessionId} - ${session.status} - ${session.result || 'N/A'} - ${session.createdAt}`);
    }

    console.log('\n✅ List sessions hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi list sessions:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  listSessions()
    .then(() => {
      console.log('✅ Script list sessions hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script list sessions thất bại:', error);
      process.exit(1);
    });
}

module.exports = { listSessions };
