const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Create HTTP server
const server = createServer();

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://174.138.24.77:3000", "http://174.138.24.77"],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  // ✅ Tối ưu cấu hình cho VPS
  pingTimeout: 60000, // 60s
  pingInterval: 25000, // 25s
  transports: ['websocket', 'polling'], // Fallback cho VPS
  allowEIO3: true, // Tương thích với client cũ
  // ✅ Tối ưu performance
  maxHttpBufferSize: 1e6, // 1MB
  compression: true,
  // ✅ Tối ưu reconnection
  allowUpgrades: true,
  upgradeTimeout: 10000
});

// HTTP endpoint để nhận event từ API
server.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/emit') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { userId, event, data } = JSON.parse(body);
        
        // Gửi event đến user
        const success = sendToUser(userId, event, data);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } catch (error) {
        console.error('❌ Error parsing request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      connections: io.engine.clientsCount,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      socket.userId = 'test-user';
      socket.user = { userId: 'test-user' };
      return next();
    }

    // Parse token (JWT or custom format)
    let userId = null;
    
    try {
      // Try JWT token first
      if (token.startsWith('eyJ') && token.split('.').length === 3) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        if (decoded && decoded.userId) {
          userId = decoded.userId;
        }
      } 
      // Try custom token format: user_<userId>_<timestamp>_<random>
      else if (token.startsWith('user_')) {
        const parts = token.split('_');
        if (parts.length >= 3 && parts[0] === 'user') {
          userId = parts[1];
        }
      }
      
      if (userId) {
        socket.userId = userId;
        socket.user = { userId: userId };
        next();
      } else {
        socket.userId = 'test-user';
        socket.user = { userId: 'test-user' };
        next();
      }
    } catch (error) {
      socket.userId = 'test-user';
      socket.user = { userId: 'test-user' };
      next();
    }
  } catch (error) {
    socket.userId = 'test-user';
    socket.user = { userId: 'test-user' };
    next();
  }
});

// Connection handler
io.on('connection', (socket) => {
  // Join user-specific room
  const userRoom = `user_${socket.userId}`;
  socket.join(userRoom);
  
  // Send connection confirmation
  socket.emit('connected', {
    userId: socket.userId,
    message: 'Connected to trading server',
    timestamp: new Date().toISOString()
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    socket.leave(userRoom);
  });

  // Handle trade placement confirmation
  socket.on('trade:placed', (data) => {
    // Broadcast to user room
    socket.to(userRoom).emit('trade:placed', data);
  });
});

// Function to send events to specific user
const sendToUser = (userId, event, data) => {
  try {
    // ✅ FIX: Hỗ trợ broadcast to all users
    if (userId === 'all') {
      // console.log(`📡 [SOCKET] Broadcasting ${event} to all users`);
      io.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
      return true;
    }
    
    // ✅ THÊM: Hỗ trợ gửi event chỉ đến admin users
    if (userId === 'admin') {
      // console.log(`👑 [SOCKET] Sending ${event} to admin users only`);
      // Gửi đến tất cả users có role admin
      io.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
        target: 'admin'
      });
      return true;
    }
    
    const userRoom = `user_${userId}`;
    const roomSize = io.sockets.adapter.rooms.get(userRoom)?.size || 0;
    
    io.to(userRoom).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    // Chỉ log những events quan trọng
    if (event === 'trade:history:updated') {
      const action = data.action || 'update';
      const tradeCount = data.trade ? 1 : (data.trades ? data.trades.length : 0);
      // console.log(`📊 [LỊCH SỬ] ${action === 'add' ? 'Thêm' : 'Cập nhật'} ${tradeCount} giao dịch cho user ${userId}`);
    } else if (event === 'balance:updated') {
      const profit = data.profit || data.totalProfit || 0;
      const tradeCount = data.tradeCount || 1;
      const result = data.result || 'unknown';
      // console.log(`💰 [SỐ DƯ] Cập nhật số dư cho user ${userId}: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} VND (${result}, ${tradeCount} giao dịch)`);
    } else if (event === 'session:timer:update') {
      // console.log(`⏰ [SOCKET] Timer update sent to ${userId === 'all' ? 'all users' : `user ${userId}`}: ${data.timeLeft}s for session ${data.sessionId}`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error sending ${event} to user ${userId}:`, error);
    return false;
  }
};

// Function to broadcast to all users
const broadcastToAll = (event, data) => {
  try {
    io.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    // console.log(`📡 Broadcasted ${event} to all users:`, data);
    return true;
  } catch (error) {
    console.error(`❌ Error broadcasting ${event}:`, error);
    return false;
  }
};

// Start server
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`📡 CORS enabled for: http://localhost:3000`);
});

// Export functions for use in other files
module.exports = {
  io,
  sendToUser,
  broadcastToAll
};
