// Client để gửi event đến Socket.IO server
const sendToSocketServer = async (userId, event, data) => {
  try {
    const response = await fetch('http://localhost:3001/emit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        event,
        data
      }),
      // Thêm timeout để tránh hang
      signal: AbortSignal.timeout(5000) // 5 seconds timeout
    });

    if (!response.ok) {
      console.error(`❌ Socket.IO server responded with status: ${response.status}`);
      return false;
    }

    const result = await response.json();
    console.log(`📡 Event sent to Socket.IO server:`, result);
    return result.success;
  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.error('❌ Socket.IO server timeout after 5 seconds');
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('❌ Socket.IO server không thể kết nối (có thể chưa chạy)');
    } else {
      console.error('❌ Error sending event to Socket.IO server:', error.message);
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
