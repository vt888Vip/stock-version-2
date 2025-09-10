import { getMongoDb } from './db';

interface FutureSessionsManagerStatus {
  isRunning: boolean;
  lastGenerated: Date | null;
  totalSessions: number;
  nextSessionTime: Date | null;
}

class FutureSessionsManager {
  private isRunning: boolean = false;
  private lastGenerated: Date | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.isRunning = false;
    this.lastGenerated = null;
  }

  /**
   * Khởi động background service để tự động tạo phiên tương lai
   */
  async start(): Promise<{ success: boolean; message: string }> {
    try {
      if (this.isRunning) {
        return { success: false, message: 'Service đã đang chạy' };
      }

      this.isRunning = true;
      
      // Tạo phiên ngay lập tức
      await this.generateFutureSessions();
      
      // Thiết lập interval để tạo phiên mỗi 5 phút
      this.intervalId = setInterval(async () => {
        if (this.isRunning) {
          await this.generateFutureSessions();
        }
      }, 5 * 60 * 1000); // 5 phút

      console.log('✅ FutureSessionsManager đã được khởi động');
      return { success: true, message: 'FutureSessionsManager đã được khởi động' };
    } catch (error) {
      this.isRunning = false;
      console.error('❌ Lỗi khởi động FutureSessionsManager:', error);
      return { success: false, message: 'Lỗi khởi động service' };
    }
  }

  /**
   * Dừng background service
   */
  stop(): { success: boolean; message: string } {
    try {
      if (!this.isRunning) {
        return { success: false, message: 'Service chưa chạy' };
      }

      this.isRunning = false;
      
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      console.log('⏹️ FutureSessionsManager đã được dừng');
      return { success: true, message: 'FutureSessionsManager đã được dừng' };
    } catch (error) {
      console.error('❌ Lỗi dừng FutureSessionsManager:', error);
      return { success: false, message: 'Lỗi dừng service' };
    }
  }

  /**
   * Tạo lại tất cả 30 phiên tương lai
   */
  async regenerateAllFutureSessions(): Promise<{ success: boolean; message: string }> {
    try {
      const db = await getMongoDb();
      if (!db) {
        return { success: false, message: 'Không thể kết nối database' };
      }

      const now = new Date();

      // Xóa tất cả phiên tương lai hiện tại
      await db.collection('trading_sessions').deleteMany({
        startTime: { $gt: now }
      });

      // Tạo lại 30 phiên mới
      await this.generateFutureSessions();
      
      this.lastGenerated = new Date();
      
      console.log('🔄 Đã tạo lại tất cả 30 phiên tương lai');
      return { success: true, message: 'Đã tạo lại tất cả 30 phiên tương lai' };
    } catch (error) {
      console.error('❌ Lỗi tạo lại phiên tương lai:', error);
      return { success: false, message: 'Lỗi tạo lại phiên tương lai' };
    }
  }

  /**
   * Lấy trạng thái hiện tại của service
   */
  getStatus(): FutureSessionsManagerStatus {
    return {
      isRunning: this.isRunning,
      lastGenerated: this.lastGenerated,
      totalSessions: 0, // Sẽ được cập nhật khi cần
      nextSessionTime: this.getNextSessionTime()
    };
  }

  /**
   * Tạo 30 phiên tương lai
   */
  private async generateFutureSessions(): Promise<void> {
    try {
      const db = await getMongoDb();
      if (!db) {
        console.error('❌ Không thể kết nối database');
        return;
      }

      const now = new Date();
      
      // Kiểm tra xem đã có bao nhiêu phiên tương lai
      const existingFutureSessions = await db.collection('trading_sessions')
        .find({
          startTime: { $gt: now },
          status: 'ACTIVE'
        })
        .count();

      // Nếu chưa đủ 30 phiên, tạo thêm
      if (existingFutureSessions < 30) {
        const sessionsToCreate = 30 - existingFutureSessions;
        
        // Tìm phiên cuối cùng để tính thời gian bắt đầu
        const lastSession = await db.collection('trading_sessions')
          .find({
            startTime: { $gt: now }
          })
          .sort({ startTime: -1 })
          .limit(1)
          .toArray();

        let nextStartTime: Date;
        
        if (lastSession.length > 0) {
          // Bắt đầu từ phiên cuối cùng + 1 phút
          nextStartTime = new Date(lastSession[0].endTime);
        } else {
          // Bắt đầu từ phút tiếp theo
          const currentMinute = new Date(Date.UTC(
            now.getUTCFullYear(), 
            now.getUTCMonth(), 
            now.getUTCDate(), 
            now.getUTCHours(), 
            now.getUTCMinutes()
          ));
          nextStartTime = new Date(currentMinute.getTime() + 60000);
        }

        // Tạo các phiên mới
        const newSessions = [];
        
        for (let i = 0; i < sessionsToCreate; i++) {
          const sessionStartTime = new Date(nextStartTime.getTime() + (i * 60000));
          const sessionEndTime = new Date(sessionStartTime.getTime() + 60000);
          
          // Tạo sessionId theo format: YYYYMMDDHHmm
          const sessionId = `${sessionStartTime.getUTCFullYear()}${String(sessionStartTime.getUTCMonth() + 1).padStart(2, '0')}${String(sessionStartTime.getUTCDate()).padStart(2, '0')}${String(sessionStartTime.getUTCHours()).padStart(2, '0')}${String(sessionStartTime.getUTCMinutes()).padStart(2, '0')}`;
          
          // Tạo kết quả ngẫu nhiên (50% UP, 50% DOWN)
          const result = Math.random() < 0.5 ? 'UP' : 'DOWN';
          
          const newSession = {
            sessionId,
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            status: 'ACTIVE',
            result, // Kết quả được tạo sẵn
            processingComplete: false,
            totalTrades: 0,
            totalWins: 0,
            totalLosses: 0,
            totalWinAmount: 0,
            totalLossAmount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          newSessions.push(newSession);
        }

        // Sử dụng atomic operations để tránh race condition
        if (newSessions.length > 0) {
          const bulkOps = newSessions.map(session => ({
            updateOne: {
              filter: { sessionId: session.sessionId },
              update: { $setOnInsert: session },
              upsert: true
            }
          }));

          await db.collection('trading_sessions').bulkWrite(bulkOps);
          
          this.lastGenerated = new Date();
          console.log(`✅ Đã tạo ${newSessions.length} phiên tương lai`);
        }
      }
    } catch (error) {
      console.error('❌ Lỗi tạo phiên tương lai:', error);
    }
  }

  /**
   * Lấy thời gian phiên tiếp theo
   */
  private getNextSessionTime(): Date | null {
    try {
      const now = new Date();
      const currentMinute = new Date(Date.UTC(
        now.getUTCFullYear(), 
        now.getUTCMonth(), 
        now.getUTCDate(), 
        now.getUTCHours(), 
        now.getUTCMinutes()
      ));
      return new Date(currentMinute.getTime() + 60000);
    } catch (error) {
      return null;
    }
  }
}

// Export singleton instance
export const futureSessionsManager = new FutureSessionsManager();

// Export class nếu cần tạo instance mới
export default FutureSessionsManager;
