const mongoose = require('mongoose');

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial_platform';

async function testFullFlow() {
  try {
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB thành công');

    const db = mongoose.connection.db;
    
    console.log('\n🚀 === TEST FULL TRADING FLOW ===\n');

    // 1. Tìm user có balance để test
    const testUser = await db.collection('users').findOne({
      'balance.available': { $gt: 1000000 } // Có ít nhất 1M VND
    });

    if (!testUser) {
      console.log('❌ Không tìm thấy user có đủ balance để test');
      return;
    }

    console.log(`👤 Test user: ${testUser._id}`);
    console.log(`💰 Balance: ${testUser.balance?.available?.toLocaleString()} VND available, ${testUser.balance?.frozen?.toLocaleString()} VND frozen`);

    // 2. Tìm session đang active
    const activeSession = await db.collection('trading_sessions').findOne({
      status: 'ACTIVE',
      endTime: { $gt: new Date() }
    });

    if (!activeSession) {
      console.log('❌ Không tìm thấy session đang active');
      return;
    }

    console.log(`📅 Test session: ${activeSession.sessionId}`);
    console.log(`⏰ End time: ${activeSession.endTime}`);

    // 3. Test đặt lệnh
    console.log('\n📝 === TEST PLACE TRADE ===');
    
    const testAmount = 100000; // 100K VND
    const testDirection = 'UP';
    
    console.log(`🎯 Đặt lệnh: ${testDirection} ${testAmount.toLocaleString()} VND`);
    
    // Lấy balance trước khi đặt lệnh
    const balanceBefore = await db.collection('users').findOne(
      { _id: testUser._id },
      { projection: { balance: 1 } }
    );

    console.log(`💰 Balance trước: available=${balanceBefore.balance?.available}, frozen=${balanceBefore.balance?.frozen}`);

    // Đặt lệnh
    const tradeData = {
      sessionId: activeSession.sessionId,
      userId: testUser._id.toString(),
      direction: testDirection,
      amount: testAmount
    };

    console.log('📤 Gửi request đặt lệnh...');
    
    // Simulate API call
    const tradeResult = await db.collection('trades').insertOne({
      sessionId: activeSession.sessionId,
      userId: testUser._id,
      direction: testDirection,
      amount: testAmount,
      status: 'pending',
      appliedToBalance: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`✅ Tạo trade thành công: ${tradeResult.insertedId}`);

    // Cập nhật balance
    const balanceUpdateResult = await db.collection('users').updateOne(
      { _id: testUser._id },
      {
        $inc: {
          'balance.available': -testAmount,
          'balance.frozen': testAmount
        },
        $set: { updatedAt: new Date() }
      }
    );

    console.log(`💳 Cập nhật balance: ${balanceUpdateResult.modifiedCount} records`);

    // Lấy balance sau khi đặt lệnh
    const balanceAfter = await db.collection('users').findOne(
      { _id: testUser._id },
      { projection: { balance: 1 } }
    );

    console.log(`💰 Balance sau: available=${balanceAfter.balance?.available}, frozen=${balanceAfter.balance?.frozen}`);

    // 4. Test check results
    console.log('\n🔍 === TEST CHECK RESULTS ===');
    
    // Đợi 1 giây để simulate thời gian
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('📤 Gửi request check results...');
    
    // Simulate session end và tạo kết quả
    const sessionResult = Math.random() < 0.5 ? 'UP' : 'DOWN';
    
    await db.collection('trading_sessions').updateOne(
      { sessionId: activeSession.sessionId },
      {
        $set: {
          result: sessionResult,
          actualResult: sessionResult,
          status: 'COMPLETED',
          completedAt: new Date(),
          endTime: new Date()
        }
      }
    );

    console.log(`🎲 Kết quả session: ${sessionResult}`);
    console.log(`🎯 Trade direction: ${testDirection}`);
    console.log(`🏆 Trade result: ${testDirection === sessionResult ? 'WIN' : 'LOSE'}`);

    // Simulate check results processing
    const trade = await db.collection('trades').findOne({ _id: tradeResult.insertedId });
    const isWin = trade.direction === sessionResult;
    const profit = isWin ? Math.floor(trade.amount * 0.9) : 0;

    console.log(`💰 Profit: ${profit.toLocaleString()} VND`);

    // Cập nhật trade
    await db.collection('trades').updateOne(
      { _id: tradeResult.insertedId },
      {
        $set: {
          status: 'completed',
          result: isWin ? 'win' : 'lose',
          profit: profit,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // Cập nhật balance
    if (isWin) {
      await db.collection('users').updateOne(
        { _id: testUser._id },
        {
          $inc: {
            'balance.available': trade.amount + profit,
            'balance.frozen': -trade.amount
          },
          $set: { updatedAt: new Date() }
        }
      );
    } else {
      await db.collection('users').updateOne(
        { _id: testUser._id },
        {
          $inc: {
            'balance.frozen': -trade.amount
          },
          $set: { updatedAt: new Date() }
        }
      );
    }

    // Lấy balance cuối cùng
    const finalBalance = await db.collection('users').findOne(
      { _id: testUser._id },
      { projection: { balance: 1 } }
    );

    console.log(`💰 Balance cuối: available=${finalBalance.balance?.available}, frozen=${finalBalance.balance?.frozen}`);

    // 5. Kiểm tra kết quả
    console.log('\n📊 === KẾT QUẢ TEST ===');
    
    const completedTrade = await db.collection('trades').findOne({ _id: tradeResult.insertedId });
    
    console.log(`✅ Trade status: ${completedTrade.status}`);
    console.log(`🏆 Trade result: ${completedTrade.result}`);
    console.log(`💰 Trade profit: ${completedTrade.profit?.toLocaleString()} VND`);
    
    const balanceChange = {
      available: finalBalance.balance.available - balanceBefore.balance.available,
      frozen: finalBalance.balance.frozen - balanceBefore.balance.frozen
    };
    
    console.log(`📈 Balance change: available=${balanceChange.available}, frozen=${balanceChange.frozen}`);
    
    // 6. Validation
    console.log('\n🔍 === VALIDATION ===');
    
    let isValid = true;
    
    // Kiểm tra balance không âm
    if (finalBalance.balance.frozen < 0) {
      console.log('❌ Frozen balance bị âm!');
      isValid = false;
    }
    
    if (finalBalance.balance.available < 0) {
      console.log('❌ Available balance bị âm!');
      isValid = false;
    }
    
    // Kiểm tra logic
    const expectedAvailableChange = isWin ? profit : 0;
    const expectedFrozenChange = -testAmount;
    
    if (balanceChange.available !== expectedAvailableChange) {
      console.log(`❌ Available balance change sai: expected=${expectedAvailableChange}, actual=${balanceChange.available}`);
      isValid = false;
    }
    
    if (balanceChange.frozen !== expectedFrozenChange) {
      console.log(`❌ Frozen balance change sai: expected=${expectedFrozenChange}, actual=${balanceChange.frozen}`);
      isValid = false;
    }
    
    if (isValid) {
      console.log('✅ Tất cả validation đều pass!');
    }

    console.log('\n🎉 Test hoàn thành!');

  } catch (error) {
    console.error('❌ Lỗi test full flow:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
if (require.main === module) {
  testFullFlow()
    .then(() => {
      console.log('✅ Script test full flow hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script test full flow thất bại:', error);
      process.exit(1);
    });
}

module.exports = { testFullFlow };
