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
    
    console.log('🔗 Connecting to Socket.IO...');
    console.log('🔑 Token:', token ? 'Present' : 'Not found');
    console.log('👤 User:', user);

    const newSocket = io('http://localhost:3001', {
      auth: {
        token: token || 'test-token'
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket.IO connected');
      console.log('🔗 Socket ID:', newSocket.id);
      console.log('🔗 Socket transport:', newSocket.io.engine.transport.name);
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Socket.IO disconnected');
      setIsConnected(false);
    });

    newSocket.on('connected', (data) => {
      console.log('📡 Socket.IO server message:', data);
    });

    // Debug: Log tất cả events
    newSocket.onAny((eventName, ...args) => {
      console.log('🔍 Socket.IO event received:', eventName, args);
    });

    newSocket.on('trade:placed', (data) => {
      console.log('📊 Trade placed event received:', data);
      
      // Dispatch custom event để cập nhật trade history
      const tradePlacedEvent = new CustomEvent('trade:placed', {
        detail: data
      });
      window.dispatchEvent(tradePlacedEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    newSocket.on('trade:completed', (data) => {
      console.log('🎉 Trade completed event received:', data);
      console.log('🎉 Dispatching custom event for trade:completed');
      
      // Dispatch custom event để cập nhật trade history
      const tradeCompletedEvent = new CustomEvent('trade:completed', {
        detail: data
      });
      window.dispatchEvent(tradeCompletedEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    newSocket.on('balance:updated', (data) => {
      console.log('💰 Balance updated event received:', data);
      
      // Dispatch custom event để các component khác có thể lắng nghe
      const balanceEvent = new CustomEvent('balance:updated', {
        detail: data
      });
      window.dispatchEvent(balanceEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
    });

    newSocket.on('trade:history:updated', (data) => {
      console.log('📊 Trade history updated event received:', data);
      console.log('📊 Dispatching custom event for trade:history:updated');
      
      // Dispatch custom event để các component khác có thể lắng nghe
      const tradeHistoryEvent = new CustomEvent('trade:history:updated', {
        detail: data
      });
      window.dispatchEvent(tradeHistoryEvent);
      
      // Không hiển thị toast vì UI đã cập nhật real-time
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
