import { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from './auth';

let io: SocketIOServer | null = null;

export const initSocket = (server: any) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = await verifyToken(token);
      
      if (!decoded || !decoded.userId) {
        return next(new Error('Authentication error: Invalid token'));
      }

      // Attach user info to socket
      socket.userId = decoded.userId;
      socket.user = decoded;
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`🔗 User ${socket.userId} connected to Socket.IO`);
    
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

  console.log('✅ Socket.IO server initialized');
  return io;
};

// Function to send events to specific user
export const sendToUser = (userId: string, event: string, data: any) => {
  if (!io) {
    console.error('❌ Socket.IO not initialized');
    return false;
  }

  try {
    io.to(`user_${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 Sent ${event} to user ${userId}:`, data);
    return true;
  } catch (error) {
    console.error(`❌ Error sending ${event} to user ${userId}:`, error);
    return false;
  }
};

// Function to broadcast to all users
export const broadcastToAll = (event: string, data: any) => {
  if (!io) {
    console.error('❌ Socket.IO not initialized');
    return false;
  }

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

// Get Socket.IO instance
export const getSocketIO = () => io;
