import { Db } from 'mongodb';

/**
 * Xử lý các phiên hết hạn
 * @param db MongoDB database instance
 * @param context Context string for logging
 */
export async function processExpiredSessions(db: Db, context: string = 'Default') {
  try {
    const now = new Date();
    
    // Tìm và cập nhật các phiên đã hết hạn
    const result = await db.collection('trading_sessions').updateMany(
      {
        status: 'ACTIVE',
        endTime: { $lt: now }
      },
      {
        $set: {
          status: 'EXPIRED',
          updatedAt: now
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`[${context}] Đã cập nhật ${result.modifiedCount} phiên hết hạn`);
    }

    return result.modifiedCount;
  } catch (error) {
    console.error(`[${context}] Lỗi khi xử lý phiên hết hạn:`, error);
    return 0;
  }
}

/**
 * Lấy phiên hiện tại theo format YYYYMMDDHHMM
 */
export function getCurrentSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}${minute}`;
}

/**
 * Lấy phiên tiếp theo (1 phút sau)
 */
export function getNextSession(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}${minute}`;
}

/**
 * Kiểm tra xem phiên có còn active không
 * @param sessionId Session ID theo format YYYYMMDDHHMM
 */
export function isSessionActive(sessionId: string): boolean {
  try {
    const now = new Date();
    const sessionDate = new Date(
      parseInt(sessionId.substring(0, 4)),
      parseInt(sessionId.substring(4, 6)) - 1,
      parseInt(sessionId.substring(6, 8)),
      parseInt(sessionId.substring(8, 10)),
      parseInt(sessionId.substring(10, 12))
    );
    
    // Phiên kéo dài 1 phút
    const sessionEnd = new Date(sessionDate.getTime() + 60000);
    
    return now < sessionEnd;
  } catch (error) {
    console.error('Lỗi khi kiểm tra session active:', error);
    return false;
  }
}

/**
 * Lấy thời gian bắt đầu và kết thúc của phiên
 * @param sessionId Session ID theo format YYYYMMDDHHMM
 */
export function getSessionTimeRange(sessionId: string): { start: Date; end: Date } | null {
  try {
    const sessionDate = new Date(
      parseInt(sessionId.substring(0, 4)),
      parseInt(sessionId.substring(4, 6)) - 1,
      parseInt(sessionId.substring(6, 8)),
      parseInt(sessionId.substring(8, 10)),
      parseInt(sessionId.substring(10, 12))
    );
    
    const sessionEnd = new Date(sessionDate.getTime() + 60000);
    
    return {
      start: sessionDate,
      end: sessionEnd
    };
  } catch (error) {
    console.error('Lỗi khi lấy thời gian phiên:', error);
    return null;
  }
}

/**
 * Tạo hoặc cập nhật phiên trong database
 * @param db MongoDB database instance
 * @param sessionId Session ID
 * @param result Kết quả phiên (UP/DOWN)
 */
export async function createOrUpdateSession(
  db: Db, 
  sessionId: string, 
  result: 'UP' | 'DOWN' | null = null
) {
  try {
    const timeRange = getSessionTimeRange(sessionId);
    if (!timeRange) {
      throw new Error('Invalid session ID format');
    }

    const sessionData = {
      sessionId,
      startTime: timeRange.start,
      endTime: timeRange.end,
      status: 'ACTIVE',
      result: result || 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('trading_sessions').updateOne(
      { sessionId },
      { 
        $set: sessionData,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    console.log(`✅ Đã tạo/cập nhật phiên ${sessionId} với kết quả: ${result || 'PENDING'}`);
    return true;
  } catch (error) {
    console.error('Lỗi khi tạo/cập nhật phiên:', error);
    return false;
  }
}

/**
 * Lấy thông tin phiên từ database
 * @param db MongoDB database instance
 * @param sessionId Session ID
 */
export async function getSessionInfo(db: Db, sessionId: string) {
  try {
    const session = await db.collection('trading_sessions').findOne({ sessionId });
    return session;
  } catch (error) {
    console.error('Lỗi khi lấy thông tin phiên:', error);
    return null;
  }
}

/**
 * Lấy danh sách phiên gần đây
 * @param db MongoDB database instance
 * @param limit Số lượng phiên cần lấy
 */
export async function getRecentSessions(db: Db, limit: number = 10) {
  try {
    const sessions = await db.collection('trading_sessions')
      .find({})
      .sort({ startTime: 1 })
      .limit(limit)
      .toArray();
    
    return sessions;
  } catch (error) {
    console.error('Lỗi khi lấy danh sách phiên gần đây:', error);
    return [];
  }
}

/**
 * Kiểm tra xem có thể đặt lệnh trong phiên này không
 * @param sessionId Session ID
 */
export function canPlaceTrade(sessionId: string): boolean {
  const timeRange = getSessionTimeRange(sessionId);
  if (!timeRange) return false;
  
  const now = new Date();
  const timeUntilEnd = timeRange.end.getTime() - now.getTime();
  
  // Cho phép đặt lệnh trong 45 giây đầu của phiên (trừ 15 giây cuối)
  return timeUntilEnd > 15000 && timeUntilEnd <= 60000;
}

/**
 * Lấy thời gian còn lại của phiên (tính bằng giây)
 * @param sessionId Session ID
 */
export function getSessionTimeRemaining(sessionId: string): number {
  const timeRange = getSessionTimeRange(sessionId);
  if (!timeRange) return 0;
  
  const now = new Date();
  const timeRemaining = timeRange.end.getTime() - now.getTime();
  
  return Math.max(0, Math.floor(timeRemaining / 1000));
}
