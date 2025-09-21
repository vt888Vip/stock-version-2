'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
  Search, 
  X, 
  Eye, 
  Key, 
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Upload,
  Plus,
  CreditCard,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSocket } from '@/contexts/SocketContext';

export default function UsersManagement() {
  const { toast } = useToast();
  const socketContext = useSocket();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search states
  const [searchName, setSearchName] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchRole, setSearchRole] = useState('all');
  const [searchStatus, setSearchStatus] = useState('all');
  const [searchLoading, setSearchLoading] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(20);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalUsers: 0,
    usersPerPage: 20,
    hasNextPage: false,
    hasPrevPage: false
  });

  // User management states
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  
  // Password reset states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // File upload states
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);

  // Real-time states
  const [socketConnected, setSocketConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const processedEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadUsers();
  }, []);

  // Socket.IO real-time listeners
  useEffect(() => {
    const socket = socketContext?.socket;
    if (!socket) return;

    // Connection status
    const handleConnect = () => {
      setSocketConnected(true);
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    // Balance update events (chỉ xử lý events dành cho admin)
    const handleBalanceUpdate = (data: any) => {
      // ✅ CHỈ xử lý events có target: 'admin' hoặc không có target (backward compatibility)
      if (data.target && data.target !== 'admin') return;
      
      const userId = data.userId || data.user?._id;
      if (!userId) return;
      
      const eventKey = `balance_update_${userId}_${data.timestamp || Date.now()}`;
      if (processedEventsRef.current.has(eventKey)) return;
      
      processedEventsRef.current.add(eventKey);
      setLastUpdate(new Date());
      
      console.log(`💰 [ADMIN-USERS] Balance update received for user ${userId}:`, {
        available: data.balance?.available,
        frozen: data.balance?.frozen,
        amount: data.amount,
        profit: data.profit,
        message: data.message,
        target: data.target
      });
      
      // Update user balance in real-time
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user._id === userId 
            ? { 
                ...user, 
                balance: {
                  ...user.balance,
                  available: data.balance?.available || user.balance?.available,
                  frozen: data.balance?.frozen || user.balance?.frozen
                }
              }
            : user
        )
      );

      // Clean up processed event after 5 seconds
      setTimeout(() => {
        processedEventsRef.current.delete(eventKey);
      }, 5000);
    };

    // Trade events that affect balance
    const handleTradePlaced = (data: any) => {
      const userId = data.userId || data.user?._id;
      if (!userId) return;
      
      const eventKey = `trade_placed_${userId}_${data.timestamp || Date.now()}`;
      if (processedEventsRef.current.has(eventKey)) return;
      
      processedEventsRef.current.add(eventKey);
      setLastUpdate(new Date());
      
      // Update user balance when trade is placed
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user._id === userId 
            ? { 
                ...user, 
                balance: {
                  ...user.balance,
                  available: data.balance?.available || user.balance?.available,
                  frozen: data.balance?.frozen || user.balance?.frozen
                }
              }
            : user
        )
      );

      setTimeout(() => {
        processedEventsRef.current.delete(eventKey);
      }, 5000);
    };

    const handleSettlementCompleted = (data: any) => {
      const eventKey = `settlement_${data.sessionId}_${data.timestamp}`;
      if (processedEventsRef.current.has(eventKey)) return;
      
      processedEventsRef.current.add(eventKey);
      setLastUpdate(new Date());
      
      // Update balances for all users affected by settlement
      if (data.userBalances) {
        setUsers(prevUsers => 
          prevUsers.map(user => {
            const updatedBalance = data.userBalances.find((ub: any) => ub.userId === user._id);
            return updatedBalance 
              ? { 
                  ...user, 
                  balance: {
                    ...user.balance,
                    available: updatedBalance.balance?.available || user.balance?.available,
                    frozen: updatedBalance.balance?.frozen || user.balance?.frozen
                  }
                }
              : user;
          })
        );
      }

      setTimeout(() => {
        processedEventsRef.current.delete(eventKey);
      }, 5000);
    };

    // Register event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('balance:updated', handleBalanceUpdate);
    socket.on('trade:placed', handleTradePlaced);
    socket.on('session:settlement:completed', handleSettlementCompleted);

    // Cleanup
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('balance:updated', handleBalanceUpdate);
      socket.off('trade:placed', handleTradePlaced);
      socket.off('session:settlement:completed', handleSettlementCompleted);
    };
  }, [socketContext?.socket]);

  const loadUsers = async (page = currentPage, isSearch = false) => {
    try {
      if (isSearch) {
        setSearchLoading(true);
      } else {
        setLoading(true);
      }
      
      // Xây dựng query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        limit: usersPerPage.toString(),
        ...(searchName && { search: searchName }),
        ...(searchRole && searchRole !== 'all' && { role: searchRole }),
        ...(searchStatus && searchStatus !== 'all' && { status: searchStatus }),
        ...(searchDateFrom && { dateFrom: searchDateFrom }),
        ...(searchDateTo && { dateTo: searchDateTo })
      });

      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
        setPagination(data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalUsers: 0,
          usersPerPage: 20,
          hasNextPage: false,
          hasPrevPage: false
        });
      } else {
        const errorData = await response.json();
        toast({
          title: 'Lỗi',
          description: errorData.message || 'Không thể tải danh sách người dùng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách người dùng',
        variant: 'destructive',
      });
    } finally {
      if (isSearch) {
        setSearchLoading(false);
      } else {
        setLoading(false);
      }
    }
  };

  // Function to manually refresh user data (fallback)
  const refreshUserData = async () => {
    await loadUsers(currentPage);
    setLastUpdate(new Date());
    toast({
      title: 'Thành công',
      description: 'Đã làm mới dữ liệu người dùng',
    });
  };

  // User management functions
  const handleViewUser = (user: any) => {
    setEditingUser({ ...user });
    setShowUserModal(true);
  };

  const handleEditUser = async () => {
    if (!editingUser) return;

    try {
      const response = await fetch(`/api/admin/users/${editingUser._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editingUser)
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã cập nhật thông tin người dùng',
        });
        setShowUserModal(false);
        setEditingUser(null);
        loadUsers(currentPage);
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể cập nhật người dùng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật người dùng',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/admin/users/${userToDelete._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã xóa người dùng',
        });
        setShowDeleteConfirm(false);
        setUserToDelete(null);
        // Check if we need to go to previous page
        const remainingUsers = totalUsers - 1;
        const maxPage = Math.ceil(remainingUsers / usersPerPage);
        if (currentPage > maxPage && maxPage > 0) {
          setCurrentPage(maxPage);
          loadUsers(maxPage);
        } else {
          loadUsers(currentPage);
        }
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể xóa người dùng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xóa người dùng',
        variant: 'destructive',
      });
    }
  };

  // Password reset functions
  const handleResetPassword = (user: any) => {
    console.log('🔍 Resetting password for user:', {
      username: user.username,
      id: user._id,
      idType: typeof user._id,
      idString: user._id?.toString()
    });
    setUserToResetPassword(user);
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordModal(true);
  };

  const confirmResetPassword = async () => {
    if (!userToResetPassword) return;

    // Validate password
    if (newPassword.length < 6) {
      toast({
        title: 'Lỗi',
        description: 'Mật khẩu phải có ít nhất 6 ký tự',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Lỗi',
        description: 'Mật khẩu xác nhận không khớp',
        variant: 'destructive',
      });
      return;
    }

    setIsResettingPassword(true);

    try {
      console.log('🚀 Making API call to reset password for user ID:', userToResetPassword._id);
      const response = await fetch(`/api/admin/users/${userToResetPassword._id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ newPassword })
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: `Đã đổi mật khẩu cho ${userToResetPassword.username}`,
        });
        setShowPasswordModal(false);
        setUserToResetPassword(null);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể đổi mật khẩu',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể đổi mật khẩu',
        variant: 'destructive',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Pagination logic - now using server-side data
  const currentUsers = users; // Users are already filtered and paginated by server
  const totalPages = pagination.totalPages;
  const totalUsers = pagination.totalUsers;

  // Pagination functions
  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    loadUsers(pageNumber);
  };

  const goToFirstPage = () => {
    if (pagination.hasPrevPage) {
      goToPage(1);
    }
  };

  const goToLastPage = () => {
    if (pagination.hasNextPage) {
      goToPage(totalPages);
    }
  };

  const goToPreviousPage = () => {
    if (pagination.hasPrevPage) {
      goToPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (pagination.hasNextPage) {
      goToPage(currentPage + 1);
    }
  };

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadUsers(1, true);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchName, searchDateFrom, searchDateTo, searchRole, searchStatus]);

  // Immediate search for non-text inputs
  useEffect(() => {
    setCurrentPage(1);
    loadUsers(1, true);
  }, [searchRole, searchStatus, searchDateFrom, searchDateTo]);

  // File upload functions
  const handleFileUpload = async (file: File, type: 'front' | 'back') => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Lỗi',
        description: 'Chỉ chấp nhận file ảnh',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Lỗi',
        description: 'File ảnh không được lớn hơn 5MB',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('type', type);
    formData.append('userId', editingUser._id);

    try {
      if (type === 'front') {
        setUploadingFront(true);
      } else {
        setUploadingBack(true);
      }

      const response = await fetch('/api/admin/upload-cccd', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const imageUrl = data.imageUrl;
        
        // Update the user's CCCD information
        setEditingUser({
          ...editingUser,
          verification: {
            ...editingUser.verification,
            [type === 'front' ? 'cccdFront' : 'cccdBack']: imageUrl
          }
        });

        toast({
          title: 'Thành công',
          description: `Đã upload ảnh ${type === 'front' ? 'mặt trước' : 'mặt sau'} CCCD`,
        });
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể upload ảnh',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể upload ảnh',
        variant: 'destructive',
      });
    } finally {
      if (type === 'front') {
        setUploadingFront(false);
      } else {
        setUploadingBack(false);
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file, type);
    }
    // Reset input value to allow selecting the same file again
    event.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-blue-700">Đang tải danh sách người dùng...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-gray-900">Quản lý người dùng</CardTitle>
              <p className="text-sm text-gray-600 mt-1">Quản lý và theo dõi tất cả người dùng trong hệ thống</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Search Filters */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-4">
              <Search className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-800">Tìm kiếm người dùng</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="searchName" className="text-gray-700 font-medium">Tìm kiếm theo tên/email</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="searchName"
                    placeholder="Nhập tên hoặc email..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="pl-10"
                    disabled={searchLoading}
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="searchRole" className="text-gray-700 font-medium">Vai trò</Label>
                <Select value={searchRole} onValueChange={setSearchRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Tất cả vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả vai trò</SelectItem>
                    <SelectItem value="user">Người dùng</SelectItem>
                    <SelectItem value="admin">Quản trị viên</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="searchStatus" className="text-gray-700 font-medium">Trạng thái</Label>
                <Select value={searchStatus} onValueChange={setSearchStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="active">Hoạt động</SelectItem>
                    <SelectItem value="inactive">Bị khóa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label htmlFor="searchDateFrom" className="text-gray-700 font-medium">Từ ngày</Label>
                <Input
                  id="searchDateFrom"
                  type="date"
                  value={searchDateFrom}
                  onChange={(e) => setSearchDateFrom(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="searchDateTo" className="text-gray-700 font-medium">Đến ngày</Label>
                <Input
                  id="searchDateTo"
                  type="date"
                  value={searchDateTo}
                  onChange={(e) => setSearchDateTo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchName('');
                    setSearchDateFrom('');
                    setSearchDateTo('');
                    setSearchRole('all');
                    setSearchStatus('all');
                  }}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Xóa bộ lọc
                </Button>
                <Button
                  variant="outline"
                  onClick={refreshUserData}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Làm mới dữ liệu
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Tìm thấy {totalUsers} người dùng
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-600 flex items-center gap-1">
                    {socketConnected ? (
                      <>
                        <Wifi className="h-3 w-3 text-green-500" />
                        <span className="text-green-600">Real-time</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-3 w-3 text-red-500" />
                        <span className="text-red-600">Mất kết nối</span>
                      </>
                    )}
                  </div>
                  {lastUpdate && (
                    <div className="text-xs text-gray-500">
                      Cập nhật: {lastUpdate.toLocaleTimeString('vi-VN')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                <TableRow className="hover:bg-gray-50">
                  <TableHead className="font-semibold text-gray-700">Username</TableHead>
                  <TableHead className="font-semibold text-gray-700">Vai trò</TableHead>
                  <TableHead className="font-semibold text-gray-700">Số dư</TableHead>
                  <TableHead className="font-semibold text-gray-700">CCCD</TableHead>
                  <TableHead className="font-semibold text-gray-700">Ngân hàng</TableHead>
                  <TableHead className="font-semibold text-gray-700">Trạng thái</TableHead>
                  <TableHead className="font-semibold text-gray-700">Ngày tạo</TableHead>
                  <TableHead className="font-semibold text-gray-700">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentUsers.map((user: any) => (
                  <TableRow key={user._id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{user.username}</TableCell>
                    {/* Vai trò */}
                    <TableCell>
                      {user.role === 'admin' ? (
                        <span className="rounded-full px-2 py-1 text-[10px] font-semibold bg-purple-500 text-white whitespace-nowrap">Admin</span>
                      ) : (
                        <span className="rounded-full px-2 py-1 text-[10px] font-semibold bg-blue-500 text-white whitespace-nowrap">User</span>
                      )}
                    </TableCell>
                    {/* Số dư */}
                    <TableCell>
                      <div className="relative">
                        <div className="font-bold text-green-600 text-sm flex items-center gap-1">
                          {user.balance?.available?.toLocaleString() || 0}đ
                          {socketConnected && (
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          Tổng: {((user.balance?.available || 0) + (user.balance?.frozen || 0)).toLocaleString()}đ
                        </div>
                        <div className="text-[10px] text-gray-500">
                          Nạp: {user.totalDeposited?.toLocaleString() || 0}đ
                        </div>
                      </div>
                    </TableCell>
                    {/* CCCD */}
                    <TableCell>
                      {user.verification?.verified ? (
                        <span className="rounded-full px-2 py-1 text-[10px] font-semibold bg-green-500 text-white whitespace-nowrap">✓ Xác minh</span>
                      ) : (
                        <span className="rounded-full px-2 py-1 text-[10px] font-semibold bg-yellow-500 text-white whitespace-nowrap">⏳ Chờ</span>
                      )}
                    </TableCell>
                    {/* Ngân hàng */}
                    <TableCell>
                      {user.bank?.name ? (
                        <div className="bg-green-50 p-1 rounded border border-green-200">
                          <div className="font-medium text-green-800 text-xs">{user.bank.name}</div>
                          <div className="text-[10px] text-green-600 font-mono">{user.bank.accountNumber}</div>
                          <div className="text-[10px] text-green-500 truncate">{user.bank.accountHolder}</div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-1 rounded border border-gray-200">
                          <span className="text-gray-500 text-[10px]">Chưa cập nhật</span>
                        </div>
                      )}
                    </TableCell>
                    {/* Trạng thái tài khoản */}
                    <TableCell>
                      {user.status?.active ? (
                        <span className="rounded-full px-2 py-1 text-[10px] font-semibold bg-green-500 text-white whitespace-nowrap">✓ Hoạt động</span>
                      ) : (
                        <span className="rounded-full px-2 py-1 text-xs font-semibold bg-red-500 text-white whitespace-nowrap">🔒 Khóa</span>
                      )}
                    </TableCell>
                    {/* Ngày tạo */}
                    <TableCell>
                      <span className="text-xs text-gray-600">
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </TableCell>
                    {/* Hành động */}
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewUser(user)}
                          className="hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleResetPassword(user)}
                          className="hover:bg-yellow-50 hover:text-yellow-600"
                          title="Đổi mật khẩu"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteUser(user)}
                          disabled={user.role === 'admin'}
                          className="hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Hiển thị {((currentPage - 1) * usersPerPage) + 1}-{Math.min(currentPage * usersPerPage, totalUsers)} trong tổng số {totalUsers} người dùng
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToFirstPage}
                  disabled={!pagination.hasPrevPage}
                  className="flex items-center gap-1"
                >
                  <ChevronsLeft className="h-4 w-4" />
                  Đầu
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={!pagination.hasPrevPage}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => goToPage(page)}
                      className="w-8 h-8 p-0"
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={!pagination.hasNextPage}
                  className="flex items-center gap-1"
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToLastPage}
                  disabled={!pagination.hasNextPage}
                  className="flex items-center gap-1"
                >
                  Cuối
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Reset Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-yellow-600" />
              Đổi mật khẩu người dùng
            </DialogTitle>
            <DialogDescription>
              Đổi mật khẩu cho {userToResetPassword?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Nhập mật khẩu mới"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isResettingPassword}
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isResettingPassword}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPasswordModal(false)}
              disabled={isResettingPassword}
            >
              Hủy
            </Button>
            <Button
              onClick={confirmResetPassword}
              disabled={isResettingPassword || !newPassword || !confirmPassword}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {isResettingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đổi mật khẩu...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Đổi mật khẩu
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Xác nhận xóa người dùng
            </DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa người dùng <strong>{userToDelete?.username}</strong>? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Hủy
            </Button>
            <Button
              onClick={confirmDeleteUser}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Xóa người dùng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User View/Edit Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {editingUser ? `Thông tin người dùng: ${editingUser.username}` : 'Xem thông tin người dùng'}
            </DialogTitle>
            <DialogDescription>
              Xem và chỉnh sửa thông tin chi tiết của người dùng
            </DialogDescription>
          </DialogHeader>
          
          {editingUser && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="username">Tên đăng nhập</Label>
                  <Input
                    id="username"
                    value={editingUser.username || ''}
                    onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                    placeholder="Tên đăng nhập"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                    placeholder="Email"
                  />
                </div>
              </div>

              {/* Role and Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="role">Vai trò</Label>
                  <Select
                    value={editingUser.role || 'user'}
                    onValueChange={(value) => setEditingUser({...editingUser, role: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn vai trò" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Người dùng</SelectItem>
                      <SelectItem value="admin">Quản trị viên</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">Trạng thái tài khoản</Label>
                  <Select
                    value={editingUser.status?.active ? 'active' : 'inactive'}
                    onValueChange={(value) => setEditingUser({
                      ...editingUser, 
                      status: {...editingUser.status, active: value === 'active'}
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Hoạt động</SelectItem>
                      <SelectItem value="inactive">Bị khóa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Balance Information */}
              <div>
                <Label htmlFor="availableBalance">Số dư khả dụng (VNĐ)</Label>
                <Input
                  id="availableBalance"
                  type="text"
                  value={editingUser.balance?.available || 0}
                  onChange={(e) => {
                    // Lấy giá trị từ input và loại bỏ tất cả ký tự không phải số
                    const rawValue = e.target.value.replace(/[^0-9]/g, '');
                    
                    // Chuyển đổi thành số
                    const numberValue = rawValue ? parseInt(rawValue, 10) : 0;
                    
                    // Cập nhật state với giá trị số
                    setEditingUser({
                      ...editingUser, 
                      balance: {...editingUser.balance, available: numberValue}
                    });
                  }}
                  onKeyPress={(e) => {
                    // Chỉ cho phép số và các phím điều hướng
                    const allowedKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (!allowedKeys.includes(e.key) && !/^[0-9]$/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  placeholder="0"
                  className="font-mono"
                />
              </div>

              {/* Bank Information */}
              <div>
                <Label className="text-lg font-semibold">Thông tin ngân hàng</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <div>
                    <Label htmlFor="bankName">Tên ngân hàng</Label>
                    <Input
                      id="bankName"
                      value={editingUser.bank?.name || ''}
                      onChange={(e) => setEditingUser({
                        ...editingUser, 
                        bank: {...editingUser.bank, name: e.target.value}
                      })}
                      placeholder="Tên ngân hàng"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountNumber">Số tài khoản</Label>
                    <Input
                      id="accountNumber"
                      value={editingUser.bank?.accountNumber || ''}
                      onChange={(e) => setEditingUser({
                        ...editingUser, 
                        bank: {...editingUser.bank, accountNumber: e.target.value}
                      })}
                      placeholder="Số tài khoản"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountHolder">Chủ tài khoản</Label>
                    <Input
                      id="accountHolder"
                      value={editingUser.bank?.accountHolder || ''}
                      onChange={(e) => setEditingUser({
                        ...editingUser, 
                        bank: {...editingUser.bank, accountHolder: e.target.value}
                      })}
                      placeholder="Tên chủ tài khoản"
                    />
                  </div>
                </div>
              </div>

              {/* CCCD Images */}
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800">Hình ảnh CCCD/CMND</h3>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* CCCD Front */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <Label className="text-sm font-medium text-gray-700">Mặt trước CCCD</Label>
                    </div>
                    <div className="relative group">
                      {editingUser.verification?.cccdFront ? (
                        <div className="relative overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl">
                          <img
                            src={editingUser.verification.cccdFront}
                            alt="CCCD Mặt trước"
                            className="w-full h-56 object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={(e) => {
                              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDIwMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjNGNEY2Ii8+Cjx0ZXh0IHg9IjEwMCIgeT0iNjAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5QTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD4KPC9zdmc+';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => window.open(editingUser.verification.cccdFront, '_blank')}
                                className="bg-white/90 backdrop-blur-sm text-gray-800 hover:bg-white transition-all duration-200 shadow-lg"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Xem
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm('Bạn có chắc muốn xóa hình mặt trước CCCD?')) {
                                    setEditingUser({
                                      ...editingUser,
                                      verification: {
                                        ...editingUser.verification,
                                        cccdFront: ''
                                      }
                                    });
                                  }
                                }}
                                className="bg-red-500/90 backdrop-blur-sm hover:bg-red-600 transition-all duration-200 shadow-lg"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Xóa
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-56 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 transition-all duration-300 hover:border-blue-300 hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100">
                          <div className="text-center text-gray-500">
                            <div className="p-3 bg-gray-200 rounded-full w-fit mx-auto mb-3">
                              <CreditCard className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium">Chưa có hình mặt trước</p>
                            <p className="text-xs text-gray-400 mt-1">Tải lên để xem</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CCCD Back */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <Label className="text-sm font-medium text-gray-700">Mặt sau CCCD</Label>
                    </div>
                    <div className="relative group">
                      {editingUser.verification?.cccdBack ? (
                        <div className="relative overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl">
                          <img
                            src={editingUser.verification.cccdBack}
                            alt="CCCD Mặt sau"
                            className="w-full h-56 object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={(e) => {
                              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDIwMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjNGNEY2Ii8+Cjx0ZXh0IHg9IjEwMCIgeT0iNjAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5QTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD4KPC9zdmc+';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => window.open(editingUser.verification.cccdBack, '_blank')}
                                className="bg-white/90 backdrop-blur-sm text-gray-800 hover:bg-white transition-all duration-200 shadow-lg"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Xem
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm('Bạn có chắc muốn xóa hình mặt sau CCCD?')) {
                                    setEditingUser({
                                      ...editingUser,
                                      verification: {
                                        ...editingUser.verification,
                                        cccdBack: ''
                                      }
                                    });
                                  }
                                }}
                                className="bg-red-500/90 backdrop-blur-sm hover:bg-red-600 transition-all duration-200 shadow-lg"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Xóa
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-56 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 transition-all duration-300 hover:border-green-300 hover:bg-gradient-to-br hover:from-green-50 hover:to-green-100">
                          <div className="text-center text-gray-500">
                            <div className="p-3 bg-gray-200 rounded-full w-fit mx-auto mb-3">
                              <CreditCard className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium">Chưa có hình mặt sau</p>
                            <p className="text-xs text-gray-400 mt-1">Tải lên để xem</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Upload New CCCD Images */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Upload className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="text-lg font-medium text-gray-800">Tải lên hình CCCD mới</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label htmlFor="cccdFrontUpload" className="text-sm font-medium text-gray-700">
                        Tải lên mặt trước CCCD
                      </Label>
                      <div className="relative">
                        <Input
                          id="cccdFrontUpload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileChange(e, 'front')}
                        />
                        <label
                          htmlFor="cccdFrontUpload"
                          className="flex items-center justify-center gap-2 w-full h-12 px-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50 hover:bg-blue-100 transition-all duration-200 cursor-pointer group"
                        >
                          {uploadingFront ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                              <span className="text-sm font-medium text-blue-600">Đang tải lên...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 text-blue-600 group-hover:text-blue-700" />
                              <span className="text-sm font-medium text-blue-600 group-hover:text-blue-700">
                                Chọn file mặt trước
                              </span>
                            </>
                          )}
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Label htmlFor="cccdBackUpload" className="text-sm font-medium text-gray-700">
                        Tải lên mặt sau CCCD
                      </Label>
                      <div className="relative">
                        <Input
                          id="cccdBackUpload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileChange(e, 'back')}
                        />
                        <label
                          htmlFor="cccdBackUpload"
                          className="flex items-center justify-center gap-2 w-full h-12 px-4 border-dashed border-green-300 rounded-lg bg-green-50 hover:bg-green-100 transition-all duration-200 cursor-pointer group"
                        >
                          {uploadingBack ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                              <span className="text-sm font-medium text-green-600">Đang tải lên...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 text-green-600 group-hover:text-green-700" />
                              <span className="text-sm font-medium text-green-600 group-hover:text-green-700">
                                Chọn file mặt sau
                              </span>
                            </>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Verification Status */}
                <div className="mt-4">
                  <Label className="text-sm font-medium text-gray-700">Trạng thái xác minh</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="verified"
                        checked={editingUser.verification?.verified || false}
                        onChange={(e) => setEditingUser({
                          ...editingUser, 
                          verification: {...editingUser.verification, verified: e.target.checked}
                        })}
                      />
                      <Label htmlFor="verified">Đã xác minh CCCD</Label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes">Ghi chú</Label>
                <Textarea
                  id="notes"
                  value={editingUser.notes || ''}
                  onChange={(e) => setEditingUser({...editingUser, notes: e.target.value})}
                  placeholder="Ghi chú về người dùng"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUserModal(false);
                setEditingUser(null);
              }}
            >
              Hủy
            </Button>
            <Button
              onClick={handleEditUser}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Eye className="mr-2 h-4 w-4" />
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
