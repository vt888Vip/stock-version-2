'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown,
  Clock,
  RefreshCw,
  Eye,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useSocket } from '@/contexts/SocketContext';

interface Session {
  _id: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  status: string;
  result?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  timeUntilStart?: number;
}

// Removed AdminSession interface - not needed for simple table view

export default function SessionResultsManagement() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  const socketContext = useSocket();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  // ✅ Socket.IO real-time updates
  useEffect(() => {
    if (!socketContext.socket) return;

    const debouncedFetchSessions = () => {
      // Clear existing timeout
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      // Set new timeout to debounce API calls
      fetchTimeoutRef.current = setTimeout(() => {
        fetchSessions();
      }, 1000); // 1 second debounce
    };

    const handleSessionUpdate = (data: any) => {
      const eventKey = `session_update_${data.sessionId}_${data.timestamp || Date.now()}`;
      
      if (!processedEventsRef.current.has(eventKey)) {
        processedEventsRef.current.add(eventKey);
        
        // Debounced refresh sessions when there's an update
        debouncedFetchSessions();
        
        // Clean up processed events after 5 seconds
        setTimeout(() => {
          processedEventsRef.current.delete(eventKey);
        }, 5000);
      }
    };

    const handleNewSession = (data: any) => {
      const eventKey = `new_session_${data.sessionId}_${Date.now()}`;
      
      if (!processedEventsRef.current.has(eventKey)) {
        processedEventsRef.current.add(eventKey);
        
        // Debounced refresh sessions when new session is created
        debouncedFetchSessions();
        
        setTimeout(() => {
          processedEventsRef.current.delete(eventKey);
        }, 5000);
      }
    };

    // Socket event listeners
    socketContext.socket?.on('session:created', handleNewSession);
    socketContext.socket?.on('session:updated', handleSessionUpdate);
    socketContext.socket?.on('session:trade_window:opened', handleSessionUpdate);
    socketContext.socket?.on('session:trade_window:closed', handleSessionUpdate);
    socketContext.socket?.on('session:settlement:started', handleSessionUpdate);
    socketContext.socket?.on('session:settlement:completed', handleSessionUpdate);
    socketContext.socket?.on('session:completed', handleSessionUpdate);

    // Socket connection status
    socketContext.socket?.on('connect', () => {
      setSocketConnected(true);
    });

    socketContext.socket?.on('disconnect', () => {
      setSocketConnected(false);
    });

    return () => {
      // Clear debounce timeout
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      socketContext.socket?.off('session:created', handleNewSession);
      socketContext.socket?.off('session:updated', handleSessionUpdate);
      socketContext.socket?.off('session:trade_window:opened', handleSessionUpdate);
      socketContext.socket?.off('session:trade_window:closed', handleSessionUpdate);
      socketContext.socket?.off('session:settlement:started', handleSessionUpdate);
      socketContext.socket?.off('session:settlement:completed', handleSessionUpdate);
      socketContext.socket?.off('session:completed', handleSessionUpdate);
      socketContext.socket?.off('connect');
      socketContext.socket?.off('disconnect');
    };
  }, [socketContext]);

  // ✅ Real-time countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      setSessions(prevSessions => 
        prevSessions.map(session => ({
          ...session,
          timeUntilStart: Math.max(0, Math.floor((new Date(session.startTime).getTime() - Date.now()) / 1000))
        }))
      );
    };

    // Update countdown every second
    timerRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  const fetchSessions = async () => {
    try {
      // ✅ SỬA: Sử dụng API future sessions để lấy 30 phiên trong tương lai
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      if (!token) {
        setError('Không tìm thấy token đăng nhập');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/session-results/future?limit=30', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [ADMIN] API Error:', response.status, errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        const sessions = data.data?.sessions || [];
        // ✅ SAFETY: Validate sessions data
        const validSessions = sessions.filter((session: any) => 
          session && 
          session.sessionId && 
          typeof session.sessionId === 'string'
        );
        setSessions(validSessions);
        setLastUpdate(new Date());
      } else {
        setError(data.message || 'Failed to fetch sessions');
      }
    } catch (error) {
      console.error('❌ [ADMIN] Error fetching sessions:', error);
      setError(`Lỗi khi tải dữ liệu: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Removed fetchAdminSessions - not needed for simple table view

  // ✅ THÊM: Function refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    await fetchSessions();
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getTimeRemaining = (endTime: string) => {
    const now = new Date();
    const end = new Date(endTime);
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return '0 phút';
    
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes} phút`;
  };

  const getTimeUntilStart = (startTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();
    
    if (diff <= 0) return 'Đã bắt đầu';
    
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Chờ bắt đầu</Badge>;
      case 'ACTIVE':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Đang hoạt động</Badge>;
      case 'TRADING':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Đang giao dịch</Badge>;
      case 'SETTLING':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Đang xử lý</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Đã hoàn thành</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">{status}</Badge>;
    }
  };

  const getResultBadge = (result?: string) => {
    if (!result) {
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Chưa có kết quả</Badge>;
    }
    
    switch (result) {
      case 'UP':
        return <Badge className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          LÊN
        </Badge>;
      case 'DOWN':
        return <Badge className="bg-pink-100 text-pink-800 border-pink-200 flex items-center gap-1">
          <TrendingDown className="w-3 h-3" />
          XUỐNG
        </Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">{result}</Badge>;
    }
  };

  // Removed getDeviceInfo - not needed for simple table view

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="w-8 h-8 mx-auto mb-2 animate-spin" />
          <p>Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <Eye className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {sessions.length} phiên giao dịch tương lai
            </h1>
            <p className="text-sm text-gray-600">
              Hiển thị real-time 30 phiên giao dịch sắp diễn ra
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Socket Status */}
          <div className="flex items-center gap-2">
            {socketConnected ? (
              <div className="flex items-center gap-1 text-green-600">
                <Wifi className="w-4 h-4" />
                <span className="text-sm">Kết nối</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600">
                <WifiOff className="w-4 h-4" />
                <span className="text-sm">Mất kết nối</span>
              </div>
            )}
          </div>
          
          {/* Last Update */}
          <div className="text-xs text-gray-500">
            Cập nhật: {lastUpdate.toLocaleTimeString('vi-VN')}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Table */}
      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có phiên giao dịch tương lai</h3>
          <p className="text-gray-500">
            Scheduler chưa tạo phiên giao dịch tương lai hoặc chưa chạy.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="bg-blue-50 border-b border-blue-200">
            <div className="grid grid-cols-8 gap-4 px-6 py-3 text-sm font-medium text-blue-800">
              <div>Mã phiên</div>
              <div>Thời gian bắt đầu</div>
              <div>Thời gian kết thúc</div>
              <div>Còn lại</div>
              <div>Trạng thái</div>
              <div>Kết quả</div>
              <div>Người tạo</div>
              <div>Thao tác</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-200">
            {sessions.map((session, index) => (
              <div 
                key={session._id} 
                className={`grid grid-cols-8 gap-4 px-6 py-4 text-sm ${
                  index % 2 === 0 ? 'bg-white' : 'bg-blue-50'
                } hover:bg-gray-50 transition-colors`}
              >
                {/* Mã phiên */}
                <div className="font-mono text-gray-900">
                  {session.sessionId || 'N/A'}
                </div>

                {/* Thời gian bắt đầu */}
                <div className="text-gray-700">
                  <div>{formatTime(session.startTime)}</div>
                  <div className="text-xs text-gray-500">{formatDate(session.startTime)}</div>
                </div>

                {/* Thời gian kết thúc */}
                <div className="text-gray-700">
                  <div>{formatTime(session.endTime)}</div>
                  <div className="text-xs text-gray-500">{formatDate(session.endTime)}</div>
                </div>

                {/* Còn lại */}
                <div className="text-blue-600 font-medium">
                  {getTimeUntilStart(session.startTime)}
                </div>

                {/* Trạng thái */}
                <div>
                  {getStatusBadge(session.status)}
                </div>

                {/* Kết quả */}
                <div>
                  {getResultBadge(session.result)}
                </div>

                {/* Người tạo */}
                <div className="text-gray-700">
                  {session.createdBy || 'Hệ thống'}
                </div>

                {/* Thao tác */}
                <div>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    Chờ bắt đầu
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
