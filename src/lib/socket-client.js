// Client để gửi event đến Socket.IO server
const sendToSocketServer = async (userId, event, data) => {
  try {
    // Ưu tiên biến môi trường, fallback theo môi trường chạy
    const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.SOCKET_SERVER_URL;
    const socketUrl = envUrl
      ? envUrl
      : (typeof window !== 'undefined'
          ? (window.location.hostname === 'localhost'
              ? 'http://localhost:3001'
              : window.location.origin)
          : 'http://127.0.0.1:3001');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${socketUrl}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        event,
        data
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`❌ Socket.IO server responded with status: ${response.status}`);
      return false;
    }

    const result = await response.json();
    return !!result.success;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Socket.IO server timeout after 5 seconds');
    } else if (error.name === 'TypeError' && (error.message || '').includes('fetch')) {
      console.error('❌ Socket.IO server không thể kết nối (có thể chưa chạy)');
    } else {
      console.error('❌ Error sending event to Socket.IO server:', error.message || error);
    }
    return false;
  }
};

// Function để gửi trade:placed event
export const sendTradePlacedEvent = async (userId, tradeData) => {
  return sendToSocketServer(userId, 'trade:placed', {
    ...tradeData,
    timestamp: new Date().toISOString()
  });
};

// Function để gửi trade:completed event
export const sendTradeCompletedEvent = async (userId, tradeData) => {
  return sendToSocketServer(userId, 'trade:completed', {
    ...tradeData,
    timestamp: new Date().toISOString()
  });
};

// Function để gửi balance:updated event
export const sendBalanceUpdatedEvent = async (userId, balanceData) => {
  return sendToSocketServer(userId, 'balance:updated', {
    ...balanceData,
    timestamp: new Date().toISOString()
  });
};

// Function để gửi trade:history:updated event
export const sendTradeHistoryUpdatedEvent = async (userId, tradeData) => {
  return sendToSocketServer(userId, 'trade:history:updated', {
    ...tradeData,
    timestamp: new Date().toISOString()
  });
};
