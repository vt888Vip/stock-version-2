'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  History,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  User,
  Target
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function OrdersManagement() {
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search states
  const [searchUsername, setSearchUsername] = useState('');
  const [searchSessionId, setSearchSessionId] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchStatus, setSearchStatus] = useState('all');
  const [searchDirection, setSearchDirection] = useState('all');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(20);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalOrders: 0,
    ordersPerPage: 20,
    hasNextPage: false,
    hasPrevPage: false
  });

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async (page = currentPage, isSearch = false) => {
    try {
      if (isSearch) {
        setSearchLoading(true);
      } else {
        setLoading(true);
      }
      
      // Xây dựng query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        limit: ordersPerPage.toString(),
        ...(searchUsername && { username: searchUsername }),
        ...(searchSessionId && { sessionId: searchSessionId }),
        ...(searchDateFrom && { dateFrom: searchDateFrom }),
        ...(searchDateTo && { dateTo: searchDateTo }),
        ...(searchStatus && searchStatus !== 'all' && { status: searchStatus }),
        ...(searchDirection && searchDirection !== 'all' && { direction: searchDirection }),
        ...(amountMin && { amountMin: amountMin }),
        ...(amountMax && { amountMax: amountMax })
      });

      const response = await fetch(`/api/admin/orders?${params}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setOrders(data.orders || []);
          setPagination(data.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalOrders: 0,
            ordersPerPage: 20,
            hasNextPage: false,
            hasPrevPage: false
          });
        } else {
          toast({
            title: 'Lỗi',
            description: data.message || 'Không thể tải dữ liệu',
            variant: 'destructive',
          });
        }
      } else {
        const errorData = await response.json();
        toast({
          title: 'Lỗi',
          description: errorData.message || 'Không thể tải dữ liệu',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách lệnh đặt',
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

  // Function to manually refresh data
  const refreshData = async () => {
    await loadOrders(currentPage);
    toast({
      title: 'Thành công',
      description: 'Đã làm mới dữ liệu lệnh đặt',
    });
  };

  // Pagination logic
  const currentOrders = orders;
  const totalPages = pagination.totalPages;
  const totalOrders = pagination.totalOrders;

  // Pagination functions
  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    loadOrders(pageNumber);
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
      loadOrders(1, true);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchUsername, searchSessionId, searchDateFrom, searchDateTo, searchStatus, searchDirection, amountMin, amountMax]);

  // Immediate search for non-text inputs
  useEffect(() => {
    setCurrentPage(1);
    loadOrders(1, true);
  }, [searchStatus, searchDirection, searchDateFrom, searchDateTo, amountMin, amountMax]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-blue-700">Đang tải danh sách lệnh đặt...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <History className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-gray-900">Quản lý lệnh đặt</CardTitle>
              <p className="text-sm text-gray-600 mt-1">Theo dõi và quản lý toàn bộ lệnh đặt của người dùng</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Search Filters */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-4">
              <Search className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-800">Tìm kiếm lệnh đặt</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="searchUsername" className="text-gray-700 font-medium">Tên người dùng</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="searchUsername"
                    placeholder="Nhập tên người dùng..."
                    value={searchUsername}
                    onChange={(e) => setSearchUsername(e.target.value)}
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
                <Label htmlFor="searchSessionId" className="text-gray-700 font-medium">Mã phiên giao dịch</Label>
                <Input
                  id="searchSessionId"
                  placeholder="Nhập mã phiên..."
                  value={searchSessionId}
                  onChange={(e) => setSearchSessionId(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="searchStatus" className="text-gray-700 font-medium">Trạng thái</Label>
                <Select value={searchStatus} onValueChange={setSearchStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="pending">Đang xử lý</SelectItem>
                    <SelectItem value="completed">Hoàn thành</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              <div>
                <Label htmlFor="searchDirection" className="text-gray-700 font-medium">Hướng lệnh</Label>
                <Select value={searchDirection} onValueChange={setSearchDirection}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Tất cả hướng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả hướng</SelectItem>
                    <SelectItem value="UP">LÊN</SelectItem>
                    <SelectItem value="DOWN">XUỐNG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="amountMin" className="text-gray-700 font-medium">Số tiền tối thiểu (VNĐ)</Label>
                <Input
                  id="amountMin"
                  type="number"
                  placeholder="0"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="amountMax" className="text-gray-700 font-medium">Số tiền tối đa (VNĐ)</Label>
                <Input
                  id="amountMax"
                  type="number"
                  placeholder="Không giới hạn"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="mt-1"
                />
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
                    setSearchUsername('');
                    setSearchSessionId('');
                    setSearchDateFrom('');
                    setSearchDateTo('');
                    setSearchStatus('all');
                    setSearchDirection('all');
                    setAmountMin('');
                    setAmountMax('');
                  }}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Xóa bộ lọc
                </Button>
                <Button
                  variant="outline"
                  onClick={refreshData}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Làm mới dữ liệu
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Tìm thấy {totalOrders} lệnh đặt
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                <TableRow className="hover:bg-gray-50">
                  <TableHead className="font-semibold text-gray-700">Người dùng</TableHead>
                  <TableHead className="font-semibold text-gray-700">Phiên giao dịch</TableHead>
                  <TableHead className="font-semibold text-gray-700">Loại lệnh</TableHead>
                  <TableHead className="font-semibold text-gray-700">Số tiền</TableHead>
                  <TableHead className="font-semibold text-gray-700">Lợi nhuận</TableHead>
                  <TableHead className="font-semibold text-gray-700">Trạng thái</TableHead>
                  <TableHead className="font-semibold text-gray-700">Thời gian đặt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentOrders.map((order: any, idx: number) => (
                  <TableRow key={order._id || idx} className="hover:bg-gray-50">
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.username}</div>
                        <div className="text-xs text-gray-500">{order.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                        {order.sessionId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {order.direction === 'UP' ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.direction === 'UP' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {order.type}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-blue-600" />
                        <span className="font-bold text-blue-700">{order.amount.toLocaleString()}đ</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {order.profit > 0 ? (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="font-bold text-green-600">+{order.profit.toLocaleString()}đ</span>
                        </div>
                      ) : order.profit < 0 ? (
                        <div className="flex items-center gap-1">
                          <TrendingDown className="h-4 w-4 text-red-600" />
                          <span className="font-bold text-red-600">{order.profit.toLocaleString()}đ</span>
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.status === 'completed' && order.result === 'win' && (
                        <Badge className="bg-green-500 text-white">Thắng</Badge>
                      )}
                      {order.status === 'completed' && order.result === 'lose' && (
                        <Badge className="bg-red-500 text-white">Thua</Badge>
                      )}
                      {order.status === 'pending' && (
                        <Badge className="bg-yellow-500 text-white">Đang xử lý</Badge>
                      )}
                      {order.status === 'completed' && !order.result && (
                        <Badge className="bg-gray-500 text-white">Hoàn thành</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(order.createdAt).toLocaleTimeString('vi-VN')}
                        </div>
                        {order.completedAt && (
                          <div className="text-xs text-green-600 mt-1">
                            Hoàn thành: {new Date(order.completedAt).toLocaleString('vi-VN')}
                          </div>
                        )}
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
                Hiển thị {((currentPage - 1) * ordersPerPage) + 1}-{Math.min(currentPage * ordersPerPage, totalOrders)} trong tổng số {totalOrders} lệnh đặt
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
    </div>
  );
}
