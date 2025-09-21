"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/ui/use-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = () => {
    if (socket?.connected) return;

    const token = localStorage.getItem('authToken');
    
    // console.log('🔗 Connecting to Socket.IO...');
    // console.log('🔑 Token:', token ? 'Present' : 'Not found');
    // console.log('👤 User:', user);

    // Sử dụng IP của VPS thay vì localhost
    const socketUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3001' 
      : 'http://174.138.24.77:3001';
    
    const newSocket = io(socketUrl, {
      auth: {
        token: token || 'test-token'
      },
      transports: ['websocket'], // ✅ Chỉ dùng WebSocket cho real-time
      timeout: 10000, // ✅ Giảm timeout xuống 10s
      forceNew: true,
      // ✅ Thêm cấu hình tối ưu cho VPS
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    newSocket.on('connect', () => {
      // console.log('✅ Socket.IO connected');
      // console.log('🔗 Socket ID:', newSocket.id);
      // console.log('🔗 Socket transport:', newSocket.io.engine.transport.name);
      // console.log('🌐 Server URL:', socketUrl);
      setIsConnected(true);
    });

    // ✅ Thêm monitoring cho VPS
    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
      // console.log('🔄 Will retry connection...');
    });

    newSocket.on('reconnect', (attemptNumber) => {
      // console.log(`🔄 Socket.IO reconnected after ${attemptNumber} attempts`);
    });

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      // console.log(`🔄 Socket.IO reconnection attempt ${attemptNumber}`);
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('❌ Socket.IO reconnection error:', error);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('❌ Socket.IO reconnection failed - giving up');
    });

    newSocket.on('disconnect', () => {
      // console.log('🔌 Socket.IO disconnected');
      setIsConnected(false);
    });

    newSocket.on('connected', (data) => {
      // console.log('📡 Socket.IO server message:', data);
    });

    // Debug: Log tất cả events (disabled for cleaner console)
    // newSocket.onAny((eventName, ...args) => {
    //   console.log('🔍 Socket.IO event received:', eventName, args);
    // });

    newSocket.on('trade:placed', (data) => {
      // Dispatch custom event để cập nhật trade history
      const tradePlacedEvent = new CustomEvent('trade:placed', {
        detail: data
      });
      window.dispatchEvent(tradePlacedEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    newSocket.on('trade:completed', (data) => {
      // Dispatch custom event để cập nhật trade history
      const tradeCompletedEvent = new CustomEvent('trade:completed', {
        detail: data
      });
      window.dispatchEvent(tradeCompletedEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    newSocket.on('trades:batch:completed', (data) => {
      // Dispatch custom event để cập nhật trade history
      const batchCompletedEvent = new CustomEvent('trades:batch:completed', {
        detail: data
      });
      window.dispatchEvent(batchCompletedEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    newSocket.on('balance:updated', (data) => {
      // Dispatch custom event để các component khác có thể lắng nghe
      const balanceEvent = new CustomEvent('balance:updated', {
        detail: data
      });
      window.dispatchEvent(balanceEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    newSocket.on('trade:history:updated', (data) => {
      // Dispatch custom event để các component khác có thể lắng nghe
      const tradeHistoryEvent = new CustomEvent('trade:history:updated', {
        detail: data
      });
      window.dispatchEvent(tradeHistoryEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    // ✅ SCHEDULER EVENTS: Lắng nghe events từ Scheduler
    newSocket.on('session:trade_window:opened', (data) => {
      const event = new CustomEvent('session:trade_window:opened', {
        detail: data
      });
      window.dispatchEvent(event);
    });

    newSocket.on('session:trade_window:closed', (data) => {
      const event = new CustomEvent('session:trade_window:closed', {
        detail: data
      });
      window.dispatchEvent(event);
    });

    newSocket.on('session:settlement:triggered', (data) => {
      const event = new CustomEvent('session:settlement:triggered', {
        detail: data
      });
      window.dispatchEvent(event);
    });

    // ✅ TIMER UPDATES: Lắng nghe timer updates từ Scheduler
    newSocket.on('session:timer:update', (data) => {
      const event = new CustomEvent('session:timer:update', {
        detail: data
      });
      window.dispatchEvent(event);
    });

    newSocket.on('session:settlement:completed', (data) => {
      const event = new CustomEvent('session:settlement:completed', {
        detail: data
      });
      window.dispatchEvent(event);
    });

    newSocket.on('session:completed', (data) => {
      const event = new CustomEvent('session:completed', {
        detail: data
      });
      window.dispatchEvent(event);
    });

    newSocket.on('error', (error) => {
      console.error('❌ Socket.IO error:', error);
      toast({
        title: '⚠️ Lỗi kết nối',
        description: 'Mất kết nối với server, đang thử kết nối lại...',
        variant: 'destructive',
        duration: 3000,
      });
    });

    setSocket(newSocket);
  };

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  };

  // Auto-connect when user is available
  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user]);

  const value: SocketContextType = {
    socket,
    isConnected,
    connect,
    disconnect
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
