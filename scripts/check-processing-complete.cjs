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

async function checkProcessingComplete() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log('\n🔍 === KIỂM TRA FIELD PROCESSINGCOMPLETE ===\n');
    
    // Kiểm tra tất cả sessions có processingComplete
    const sessionsWithProcessingComplete = await db.collection('trading_sessions').find({
      processingComplete: { $exists: true }
    }).toArray();
    
    console.log(`📊 Sessions có field processingComplete: ${sessionsWithProcessingComplete.length}`);
    
    for (const session of sessionsWithProcessingComplete.slice(0, 5)) {
      console.log('Session:', {
        sessionId: session.sessionId,
        status: session.status,
        processingComplete: session.processingComplete,
        createdAt: session.createdAt
      });
    }
    
    // Kiểm tra sessions không có processingComplete
    const sessionsWithoutProcessingComplete = await db.collection('trading_sessions').find({
      processingComplete: { $exists: false }
    }).toArray();
    
    console.log(`\n📊 Sessions KHÔNG có field processingComplete: ${sessionsWithoutProcessingComplete.length}`);
    
    for (const session of sessionsWithoutProcessingComplete.slice(0, 5)) {
      console.log('Session:', {
        sessionId: session.sessionId,
        status: session.status,
        createdAt: session.createdAt
      });
    }
    
    // Kiểm tra sessions completed nhưng không có processingComplete
    const completedSessionsWithoutProcessingComplete = await db.collection('trading_sessions').find({
      status: 'COMPLETED',
      processingComplete: { $exists: false }
    }).toArray();
    
    console.log(`\n⚠️ Sessions COMPLETED nhưng KHÔNG có processingComplete: ${completedSessionsWithoutProcessingComplete.length}`);
    
    for (const session of completedSessionsWithoutProcessingComplete.slice(0, 5)) {
      console.log('Session:', {
        sessionId: session.sessionId,
        status: session.status,
        result: session.result,
        createdAt: session.createdAt
      });
    }
    
    console.log('\n✅ Kiểm tra hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  checkProcessingComplete()
    .then(() => {
      console.log('✅ Script hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script thất bại:', error);
      process.exit(1);
    });
}

module.exports = { checkProcessingComplete };
