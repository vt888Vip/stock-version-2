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

async function checkDatabase() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    console.log('🔗 URI:', MONGODB_URI);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log('\n📊 === DATABASE INFO ===');
    console.log(`Database name: ${db.databaseName}`);
    console.log(`Collections: ${(await db.listCollections().toArray()).map(c => c.name).join(', ')}`);

    // Kiểm tra collections
    console.log('\n📋 === COLLECTIONS DETAIL ===');
    
    const collections = await db.listCollections().toArray();
    
    for (const collection of collections) {
      console.log(`\n📁 Collection: ${collection.name}`);
      
      const count = await db.collection(collection.name).countDocuments();
      console.log(`   Documents: ${count}`);
      
      if (count > 0) {
        // Lấy 1 document mẫu
        const sample = await db.collection(collection.name).findOne();
        console.log(`   Sample keys: ${Object.keys(sample || {}).join(', ')}`);
      }
    }

    // Kiểm tra trading_sessions collection
    console.log('\n🎯 === TRADING SESSIONS CHECK ===');
    
    const tradingSessionsCount = await db.collection('trading_sessions').countDocuments();
    console.log(`Trading sessions count: ${tradingSessionsCount}`);
    
    if (tradingSessionsCount > 0) {
      const recentSessions = await db.collection('trading_sessions').find({}).sort({ createdAt: -1 }).limit(5).toArray();
      console.log('Recent sessions:');
      for (const session of recentSessions) {
        console.log(`   ${session.sessionId} - ${session.status} - ${session.createdAt}`);
      }
    } else {
      console.log('❌ Không có trading sessions nào!');
    }

    // Kiểm tra trades collection
    console.log('\n📈 === TRADES CHECK ===');
    
    const tradesCount = await db.collection('trades').countDocuments();
    console.log(`Trades count: ${tradesCount}`);
    
    if (tradesCount > 0) {
      const recentTrades = await db.collection('trades').find({}).sort({ createdAt: -1 }).limit(5).toArray();
      console.log('Recent trades:');
      for (const trade of recentTrades) {
        console.log(`   ${trade._id} - ${trade.sessionId} - ${trade.status} - ${trade.createdAt}`);
      }
    } else {
      console.log('❌ Không có trades nào!');
    }

    // Kiểm tra users collection
    console.log('\n👥 === USERS CHECK ===');
    
    const usersCount = await db.collection('users').countDocuments();
    console.log(`Users count: ${usersCount}`);
    
    if (usersCount > 0) {
      const sampleUser = await db.collection('users').findOne();
      console.log('Sample user balance:', sampleUser?.balance);
    } else {
      console.log('❌ Không có users nào!');
    }

    // Kiểm tra environment
    console.log('\n🔧 === ENVIRONMENT CHECK ===');
    console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');

    console.log('\n✅ Database check hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi check database:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  checkDatabase()
    .then(() => {
      console.log('✅ Script check database hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script check database thất bại:', error);
      process.exit(1);
    });
}

module.exports = { checkDatabase };
