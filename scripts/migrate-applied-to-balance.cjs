const mongoose = require('mongoose');

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial_platform';

async function migrateAppliedToBalance() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    // Tìm tất cả trades chưa có field appliedToBalance
    const tradesWithoutField = await db.collection('trades').find({
      appliedToBalance: { $exists: false }
    }).toArray();

    console.log(`📊 Tìm thấy ${tradesWithoutField.length} trades chưa có field appliedToBalance`);

    if (tradesWithoutField.length === 0) {
      console.log('✅ Tất cả trades đã có field appliedToBalance');
      return;
    }

    // Cập nhật tất cả trades cũ
    const updateResult = await db.collection('trades').updateMany(
      { appliedToBalance: { $exists: false } },
      { 
        $set: { 
          appliedToBalance: false,
          updatedAt: new Date()
        } 
      }
    );

    console.log(`✅ Đã cập nhật ${updateResult.modifiedCount} trades với field appliedToBalance`);

    // Tạo index cho field mới
    console.log('🔄 Đang tạo index cho field appliedToBalance...');
    await db.collection('trades').createIndex({ 
      sessionId: 1, 
      appliedToBalance: 1, 
      status: 1 
    });
    console.log('✅ Đã tạo index thành công');

    // Kiểm tra lại
    const remainingTrades = await db.collection('trades').find({
      appliedToBalance: { $exists: false }
    }).count();

    console.log(`📊 Còn lại ${remainingTrades} trades chưa có field appliedToBalance`);

    if (remainingTrades === 0) {
      console.log('🎉 Migration hoàn thành thành công!');
    } else {
      console.log('⚠️ Có một số trades chưa được cập nhật');
    }

  } catch (error) {
    console.error('❌ Lỗi migration:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy migration
if (require.main === module) {
  migrateAppliedToBalance()
    .then(() => {
      console.log('✅ Migration script hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script thất bại:', error);
      process.exit(1);
    });
}

module.exports = { migrateAppliedToBalance };
