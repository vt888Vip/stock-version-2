'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminStatsSkeleton, AdminTableSkeleton } from '@/components/ui/skeleton';
import { useAdminData } from '@/contexts/AdminDataContext';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Activity,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function OptimizedDashboard() {
  const { toast } = useToast();
  const { 
    stats, 
    statsLoading, 
    users, 
    usersLoading, 
    refreshStats, 
    refreshUsers, 
    refreshAll 
  } = useAdminData();

  const handleRefresh = async () => {
    await refreshAll();
    toast({
      title: 'Thành công',
      description: 'Đã làm mới dữ liệu dashboard',
    });
  };

  // Show skeleton while loading
  if (statsLoading && !stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={statsLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
        <AdminStatsSkeleton />
        <AdminTableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={statsLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Tổng người dùng</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              {stats?.totalUsers?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-blue-600 mt-1">
              +{stats?.activeUsers || 0} đang hoạt động
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Tổng nạp tiền</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">
              {stats?.totalDeposits?.toLocaleString() || 0}đ
            </div>
            <p className="text-xs text-green-600 mt-1">
              Tổng số tiền nạp
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Tổng rút tiền</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-900">
              {stats?.totalWithdrawals?.toLocaleString() || 0}đ
            </div>
            <p className="text-xs text-red-600 mt-1">
              Tổng số tiền rút
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-700">Tổng giao dịch</CardTitle>
            <Activity className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">
              {stats?.totalTrades?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-purple-600 mt-1">
              Tổng số lệnh đặt
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Users */}
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-600 rounded-lg">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-gray-900">Người dùng gần đây</CardTitle>
              <p className="text-sm text-gray-600 mt-1">Danh sách người dùng mới nhất</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {usersLoading ? (
            <AdminTableSkeleton rows={5} />
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <TableRow className="hover:bg-gray-50">
                    <TableHead className="font-semibold text-gray-700">Tên người dùng</TableHead>
                    <TableHead className="font-semibold text-gray-700">Email</TableHead>
                    <TableHead className="font-semibold text-gray-700">Vai trò</TableHead>
                    <TableHead className="font-semibold text-gray-700">Trạng thái</TableHead>
                    <TableHead className="font-semibold text-gray-700">Ngày tạo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.slice(0, 10).map((user: any) => (
                    <TableRow key={user._id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status?.active ? 'default' : 'destructive'}>
                          {user.status?.active ? 'Hoạt động' : 'Không hoạt động'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
