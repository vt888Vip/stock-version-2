'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  History
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function OrdersManagement() {
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search states
  const [searchOrderUsername, setSearchOrderUsername] = useState('');
  const [searchOrderSessionId, setSearchOrderSessionId] = useState('');
  const [searchOrderDate, setSearchOrderDate] = useState('');
  
  // Pagination states
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);

  useEffect(() => {
    loadOrders();
  }, [ordersPage, searchOrderUsername, searchOrderSessionId, searchOrderDate]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: ordersPage.toString(),
        limit: '20'
      });
      
      if (searchOrderUsername) params.append('username', searchOrderUsername);
      if (searchOrderSessionId) params.append('sessionId', searchOrderSessionId);
      if (searchOrderDate) params.append('date', searchOrderDate);

      const response = await fetch(`/api/admin/orders?${params}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setOrders(data.data.orders || []);
          setOrdersTotal(data.data.pagination?.total || 0);
          setOrdersTotalPages(data.data.pagination?.totalPages || 1);
        } else {
          console.error('API response error:', data);
          toast({
            title: 'Lỗi',
            description: data.message || 'Không thể tải dữ liệu',
            variant: 'destructive',
          });
        }
      } else {
        const errorData = await response.json();
        console.error('API error:', errorData);
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
      setLoading(false);
    }
  };

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
              <CardTitle className="text-xl font-bold text-gray-900">Lịch sử lệnh đặt</CardTitle>
              <p className="text-sm text-gray-600 mt-1">Theo dõi toàn bộ lệnh đặt của người dùng</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-4 space-y-4">
            {/* Search filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-gray-700 font-medium text-sm">Tên tài khoản:
                  <input
                    type="text"
                    placeholder="Nhập tên tài khoản..."
                    value={searchOrderUsername}
                    onChange={e => setSearchOrderUsername(e.target.value)}
                    className="ml-2 w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              </div>
              <div>
                <label className="text-gray-700 font-medium text-sm">Phiên giao dịch:
                  <input
                    type="text"
                    placeholder="Nhập mã phiên..."
                    value={searchOrderSessionId}
                    onChange={e => setSearchOrderSessionId(e.target.value)}
                    className="ml-2 w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              </div>
              <div>
                <label className="text-gray-700 font-medium text-sm">Ngày đặt lệnh:
                  <input
                    type="date"
                    value={searchOrderDate}
                    onChange={e => setSearchOrderDate(e.target.value)}
                    className="ml-2 w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearchOrderUsername('');
                    setSearchOrderSessionId('');
                    setSearchOrderDate('');
                    setOrdersPage(1);
                  }}
                  className="px-4 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 transition-colors"
                >
                  Xóa bộ lọc
                </button>
              </div>
            </div>
            
            {/* Results info */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Tìm thấy {ordersTotal} lệnh đặt
              </div>
              <div className="text-sm text-gray-600">
                Trang {ordersPage} / {ordersTotalPages}
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                <TableRow className="hover:bg-gray-50">
                  <TableHead className="font-semibold text-gray-700">Username</TableHead>
                  <TableHead className="font-semibold text-gray-700">Phiên</TableHead>
                  <TableHead className="font-semibold text-gray-700">Loại lệnh</TableHead>
                  <TableHead className="font-semibold text-gray-700">Số tiền</TableHead>
                  <TableHead className="font-semibold text-gray-700">Lợi nhuận</TableHead>
                  <TableHead className="font-semibold text-gray-700">Trạng thái</TableHead>
                  <TableHead className="font-semibold text-gray-700">Thời gian đặt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: any, idx: number) => (
                  <TableRow key={order._id || idx} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{order.username}</TableCell>
                    <TableCell className="font-mono text-sm">{order.sessionId}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.direction === 'UP' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {order.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-blue-700">{order.amount.toLocaleString()}đ</span>
                    </TableCell>
                    <TableCell>
                      {order.profit > 0 ? (
                        <span className="font-bold text-green-600">+{order.profit.toLocaleString()}đ</span>
                      ) : order.profit < 0 ? (
                        <span className="font-bold text-red-600">{order.profit.toLocaleString()}đ</span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.status === 'completed' && order.result === 'win' && (
                        <span className="rounded-full px-3 py-1 text-xs font-semibold bg-green-500 text-white">Thắng</span>
                      )}
                      {order.status === 'completed' && order.result === 'lose' && (
                        <span className="rounded-full px-3 py-1 text-xs font-semibold bg-red-500 text-white">Thua</span>
                      )}
                      {order.status === 'pending' && (
                        <span className="rounded-full px-3 py-1 text-xs font-semibold bg-yellow-500 text-white">Đang xử lý</span>
                      )}
                      {order.status === 'completed' && !order.result && (
                        <span className="rounded-full px-3 py-1 text-xs font-semibold bg-gray-500 text-white">Hoàn thành</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(order.createdAt).toLocaleString('vi-VN')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          {ordersTotalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOrdersPage(Math.max(1, ordersPage - 1))}
                  disabled={ordersPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Trước
                </button>
                
                {Array.from({ length: Math.min(5, ordersTotalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(ordersTotalPages - 4, ordersPage - 2)) + i;
                  if (pageNum > ordersTotalPages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setOrdersPage(pageNum)}
                      className={`px-3 py-1 border rounded text-sm ${
                        pageNum === ordersPage
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setOrdersPage(Math.min(ordersTotalPages, ordersPage + 1))}
                  disabled={ordersPage === ordersTotalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
