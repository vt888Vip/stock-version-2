'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast, useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Settings, RefreshCw, Zap, Target } from 'lucide-react';

interface SessionResult {
  _id: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  status: 'ACTIVE' | 'PREDICTED' | 'COMPLETED';
  result?: 'UP' | 'DOWN';
  actualResult?: 'UP' | 'DOWN';
  createdBy?: 'admin' | 'system';
  totalTrades?: number;
  totalWins?: number;
  totalLosses?: number;
  totalWinAmount?: number;
  totalLossAmount?: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function SessionResultsPage() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // States
  const [futureSessions, setFutureSessions] = useState<SessionResult[]>([]);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionResult | null>(null);
  const [showSetResultDialog, setShowSetResultDialog] = useState(false);
  const [selectedResult, setSelectedResult] = useState<'UP' | 'DOWN'>('UP');

  // Check authentication and admin access
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated()) {
        toast({
          title: 'Lỗi',
          description: 'Vui lòng đăng nhập để truy cập trang quản trị',
          variant: 'destructive',
        });
        router.push('/login');
        return;
      }

      if (!isAdmin()) {
        toast({
          title: 'Lỗi',
          description: 'Bạn không có quyền truy cập trang này',
          variant: 'destructive',
        });
        router.push('/');
        return;
      }
    }
  }, [isLoading, isAuthenticated, isAdmin, router, toast]);

  // Load future sessions when component mounts
  useEffect(() => {
    if (isAuthenticated() && isAdmin()) {
      loadFutureSessions();
    }
  }, []);

  const loadFutureSessions = async () => {
    try {
      setLoadingFuture(true);
      const response = await fetch('/api/admin/session-results/future', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFutureSessions(data.data.sessions);
        } else {
          setFutureSessions([]);
        }
      } else {
        setFutureSessions([]);
      }
    } catch (error) {
      console.error('Error loading future sessions:', error);
      setFutureSessions([]);
    } finally {
      setLoadingFuture(false);
    }
  };

  const handleSetResult = async () => {
    if (!selectedSession || !selectedResult) return;

    try {
      const response = await fetch('/api/admin/session-results/future', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          action: 'set_future_result',
          sessionId: selectedSession.sessionId,
          result: selectedResult
        })
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Thành công',
          description: data.message,
        });
        setShowSetResultDialog(false);
        loadFutureSessions();
      } else {
        toast({
          title: 'Lỗi',
          description: data.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error setting result:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật kết quả',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateRandom = async (sessionId: string) => {
    try {
      const response = await fetch('/api/admin/session-results/future', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          action: 'bulk_random_results',
          sessionIds: [sessionId]
        })
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Thành công',
          description: data.message,
        });
        loadFutureSessions();
      } else {
        toast({
          title: 'Lỗi',
          description: data.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error generating random result:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tạo kết quả ngẫu nhiên',
        variant: 'destructive',
      });
    }
  };

  const handleBulkGenerate = async () => {
    try {
      const response = await fetch('/api/admin/session-results/future', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          action: 'bulk_random_results',
          sessionIds: futureSessions.filter(s => s.status === 'ACTIVE').map(s => s.sessionId)
        })
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Thành công',
          description: data.message,
        });
        loadFutureSessions();
      } else {
        toast({
          title: 'Lỗi',
          description: data.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error bulk generating results:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tạo kết quả hàng loạt',
        variant: 'destructive',
      });
    }
  };

  const handleBulkSetResults = async (sessionIds: string[], result: 'UP' | 'DOWN') => {
    try {
      const response = await fetch('/api/admin/session-results/future', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          action: 'bulk_set_future_results',
          sessionIds: sessionIds,
          results: sessionIds.map(() => result)
        })
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Thành công',
          description: data.message,
        });
        loadFutureSessions();
      } else {
        toast({
          title: 'Lỗi',
          description: data.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error bulk setting results:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể đặt kết quả hàng loạt',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-100 text-green-800">Đang hoạt động</Badge>;
      case 'PREDICTED':
        return <Badge className="bg-yellow-100 text-yellow-800">Đã dự đoán</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-blue-100 text-blue-800">Đã hoàn thành</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getResultBadge = (result?: string) => {
    if (!result) return <Badge variant="outline">Chưa có</Badge>;
    return result === 'UP' 
      ? <Badge className="bg-green-100 text-green-800 flex items-center gap-1"><TrendingUp className="w-3 h-3" />LÊN</Badge>
      : <Badge className="bg-red-100 text-red-800 flex items-center gap-1"><TrendingDown className="w-3 h-3" />XUỐNG</Badge>;
  };

  const getCreatedByBadge = (createdBy?: string) => {
    if (!createdBy) return <Badge variant="outline">Hệ thống</Badge>;
    return createdBy === 'admin' 
      ? <Badge className="bg-purple-100 text-purple-800">Admin</Badge>
      : <Badge className="bg-gray-100 text-gray-800">Hệ thống</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Quản lý kết quả phiên giao dịch</h1>
          <p className="text-gray-600 mt-2">Quản lý 30 phiên giao dịch tương lai với độ chính xác 100%</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleBulkGenerate} className="bg-blue-600 hover:bg-blue-700">
            <Zap className="w-4 h-4 mr-2" />
            Random kết quả hàng loạt
          </Button>
          <Button 
            onClick={loadFutureSessions}
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Future Sessions Section */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Target className="h-5 w-5" />
            30 phiên giao dịch tương lai (Độ chính xác 100%)
          </CardTitle>
          <CardDescription className="text-green-700">
            Quản lý kết quả cho 30 phiên giao dịch sắp tới với độ chính xác 100%
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions */}
          <div className="mb-6 p-4 bg-white rounded-lg border border-green-200">
            <h3 className="font-semibold text-green-800 mb-3">Thao tác hàng loạt:</h3>
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={() => {
                  const activeSessionIds = futureSessions.filter(s => s.status === 'ACTIVE').map(s => s.sessionId);
                  if (activeSessionIds.length > 0) {
                    handleBulkSetResults(activeSessionIds, 'UP');
                  }
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Đặt tất cả LÊN
              </Button>
              <Button 
                onClick={() => {
                  const activeSessionIds = futureSessions.filter(s => s.status === 'ACTIVE').map(s => s.sessionId);
                  if (activeSessionIds.length > 0) {
                    handleBulkSetResults(activeSessionIds, 'DOWN');
                  }
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                <TrendingDown className="w-4 h-4 mr-2" />
                Đặt tất cả XUỐNG
              </Button>
              <Button 
                onClick={handleBulkGenerate}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Zap className="w-4 h-4 mr-2" />
                Random tất cả
              </Button>
            </div>
          </div>

          {/* Future Sessions Table */}
          {loadingFuture ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <span className="ml-2 text-green-700">Đang tải 30 phiên tương lai...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-green-50">
                    <TableHead className="text-green-800">Mã phiên</TableHead>
                    <TableHead className="text-green-800">Thời gian bắt đầu</TableHead>
                    <TableHead className="text-green-800">Thời gian kết thúc</TableHead>
                    <TableHead className="text-green-800">Trạng thái</TableHead>
                    <TableHead className="text-green-800">Kết quả</TableHead>
                    <TableHead className="text-green-800">Người tạo</TableHead>
                    <TableHead className="text-green-800">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {futureSessions.map((session) => (
                    <TableRow key={session._id} className="hover:bg-green-50">
                      <TableCell className="font-mono text-sm font-semibold">{session.sessionId}</TableCell>
                      <TableCell>{new Date(session.startTime).toLocaleString('vi-VN')}</TableCell>
                      <TableCell>{new Date(session.endTime).toLocaleString('vi-VN')}</TableCell>
                      <TableCell>{getStatusBadge(session.status)}</TableCell>
                      <TableCell>{getResultBadge(session.result)}</TableCell>
                      <TableCell>{getCreatedByBadge(session.createdBy)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {session.status === 'ACTIVE' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedSession(session);
                                  setShowSetResultDialog(true);
                                }}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <Settings className="w-3 h-3 mr-1" />
                                Đặt kết quả
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleGenerateRandom(session.sessionId)}
                                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Random
                              </Button>
                            </>
                          )}
                          {session.status === 'PREDICTED' && (
                            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">
                              Đã có kết quả
                            </Badge>
                          )}
                          {session.status === 'COMPLETED' && (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                              Đã hoàn thành
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Future Sessions Info */}
          <div className="mt-4 p-4 bg-white rounded-lg border border-green-200">
            <h4 className="font-semibold text-green-800 mb-2">Thông tin quan trọng:</h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• <strong>Độ chính xác 100%:</strong> Kết quả bạn đặt sẽ được sử dụng chính xác khi phiên kết thúc</li>
              <li>• <strong>Xử lý ngay lập tức:</strong> Khi đặt kết quả, tất cả lệnh sẽ được xử lý ngay lập tức</li>
              <li>• <strong>30 phiên tương lai:</strong> Hệ thống tự động tạo và quản lý 30 phiên giao dịch sắp tới</li>
              <li>• <strong>Quản lý hàng loạt:</strong> Có thể đặt kết quả cho nhiều phiên cùng lúc</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Set Result Dialog */}
      <Dialog open={showSetResultDialog} onOpenChange={setShowSetResultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đặt kết quả cho phiên {selectedSession?.sessionId}</DialogTitle>
            <DialogDescription>
              Chọn kết quả cho phiên giao dịch này. Kết quả này sẽ được sử dụng khi phiên kết thúc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Kết quả:</label>
              <Select value={selectedResult} onValueChange={(value: 'UP' | 'DOWN') => setSelectedResult(value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UP">LÊN (UP)</SelectItem>
                  <SelectItem value="DOWN">XUỐNG (DOWN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetResultDialog(false)}>
              Hủy
            </Button>
            <Button onClick={handleSetResult}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 