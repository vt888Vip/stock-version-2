const { createServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const express = require('express');
require('dotenv').config();

// Create HTTP/HTTPS server
// Environment
const isProduction = process.env.NODE_ENV === 'production';

// Create Express app
const app = express();
app.use(express.json());

// Always run HTTP internally (SSL terminates at NGINX)
let server = createServer(app);
console.log(`🔓 Socket server running over HTTP internally`);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000", 
      "https://newlondonfinancial.com",
      "https://www.newlondonfinancial.com",
      "http://newlondonfinancial.com",
      "http://www.newlondonfinancial.com",
      "https://38.180.107.104",
      "http://38.180.107.104",
      "https://38.180.107.104:3000",
      "http://38.180.107.104:3000",
      "https://38.180.107.104:3001",
      "http://38.180.107.104:3001"
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  // ✅ Tối ưu cấu hình cho VPS - Ultra Real-time
  pingTimeout: 15000, // 15s - giảm thêm
  pingInterval: 5000, // 5s - giảm thêm cho VPS
  transports: ['websocket', 'polling'], // Fallback cho VPS
  allowEIO3: true, // Tương thích với client cũ
  // ✅ Tối ưu performance cho VPS
  maxHttpBufferSize: 2e6, // 2MB - tăng cho VPS
  compression: true,
  // ✅ Tối ưu reconnection cho VPS
  allowUpgrades: true,
  upgradeTimeout: 3000, // Giảm xuống 3s
  // ✅ Thêm cấu hình real-time cho VPS
  serveClient: false, // Tắt serve client files
  cookie: false, // Tắt cookie để giảm overhead
  // ✅ Tối ưu cho VPS - Aggressive settings
  perMessageDeflate: {
    threshold: 512, // Giảm threshold
    concurrencyLimit: 5, // Giảm concurrency
    memLevel: 5 // Giảm memory level
  },
  // ✅ Thêm cấu hình cho VPS
  connectTimeout: 10000, // 10s connection timeout
  transports: ['websocket', 'polling'], // Fallback transport
  // ✅ Tối ưu cho network không ổn định
  forceBase64: false, // Sử dụng binary frames
  // ✅ Thêm heartbeat cho VPS
  heartbeatInterval: 5000, // 5s heartbeat
  heartbeatTimeout: 10000 // 10s heartbeat timeout
});

// MongoDB connection for balance snapshot on connect
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://vincent:vincent79@cluster0.btgvgm.mongodb.net/finacial_platform';
let mongoConnected = false;
async function ensureMongoConnection() {
  if (mongoConnected) return;
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set; cannot send balance snapshot on connect');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI || 'mongodb+srv://vincent:vincent79@cluster0.btgvgm.mongodb.net/finacial_platform', {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      appName: 'SocketServer'
    });
    mongoConnected = true;
    console.log('✅ Socket server connected to MongoDB for snapshots');
  } catch (err) {
    console.error('❌ Socket server failed to connect MongoDB:', err && err.message);
  }
}

async function getUserBalance(userId) {
  try {
    if (!mongoConnected) {
      await ensureMongoConnection();
    }
    
    if (!mongoConnected || !mongoose.connection.db) {
      return null;
    }
    
    const doc = await mongoose.connection.db.collection('users').findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { balance: 1, username: 1 } }
    );
    
    if (doc) {
      return doc.balance ? {
        available: doc.balance.available || 0,
        frozen: doc.balance.frozen || 0
      } : { available: 0, frozen: 0 };
    } else {
      return null;
    }
  } catch (e) {
    console.error(`❌ [SOCKET] Error getting user balance:`, e.message);
    return null;
  }
}

// ✅ Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
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
  
  // ✅ Debug: Log user join room
  console.log(`🔌 [SOCKET] User ${socket.userId} joined room ${userRoom}`);
  
  // Send connection confirmation
  socket.emit('connected', {
    userId: socket.userId,
    message: 'Connected to trading server',
    timestamp: new Date().toISOString()
  });

  // Emit balance snapshot on connect (single source of truth via socket)
  (async () => {
    if (!socket.userId || socket.userId === 'test-user') return;
    
    const balance = await getUserBalance(socket.userId);
    
    if (balance) {
      io.to(userRoom).emit('balance:updated', {
        userId: socket.userId,
        snapshot: true,
        balance,
        message: 'Balance snapshot on connect',
        timestamp: new Date().toISOString()
      });
      console.log(`💰 [SOCKET] Balance snapshot sent to user ${socket.userId}: ${balance.available} VND`);
    }
  })();

  // Allow client to request a snapshot explicitly after connect
  socket.on('balance:request', async () => {
    if (!socket.userId || socket.userId === 'test-user') return;
    const balance = await getUserBalance(socket.userId);
    if (balance) {
      io.to(userRoom).emit('balance:updated', {
        userId: socket.userId,
        snapshot: true,
        balance,
        message: 'Balance snapshot (on demand)',
        timestamp: new Date().toISOString()
      });
    }
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
      io.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
      return true;
    }
    
    // ✅ THÊM: Hỗ trợ gửi event chỉ đến admin users
    if (userId === 'admin') {
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
    
    // ✅ DEBUG: Log room info (bỏ qua timer events để giảm log noise)
    if (event !== 'session:timer:update' && event !== 'session:settlement:triggered') {
      console.log(`📡 [SOCKET] Sending ${event} to user ${userId}:`, {
        userRoom,
        roomSize,
        event,
        data: data.balance ? { available: data.balance.available, frozen: data.balance.frozen } : 'N/A'
      });
    } else {
      // Log timer events nhưng ngắn gọn hơn
      if (event === 'session:timer:update') {
        console.log(`⏰ [TIMER] Update for session ${data.sessionId}: ${data.timeLeft}s left`);
      }
    }
    
    // ✅ Xử lý batch events từ worker
    if (data.batch && data.events && Array.isArray(data.events)) {
      console.log(`📦 [BATCH] Nhận batch ${event} cho user ${userId}: ${data.events.length} events`);
      
      // Gửi từng event trong batch
      data.events.forEach((eventData, index) => {
        io.to(userRoom).emit(event, {
          ...eventData,
          timestamp: new Date().toISOString()
        });
        console.log(`📦 [BATCH] Gửi event ${index + 1}/${data.events.length} cho user ${userId}`);
      });
      
      return;
    }

    // Gửi single event
    io.to(userRoom).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    // ✅ Debug: Log gửi event
    if (event === 'balance:updated') {
      console.log(`💰 [SOCKET] Emit balance:updated đến room ${userRoom} (${roomSize} clients)`);
      if (roomSize === 0) {
        console.log(`⚠️ [SOCKET] CẢNH BÁO: Room ${userRoom} không có clients nào!`);
      }
    }

    // Chỉ log những events quan trọng (bỏ timer updates)
    if (event === 'trade:history:updated') {
      const action = data.action || 'update';
      const tradeCount = data.trade ? 1 : (data.trades ? data.trades.length : 0);
      console.log(`📊 [LỊCH SỬ] ${action === 'add' ? 'Thêm' : 'Cập nhật'} ${tradeCount} giao dịch cho user ${userId}`);
    } else if (event === 'balance:updated') {
      const profit = data.profit || data.totalProfit || 0;
      const tradeCount = data.tradeCount || 1;
      const result = data.result || 'unknown';
      const available = data.balance?.available || 0;
      const frozen = data.balance?.frozen || 0;
      const profitText = profit >= 0 ? `+${profit.toLocaleString()}` : `${profit.toLocaleString()}`;
      const statusText = result === 'win' ? 'THẮNG' : result === 'lose' ? 'THUA' : 'UNKNOWN';
      console.log(`💰 [SỐ DƯ] Cập nhật số dư cho user ${userId}: ${profitText} VND (${statusText}, ${tradeCount} giao dịch) - Balance: ${available.toLocaleString()}/${frozen.toLocaleString()}`);
    } else if (event === 'trade:placed') {
      const amount = data.amount || data.amount || 0;
      console.log(`📈 [TRADE] Đặt lệnh thành công cho user ${userId}: ${amount.toLocaleString()} VND (${data.direction})`);
    } else if (event === 'trades:batch:completed') {
      console.log(`✅ [BATCH] Hoàn tất xử lý batch cho user ${userId}: ${data.trades?.length || 0} giao dịch`);
    } else if (event === 'session:settlement:completed') {
      console.log(`✅ [SETTLEMENT] Hoàn tất settlement cho session ${data.sessionId} - Kết quả: ${data.result}`);
    } else if (event === 'trade:completed') {
      const profit = data.profit || 0;
      const result = data.result || 'unknown';
      const profitText = profit >= 0 ? `+${profit.toLocaleString()}` : `${profit.toLocaleString()}`;
      const statusText = result === 'win' ? 'THẮNG' : result === 'lose' ? 'THUA' : 'UNKNOWN';
      console.log(`🎯 [SETTLEMENT] Giao dịch hoàn tất cho user ${userId}: ${statusText} - Lợi nhuận: ${profitText} VND`);
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

// ✅ HTTP endpoint để nhận events từ worker
app.post('/emit', async (req, res) => {
  try {
    const { userId, event, data } = req.body;
    
    if (!userId || !event || !data) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: userId, event, data' 
      });
    }

    // ✅ DEBUG: Log chi tiết request (bỏ qua timer events)
    if (event !== 'session:timer:update' && event !== 'session:settlement:triggered') {
      console.log(`📡 [SOCKET] Received emit request:`, {
        userId,
        event,
        data: {
          ...data,
          balance: data.balance ? { available: data.balance.available, frozen: data.balance.frozen } : 'N/A'
        }
      });
    }
    
    // Gửi event đến user
    const success = await sendToUser(userId, event, data);
    
    // ✅ Debug: Log kết quả gửi event
    if (event === 'balance:updated') {
      console.log(`💰 [SOCKET] Gửi balance:updated đến user ${userId}: ${success ? 'THÀNH CÔNG' : 'THẤT BẠI'}`);
    }
    
    res.json({ success });
  } catch (error) {
    console.error(`❌ [HTTP] Error processing emit request:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start server
const PORT = process.env.SOCKET_PORT || 3001;
const protocol = 'http';

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`📡 Protocol: ${protocol.toUpperCase()}`);
  console.log(`📡 CORS enabled for:`);
  console.log(`   - http://localhost:3000`);
  console.log(`   - https://newlondonfinancial.com`);
  console.log(`   - https://www.newlondonfinancial.com`);
  console.log(`   - https://38.180.107.104`);
  console.log(`   - http://38.180.107.104`);
});

// Export functions for use in other files
module.exports = {
  io,
  sendToUser,
  broadcastToAll
};
