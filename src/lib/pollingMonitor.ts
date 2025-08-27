import { PollingStats } from '@/types';

/**
 * Monitor để theo dõi performance của polling
 */
class PollingMonitor {
  private stats: PollingStats;
  private startTime: number;

  constructor() {
    this.reset();
  }

  /**
   * Log một request
   */
  logRequest(success: boolean, responseTime: number) {
    this.stats.totalRequests++;
    this.stats.lastRequestTime = Date.now();

    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    // Cập nhật average response time
    const totalTime = this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime;
    this.stats.averageResponseTime = totalTime / this.stats.totalRequests;

    // Kiểm tra performance mỗi 10 requests
    if (this.stats.totalRequests % 10 === 0) {
      this.checkPerformance();
    }
  }

  /**
   * Kiểm tra performance và cảnh báo nếu cần
   */
  private checkPerformance() {
    const successRate = this.stats.successfulRequests / this.stats.totalRequests;
    const requestsPerMinute = this.stats.totalRequests / ((Date.now() - this.startTime) / 60000);

    // Xóa tất cả console.warn và console.log
    // Chỉ giữ lại logic kiểm tra
  }

  /**
   * Lấy thống kê polling
   */
  getStats(): PollingStats {
    return { ...this.stats };
  }

  /**
   * Reset thống kê
   */
  reset() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: 0
    };
    this.startTime = Date.now();
  }

  /**
   * Log summary
   */
  logSummary() {
    const uptime = (Date.now() - this.startTime) / 1000;
    const successRate = this.stats.successfulRequests / this.stats.totalRequests;
    const requestsPerMinute = this.stats.totalRequests / (uptime / 60);

    // Xóa console.log
  }
}

// Singleton instance
export const pollingMonitor = new PollingMonitor();

/**
 * Hook để wrap API calls với monitoring
 */
export const withPollingMonitor = async <T>(
  apiCall: () => Promise<T>,
  endpoint: string
): Promise<T> => {
  const startTime = Date.now();
  
  try {
    const result = await apiCall();
    const responseTime = Date.now() - startTime;
    
    pollingMonitor.logRequest(true, responseTime);
    // Xóa console.log
    
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    pollingMonitor.logRequest(false, responseTime);
    // Xóa console.error
    
    throw error;
  }
};

/**
 * Utility để tính toán polling interval tối ưu
 */
export const calculateOptimalInterval = (
  timeLeft: number,
  hasPendingTrades: boolean,
  isSessionEnding: boolean
): number => {
  // Khi timer = 0 và có lệnh pending
  if (timeLeft === 0 && hasPendingTrades) {
    return 1000; // Poll mỗi giây
  }
  
  // Khi gần kết thúc phiên
  if (timeLeft <= 5) {
    return 1000; // Poll mỗi giây
  }
  
  // Khi có lệnh pending
  if (hasPendingTrades) {
    return 2000; // Poll mỗi 2 giây
  }
  
  // Khi phiên sắp kết thúc
  if (isSessionEnding) {
    return 3000; // Poll mỗi 3 giây
  }
  
  // Mặc định
  return 5000; // Poll mỗi 5 giây
};

/**
 * Hook để tạo polling interval thông minh
 */
export const useSmartPolling = (
  timeLeft: number,
  hasPendingTrades: boolean = false,
  isSessionEnding: boolean = false
): number => {
  return calculateOptimalInterval(timeLeft, hasPendingTrades, isSessionEnding);
};
