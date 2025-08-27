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

async function fixAppliedToBalance() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log('\n🔧 === FIX APPLIED TO BALANCE ===\n');

    // Tìm trades đã completed nhưng chưa có appliedToBalance: true
    const tradesToFix = await db.collection('trades').find({
      status: { $in: ['completed', 'error'] },
      appliedToBalance: { $ne: true }
    }).toArray();

    console.log(`📊 Tìm thấy ${tradesToFix.length} trades cần fix`);

    if (tradesToFix.length === 0) {
      console.log('✅ Không có trades nào cần fix');
      return;
    }

    let fixedCount = 0;
    let errorCount = 0;

    for (const trade of tradesToFix) {
      try {
        console.log(`🔧 Fixing trade ${trade._id}: ${trade.sessionId} - ${trade.status} - ${trade.result}`);
        
        // Update appliedToBalance: true
        const result = await db.collection('trades').updateOne(
          { _id: trade._id },
          {
            $set: {
              appliedToBalance: true,
              updatedAt: new Date()
            }
          }
        );

        if (result.modifiedCount > 0) {
          fixedCount++;
          console.log(`✅ Fixed trade ${trade._id}`);
        } else {
          console.log(`⚠️ Trade ${trade._id} không được update`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error fixing trade ${trade._id}:`, error.message);
      }
    }

    console.log(`\n📊 === KẾT QUẢ ===`);
    console.log(`✅ Fixed: ${fixedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📈 Total: ${tradesToFix.length}`);

    // Kiểm tra sessions cần update processingComplete
    console.log('\n🔍 === CHECK SESSIONS ===');
    
    const sessionsWithCompletedTrades = await db.collection('trades').aggregate([
      {
        $match: {
          status: { $in: ['completed', 'error'] },
          appliedToBalance: true
        }
      },
      {
        $group: {
          _id: '$sessionId',
          totalTrades: { $sum: 1 },
          completedTrades: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          errorTrades: {
            $sum: {
              $cond: [{ $eq: ['$status', 'error'] }, 1, 0]
            }
          }
        }
      }
    ]).toArray();

    console.log(`📊 Sessions có trades completed: ${sessionsWithCompletedTrades.length}`);

    for (const session of sessionsWithCompletedTrades) {
      const sessionInfo = await db.collection('trading_sessions').findOne({ sessionId: session._id });
      
      if (sessionInfo && !sessionInfo.processingComplete) {
        console.log(`🔧 Session ${session._id} chưa có processingComplete, đang update...`);
        
        await db.collection('trading_sessions').updateOne(
          { sessionId: session._id },
          {
            $set: {
              processingComplete: true,
              processingCompletedAt: new Date(),
              updatedAt: new Date()
            }
          }
        );
        
        console.log(`✅ Updated session ${session._id}`);
      }
    }

    console.log('\n✅ Fix applied to balance hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi fix applied to balance:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  fixAppliedToBalance()
    .then(() => {
      console.log('✅ Script fix applied to balance hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script fix applied to balance thất bại:', error);
      process.exit(1);
    });
}

module.exports = { fixAppliedToBalance };
