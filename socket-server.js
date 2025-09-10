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
  }
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
    
    console.log('🔐 Socket authentication attempt:', {
      hasToken: !!token,
      token: token ? token.substring(0, 20) + '...' : 'none'
    });
    
    if (!token) {
      console.log('⚠️ No token provided, allowing connection for testing');
      socket.userId = 'test-user';
      socket.user = { userId: 'test-user' };
      return next();
    }

    // Parse token (JWT or custom format)
    let userId = null;
    
    try {
      // Try JWT token first
      if (token.startsWith('eyJ') && token.split('.').length === 3) {
        console.log('🔐 Attempting JWT token verification');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        if (decoded && decoded.userId) {
          userId = decoded.userId;
          console.log('✅ JWT token verified for user:', userId);
        }
      } 
      // Try custom token format: user_<userId>_<timestamp>_<random>
      else if (token.startsWith('user_')) {
        console.log('🔐 Attempting custom token parsing');
        const parts = token.split('_');
        
        if (parts.length >= 3 && parts[0] === 'user') {
          userId = parts[1];
          console.log('✅ Custom token parsed for user:', userId);
        }
      }
      
      if (userId) {
        // Attach user info to socket
        socket.userId = userId;
        socket.user = { userId: userId };
        console.log('✅ Socket authenticated for user:', socket.userId);
        next();
      } else {
        console.log('⚠️ Invalid token format, allowing connection for testing');
        socket.userId = 'test-user';
        socket.user = { userId: 'test-user' };
        next();
      }
    } catch (error) {
      console.log('⚠️ Token verification failed, allowing connection for testing');
      socket.userId = 'test-user';
      socket.user = { userId: 'test-user' };
      next();
    }
  } catch (error) {
    console.error('Socket authentication error:', error);
    // Allow connection for testing
    socket.userId = 'test-user';
    socket.user = { userId: 'test-user' };
    next();
  }
});

// Connection handler
io.on('connection', (socket) => {
  console.log(`🔗 User ${socket.userId} connected to Socket.IO`);
  
  // Join user-specific room
  const userRoom = `user_${socket.userId}`;
  socket.join(userRoom);
  
  console.log(`🏠 User ${socket.userId} joined room: ${userRoom}`);
  console.log(`📊 Total rooms:`, Array.from(io.sockets.adapter.rooms.keys()));
  
  // Send connection confirmation
  socket.emit('connected', {
    userId: socket.userId,
    message: 'Connected to trading server',
    timestamp: new Date().toISOString()
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 User ${socket.userId} disconnected from Socket.IO`);
    socket.leave(userRoom);
  });

  // Handle trade placement confirmation
  socket.on('trade:placed', (data) => {
    console.log(`📊 Trade placed by user ${socket.userId}:`, data);
    // Broadcast to user room
    socket.to(userRoom).emit('trade:placed', data);
  });
});

// Function to send events to specific user
const sendToUser = (userId, event, data) => {
  try {
    const userRoom = `user_${userId}`;
    const roomSize = io.sockets.adapter.rooms.get(userRoom)?.size || 0;
    
    console.log(`📡 Attempting to send ${event} to user ${userId} in room ${userRoom} (${roomSize} clients)`);
    
    io.to(userRoom).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Sent ${event} to user ${userId}:`, data);
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
    console.log(`📡 Broadcasted ${event} to all users:`, data);
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
