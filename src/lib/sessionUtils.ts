import { ObjectId } from 'mongodb';

/**
 * Tạo sessionId dựa trên thời gian hiện tại
 * Định dạng: YYMMDDHHmm (Ví dụ: 2507111927 cho 19:27 ngày 11/07/2025)
 */
export function generateSessionId(date: Date = new Date()): string {
  const year = date.getUTCFullYear().toString();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}`;
}

/**
 * Lấy thông tin từ sessionId
 */
export const parseSessionId = (sessionId: string) => {
  if (!sessionId || sessionId.length !== 10) return null;
  
  const year = parseInt(sessionId.slice(0, 2), 10) + 2000; // Giả sử thế kỷ 21
  const month = parseInt(sessionId.slice(2, 4), 10) - 1; // Tháng bắt đầu từ 0
  const day = parseInt(sessionId.slice(4, 6), 10);
  const hour = parseInt(sessionId.slice(6, 8), 10);
  const minute = parseInt(sessionId.slice(8, 10), 10);
  
  // Tạo đối tượng Date với múi giờ Việt Nam
  const date = new Date(Date.UTC(year, month, day, hour - 7, minute)); // UTC+7
  
  return {
    date,
    year,
    month: month + 1,
    day,
    hour,
    minute,
    // Thêm các thông tin hữu ích khác nếu cần
    formattedTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    formattedDate: `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`
  };
};

// Hàm xử lý phiên hết hạn và công bố kết quả
export async function processExpiredSessions(db: any, apiName: string = 'Unknown') {
  const now = new Date();
  
  // Tìm các phiên đã hết hạn nhưng chưa được xử lý
  const expiredSessions = await db.collection('trading_sessions').find({
    status: { $in: ['ACTIVE', 'PREDICTED'] },
    endTime: { $lte: now }
  }).toArray();

  console.log(`🔍 [${apiName}] Tìm thấy ${expiredSessions.length} phiên đã hết hạn cần xử lý (chỉ xử lý phiên có kết quả sẵn)`);

  for (const session of expiredSessions) {
    try {
      console.log(`🔄 [${apiName}] Đang xử lý phiên: ${session.sessionId}`);
      
      // 1. Kiểm tra xem admin đã đặt kết quả chưa
      let result = session.result;
      let createdBy = session.createdBy || 'system';
      
      if (!result) {
        // Nếu chưa có kết quả, bỏ qua phiên này (để cron job xử lý)
        console.log(`⚠️ [${apiName}] Phiên ${session.sessionId} không có kết quả, bỏ qua (để cron job xử lý)`);
        continue;
      } else {
        console.log(`👑 [${apiName}] Sử dụng kết quả có sẵn cho phiên ${session.sessionId}: ${result}`);
      }

      // 2. Cập nhật trạng thái phiên thành COMPLETED
      await db.collection('trading_sessions').updateOne(
        { _id: session._id },
        { 
          $set: { 
            status: 'COMPLETED',
            result: result,
            actualResult: result, // Lưu kết quả thực tế
            createdBy: createdBy,
            completedAt: now,
            updatedAt: now
          }
        }
      );

      console.log(`📊 [${apiName}] Phiên ${session.sessionId} kết quả: ${result}`);

      // 3. Lấy tất cả lệnh của phiên này
      const trades = await db.collection('trades').find({ 
        sessionId: session.sessionId, 
        status: 'pending' 
      }).toArray();

      console.log(`📋 [${apiName}] Tìm thấy ${trades.length} lệnh cần xử lý`);

      for (const trade of trades) {
        // 4. Xác định win/lose
        const isWin = trade.direction === result;
        const profit = isWin ? Math.floor(trade.amount * 0.9) : 0; // Thắng được 90%
        const newStatus = 'completed';

        // 5. Cập nhật lệnh
        await db.collection('trades').updateOne(
          { _id: trade._id },
          { 
            $set: { 
              status: newStatus, 
              result: isWin ? 'win' : 'lose', 
              profit: profit,
              updatedAt: now
            }
          }
        );

        // 6. Cập nhật số dư user
        if (isWin) {
          // ✅ SỬA LỖI: Khi thắng, chỉ cộng profit vào available, KHÔNG trừ frozen
          // Tiền gốc đã được trả từ frozen về available rồi
          
          // Lấy balance hiện tại của user
          const currentUser = await db.collection('users').findOne({ _id: new ObjectId(trade.userId) });
          if (currentUser) {
            // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
            let currentBalance = currentUser.balance || { available: 0, frozen: 0 };
            
            // Nếu balance là number (kiểu cũ), chuyển đổi thành object
            if (typeof currentBalance === 'number') {
              currentBalance = {
                available: currentBalance,
                frozen: 0
              };
              
              console.log(`🔄 [${apiName} MIGRATION] User ${currentUser.username}: Chuyển đổi balance từ number sang object`);
            }

            // ✅ SỬA LỖI: Khi thắng, chỉ cộng profit vào available
            const newAvailableBalance = currentBalance.available + trade.amount + profit;
            // const newFrozenBalance = currentBalance.frozen - trade.amount; // ❌ XOÁ: Không trừ frozen khi thắng!

            await db.collection('users').updateOne(
              { _id: new ObjectId(trade.userId) },
              { 
                $set: { 
                  balance: {
                    available: newAvailableBalance,
                    frozen: currentBalance.frozen // Giữ nguyên frozen
                  },
                  updatedAt: now
                }
              }
            );
            
            console.log(`💰 [${apiName}] User ${currentUser.username} thắng: available ${currentBalance.available} → ${newAvailableBalance} (+${trade.amount + profit}), frozen giữ nguyên ${currentBalance.frozen}`);
          }
        } else {
          // Thua: chỉ trừ tiền cược (đã bị đóng băng)
          const currentUser = await db.collection('users').findOne({ _id: new ObjectId(trade.userId) });
          if (currentUser) {
            // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
            let currentBalance = currentUser.balance || { available: 0, frozen: 0 };
            
            // Nếu balance là number (kiểu cũ), chuyển đổi thành object
            if (typeof currentBalance === 'number') {
              currentBalance = {
                available: currentBalance,
                frozen: 0
              };
              
              console.log(`🔄 [${apiName} MIGRATION] User ${currentUser.username}: Chuyển đổi balance từ number sang object`);
            }

            // Tính toán balance mới
            const newFrozenBalance = currentBalance.frozen - trade.amount;

            await db.collection('users').updateOne(
              { _id: new ObjectId(trade.userId) },
              { 
                $set: { 
                  balance: {
                    ...currentBalance,
                    frozen: newFrozenBalance
                  },
                  updatedAt: now
                }
              }
            );
            
            console.log(`💸 [${apiName}] User ${currentUser.username} thua: frozen ${currentBalance.frozen} → ${newFrozenBalance} (-${trade.amount})`);
          }
        }
      }

      console.log(`✅ [${apiName}] Hoàn thành xử lý phiên ${session.sessionId}`);
    } catch (error) {
      console.error(`❌ [${apiName}] Lỗi khi xử lý phiên ${session.sessionId}:`, error);
    }
  }
}
