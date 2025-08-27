import { getMongoDb } from '@/lib/db';
import TradingSessionModel from '@/models/TradingSession';

/**
 * Background service để tự động duy trì 30 phiên tương lai
 */
class FutureSessionsManager {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Khởi động background service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ FutureSessionsManager đã đang chạy');
      return;
    }

    console.log('🚀 Khởi động FutureSessionsManager...');
    this.isRunning = true;

    // Chạy ngay lập tức
    this.checkAndGenerateFutureSessions();

    // Chạy mỗi 5 phút
    this.intervalId = setInterval(() => {
      this.checkAndGenerateFutureSessions();
    }, 5 * 60 * 1000); // 5 phút
  }

  /**
   * Dừng background service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Dừng FutureSessionsManager');
  }

  /**
   * Kiểm tra và tạo phiên tương lai nếu cần
   */
  private async checkAndGenerateFutureSessions() {
    try {
      const db = await getMongoDb();
      if (!db) {
        console.error('❌ Không thể kết nối database trong FutureSessionsManager');
        return;
      }

      const now = new Date();
      
      // Kiểm tra số phiên tương lai hiện có
      const existingFutureSessions = await TradingSessionModel.countDocuments({
        startTime: { $gt: now },
        status: 'ACTIVE'
      });

      console.log(`📊 Hiện có ${existingFutureSessions} phiên tương lai`);

      // Nếu chưa đủ 30 phiên, tạo thêm
      if (existingFutureSessions < 30) {
        const sessionsToCreate = 30 - existingFutureSessions;
        console.log(`🔄 Cần tạo thêm ${sessionsToCreate} phiên tương lai`);
        
        await this.generateFutureSessions(db, now, sessionsToCreate);
      } else {
        console.log('✅ Đã đủ 30 phiên tương lai');
      }

    } catch (error) {
      console.error('❌ Lỗi trong FutureSessionsManager:', error);
    }
  }

  /**
   * Tạo phiên tương lai
   */
  private async generateFutureSessions(db: any, startTime: Date, count: number) {
    try {
      // Tìm phiên cuối cùng để tính thời gian bắt đầu
      const lastSession = await TradingSessionModel.find({
        startTime: { $gt: startTime }
      })
        .sort({ startTime: -1 })
        .limit(1)
        .lean();

      let nextStartTime: Date;
      
      if (lastSession.length > 0) {
        // Bắt đầu từ phiên cuối cùng + 1 phút
        nextStartTime = new Date(lastSession[0].endTime);
      } else {
        // Bắt đầu từ phút tiếp theo
        const currentMinute = new Date(Date.UTC(
          startTime.getUTCFullYear(), 
          startTime.getUTCMonth(), 
          startTime.getUTCDate(), 
          startTime.getUTCHours(), 
          startTime.getUTCMinutes()
        ));
        nextStartTime = new Date(currentMinute.getTime() + 60000);
      }

      // Tạo các phiên mới
      const newSessions = [];
      
      for (let i = 0; i < count; i++) {
        const sessionStartTime = new Date(nextStartTime.getTime() + (i * 60000));
        const sessionEndTime = new Date(sessionStartTime.getTime() + 60000);
        
        // Tạo sessionId theo format: YYYYMMDDHHmm
        const sessionId = `${sessionStartTime.getUTCFullYear()}${String(sessionStartTime.getUTCMonth() + 1).padStart(2, '0')}${String(sessionStartTime.getUTCDate()).padStart(2, '0')}${String(sessionStartTime.getUTCHours()).padStart(2, '0')}${String(sessionStartTime.getUTCMinutes()).padStart(2, '0')}`;
        
        // Tạo kết quả ngẫu nhiên (50% UP, 50% DOWN)
        const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
        
        // ✅ SỬ DỤNG MODEL MONGOOSE: Tạo session với validation và default values
        const newSession = new TradingSessionModel({
          sessionId,
          startTime: sessionStartTime,
          endTime: sessionEndTime,
          status: 'ACTIVE',
          result, // Kết quả được tạo sẵn
          processingComplete : false, 
          totalTrades: 0,
          totalWins: 0,
          totalLosses: 0,
          totalWinAmount: 0,
          totalLossAmount: 0
          // createdAt và updatedAt sẽ tự động được set
        });
        
        newSessions.push(newSession);
      }

      // ✅ SỬ DỤNG MODEL MONGOOSE: Bulk insert với validation
      if (newSessions.length > 0) {
        // Sử dụng insertMany với upsert để tránh trùng lặp
        const bulkOps = newSessions.map(session => ({
          updateOne: {
            filter: { sessionId: session.sessionId },
            update: { $setOnInsert: session.toObject() },
            upsert: true
          }
        }));

        await TradingSessionModel.bulkWrite(bulkOps);
        
        console.log(`✅ Đã tạo ${newSessions.length} phiên tương lai với Mongoose model`);
      }
    } catch (error) {
      console.error('❌ Lỗi tạo phiên tương lai:', error);
    }
  }

  /**
   * Tạo lại tất cả 30 phiên tương lai
   */
  async regenerateAllFutureSessions() {
    try {
      const db = await getMongoDb();
      if (!db) {
        throw new Error('Không thể kết nối database');
      }

      const now = new Date();
      
      // Xóa tất cả phiên tương lai cũ
      await TradingSessionModel.deleteMany({
        startTime: { $gt: now },
        status: 'ACTIVE'
      });

      // Tạo lại 30 phiên tương lai
      await this.generateFutureSessions(db, now, 30);

      console.log('✅ Đã tạo lại tất cả 30 phiên tương lai');
    } catch (error) {
      console.error('❌ Lỗi tạo lại phiên tương lai:', error);
      throw error;
    }
  }

  /**
   * Lấy trạng thái service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasInterval: !!this.intervalId
    };
  }
}

// Singleton instance
export const futureSessionsManager = new FutureSessionsManager();

/**
 * Khởi động FutureSessionsManager khi app start
 */
export function initializeFutureSessionsManager() {
  // Khởi động sau 10 giây để đảm bảo app đã sẵn sàng
  setTimeout(() => {
    futureSessionsManager.start();
  }, 10000);
}
