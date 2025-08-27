const mongoose = require('mongoose');

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial_platform';

async function fixNegativeBalance() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    // Tìm tất cả users có balance.frozen âm
    const usersWithNegativeFrozen = await db.collection('users').find({
      'balance.frozen': { $lt: 0 }
    }).toArray();

    console.log(`📊 Tìm thấy ${usersWithNegativeFrozen.length} users có balance.frozen âm`);

    if (usersWithNegativeFrozen.length === 0) {
      console.log('✅ Không có user nào có balance.frozen âm');
      return;
    }

    // Sửa balance cho từng user
    for (const user of usersWithNegativeFrozen) {
      console.log(`🔄 Đang sửa balance cho user ${user._id}:`);
      console.log(`   - Balance trước: available=${user.balance?.available || 0}, frozen=${user.balance?.frozen || 0}`);
      
      // Tính toán balance mới
      const currentAvailable = user.balance?.available || 0;
      const currentFrozen = user.balance?.frozen || 0;
      
      // Nếu frozen âm, chuyển thành available
      const newAvailable = currentAvailable + Math.abs(currentFrozen);
      const newFrozen = 0;
      
      console.log(`   - Balance sau: available=${newAvailable}, frozen=${newFrozen}`);
      
      // Cập nhật balance
      const updateResult = await db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            'balance.available': newAvailable,
            'balance.frozen': newFrozen,
            updatedAt: new Date()
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log(`   ✅ Đã sửa balance thành công`);
      } else {
        console.log(`   ❌ Không thể sửa balance`);
      }
    }

    // Kiểm tra lại
    const remainingNegativeFrozen = await db.collection('users').find({
      'balance.frozen': { $lt: 0 }
    }).count();

    console.log(`📊 Còn lại ${remainingNegativeFrozen} users có balance.frozen âm`);

    if (remainingNegativeFrozen === 0) {
      console.log('🎉 Đã sửa tất cả balance âm thành công!');
    } else {
      console.log('⚠️ Vẫn còn một số users có balance.frozen âm');
    }

  } catch (error) {
    console.error('❌ Lỗi sửa balance:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  fixNegativeBalance()
    .then(() => {
      console.log('✅ Script sửa balance hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script sửa balance thất bại:', error);
      process.exit(1);
    });
}

module.exports = { fixNegativeBalance };
