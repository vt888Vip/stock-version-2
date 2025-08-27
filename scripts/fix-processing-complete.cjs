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

async function fixProcessingComplete() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log('\n🔧 === FIX PROCESSINGCOMPLETE ===\n');
    
    // Tìm sessions COMPLETED nhưng không có processingComplete
    const sessionsToFix = await db.collection('trading_sessions').find({
      status: 'COMPLETED',
      processingComplete: { $exists: false }
    }).toArray();
    
    console.log(`📊 Tìm thấy ${sessionsToFix.length} sessions cần fix`);
    
    if (sessionsToFix.length === 0) {
      console.log('✅ Không có sessions nào cần fix');
      return;
    }
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const session of sessionsToFix) {
      try {
        console.log(`🔧 Fixing session ${session.sessionId}: ${session.status} - ${session.result}`);
        
        // Update processingComplete: true
        const result = await db.collection('trading_sessions').updateOne(
          { _id: session._id },
          {
            $set: {
              processingComplete: true,
              processingCompletedAt: session.updatedAt || session.createdAt,
              updatedAt: new Date()
            }
          }
        );
        
        if (result.modifiedCount > 0) {
          fixedCount++;
          console.log(`✅ Fixed session ${session.sessionId}`);
        } else {
          console.log(`⚠️ Session ${session.sessionId} không được update`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error fixing session ${session.sessionId}:`, error.message);
      }
    }
    
    console.log(`\n📊 === KẾT QUẢ ===`);
    console.log(`✅ Fixed: ${fixedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📈 Total: ${sessionsToFix.length}`);
    
    // Kiểm tra lại
    console.log('\n🔍 === KIỂM TRA SAU KHI FIX ===');
    
    const remainingSessionsToFix = await db.collection('trading_sessions').find({
      status: 'COMPLETED',
      processingComplete: { $exists: false }
    }).toArray();
    
    console.log(`📊 Sessions COMPLETED còn lại chưa có processingComplete: ${remainingSessionsToFix.length}`);
    
    const totalSessionsWithProcessingComplete = await db.collection('trading_sessions').find({
      processingComplete: { $exists: true }
    }).toArray();
    
    console.log(`📊 Tổng sessions có processingComplete: ${totalSessionsWithProcessingComplete.length}`);
    
    console.log('\n✅ Fix processing complete hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi fix processing complete:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  fixProcessingComplete()
    .then(() => {
      console.log('✅ Script hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script thất bại:', error);
      process.exit(1);
    });
}

module.exports = { fixProcessingComplete };
