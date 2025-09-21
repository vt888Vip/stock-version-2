'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  CreditCard, 
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
  Loader2,
  DollarSign,
  Calendar,
  User,
  Banknote
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function WithdrawalsManagement() {
  const { toast } = useToast();
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search states
  const [searchName, setSearchName] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchStatus, setSearchStatus] = useState('all');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [withdrawalsPerPage] = useState(20);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalWithdrawals: 0,
    withdrawalsPerPage: 20,
    hasNextPage: false,
    hasPrevPage: false
  });

  // Action states
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [actionNotes, setActionNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadWithdrawals();
  }, []);

  const loadWithdrawals = async (page = currentPage, isSearch = false) => {
    try {
      if (isSearch) {
        setSearchLoading(true);
      } else {
        setLoading(true);
      }
      
      // Xây dựng query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        limit: withdrawalsPerPage.toString(),
        ...(searchName && { search: searchName }),
        ...(searchStatus && searchStatus !== 'all' && { status: searchStatus }),
        ...(searchDateFrom && { dateFrom: searchDateFrom }),
        ...(searchDateTo && { dateTo: searchDateTo }),
        ...(amountMin && { amountMin: amountMin }),
        ...(amountMax && { amountMax: amountMax })
      });

      const response = await fetch(`/api/admin/withdrawals?${params}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWithdrawals(data.withdrawals || []);
        setPagination(data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalWithdrawals: 0,
          withdrawalsPerPage: 20,
          hasNextPage: false,
          hasPrevPage: false
        });
      } else {
        const errorData = await response.json();
        toast({
          title: 'Lỗi',
          description: errorData.message || 'Không thể tải danh sách rút tiền',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading withdrawals:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách rút tiền',
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
    await loadWithdrawals(currentPage);
    toast({
      title: 'Thành công',
      description: 'Đã làm mới dữ liệu rút tiền',
    });
  };

  // Handle withdrawal action
  const handleWithdrawalAction = async () => {
    if (!selectedWithdrawal) return;

    setProcessing(true);
    try {
      const response = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          withdrawalId: selectedWithdrawal.withdrawalId,
          action: actionType,
          notes: actionNotes
        })
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: actionType === 'approve' ? 'Đã duyệt yêu cầu rút tiền' : 'Đã từ chối yêu cầu rút tiền',
        });
        setShowActionModal(false);
        setSelectedWithdrawal(null);
        setActionNotes('');
        loadWithdrawals(currentPage);
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể xử lý yêu cầu rút tiền',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xử lý yêu cầu rút tiền',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  // Open action modal
  const openActionModal = (withdrawal: any, action: 'approve' | 'reject') => {
    setSelectedWithdrawal(withdrawal);
    setActionType(action);
    setActionNotes('');
    setShowActionModal(true);
  };

  // Pagination logic
  const currentWithdrawals = withdrawals;
  const totalPages = pagination.totalPages;
  const totalWithdrawals = pagination.totalWithdrawals;

  // Pagination functions
  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    loadWithdrawals(pageNumber);
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
      loadWithdrawals(1, true);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchName, searchDateFrom, searchDateTo, searchStatus, amountMin, amountMax]);

  // Immediate search for non-text inputs
  useEffect(() => {
    setCurrentPage(1);
    loadWithdrawals(1, true);
  }, [searchStatus, searchDateFrom, searchDateTo, amountMin, amountMax]);

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Đã duyệt':
        return <Badge className="bg-green-500 text-white">Đã duyệt</Badge>;
      case 'Từ chối':
        return <Badge className="bg-red-500 text-white">Từ chối</Badge>;
      case 'Chờ duyệt':
        return <Badge className="bg-yellow-500 text-white">Chờ duyệt</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-blue-700">Đang tải danh sách rút tiền...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded-lg">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-gray-900">Quản lý rút tiền</CardTitle>
              <p className="text-sm text-gray-600 mt-1">Duyệt và quản lý các yêu cầu rút tiền từ người dùng</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Search Filters */}
          <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 mb-4">
              <Search className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-800">Tìm kiếm yêu cầu rút tiền</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="searchName" className="text-gray-700 font-medium">Tìm kiếm theo tên</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="searchName"
                    placeholder="Nhập tên người dùng..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="pl-10"
                    disabled={searchLoading}
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="searchStatus" className="text-gray-700 font-medium">Trạng thái</Label>
                <Select value={searchStatus} onValueChange={setSearchStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="Chờ duyệt">Chờ duyệt</SelectItem>
                    <SelectItem value="Đã duyệt">Đã duyệt</SelectItem>
                    <SelectItem value="Từ chối">Từ chối</SelectItem>
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
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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
                    setSearchStatus('all');
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
                  <CreditCard className="h-4 w-4" />
                  Tìm thấy {totalWithdrawals} yêu cầu rút tiền
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                <TableRow className="hover:bg-gray-50 h-10">
                  <TableHead className="font-semibold text-gray-700 text-sm py-2">Người dùng</TableHead>
                  <TableHead className="font-semibold text-gray-700 text-sm py-2">Số tiền</TableHead>
                  <TableHead className="font-semibold text-gray-700 text-sm py-2">Ngân hàng</TableHead>
                  <TableHead className="font-semibold text-gray-700 text-sm py-2">Trạng thái</TableHead>
                  <TableHead className="font-semibold text-gray-700 text-sm py-2">Ghi chú</TableHead>
                  <TableHead className="font-semibold text-gray-700 text-sm py-2">Thời gian</TableHead>
                  <TableHead className="font-semibold text-gray-700 text-sm py-2">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentWithdrawals.map((withdrawal: any) => (
                  <TableRow key={withdrawal._id} className="hover:bg-gray-50 h-12">
                    <TableCell className="py-2">
                      <div>
                        <div className="font-medium text-sm">{withdrawal.username}</div>
                       
                        <div className="text-xs text-green-600">
                          Số dư: {withdrawal.userBalance?.toLocaleString() || 0}đ
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="font-bold text-red-600 text-sm">
                        {withdrawal.amount?.toLocaleString()}đ
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      {withdrawal.bank?.name ? (
                        <div className="bg-blue-50 p-1 rounded border border-blue-200">
                          <div className="font-medium text-blue-800 text-xs">{withdrawal.bank.name}</div>
                          <div className="text-xs text-blue-600 font-mono">{withdrawal.bank.accountNumber}</div>
                          <div className="text-xs text-blue-500">{withdrawal.bank.accountHolder}</div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-1 rounded border border-gray-200">
                          <span className="text-gray-500 text-xs">Chưa cập nhật</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      {getStatusBadge(withdrawal.status)}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="max-w-xs">
                        <div className="text-xs text-gray-700 truncate">
                          {withdrawal.notes || 'Không có ghi chú'}
                        </div>
                        {withdrawal.processedBy && (
                          <div className="text-xs text-gray-500 mt-1">
                            Xử lý bởi: {withdrawal.processedBy}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-xs">
                        <div>{new Date(withdrawal.createdAt).toLocaleDateString('vi-VN')}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(withdrawal.createdAt).toLocaleTimeString('vi-VN')}
                        </div>
                        {withdrawal.processedAt && (
                          <div className="text-xs text-green-600 mt-1">
                            Xử lý: {new Date(withdrawal.processedAt).toLocaleString('vi-VN')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      {withdrawal.status === 'Chờ duyệt' && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => openActionModal(withdrawal, 'approve')}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 h-6"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openActionModal(withdrawal, 'reject')}
                            className="text-xs px-2 py-1 h-6"
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Từ chối
                          </Button>
                        </div>
                      )}
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
                Hiển thị {((currentPage - 1) * withdrawalsPerPage) + 1}-{Math.min(currentPage * withdrawalsPerPage, totalWithdrawals)} trong tổng số {totalWithdrawals} yêu cầu rút tiền
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

      {/* Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'approve' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {actionType === 'approve' ? 'Duyệt yêu cầu rút tiền' : 'Từ chối yêu cầu rút tiền'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve' 
                ? `Duyệt yêu cầu rút tiền ${selectedWithdrawal?.amount?.toLocaleString()}đ của ${selectedWithdrawal?.username}`
                : `Từ chối yêu cầu rút tiền ${selectedWithdrawal?.amount?.toLocaleString()}đ của ${selectedWithdrawal?.username}`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="actionNotes">Ghi chú (tùy chọn)</Label>
              <Textarea
                id="actionNotes"
                placeholder="Nhập ghi chú về quyết định này..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
                disabled={processing}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowActionModal(false)}
              disabled={processing}
            >
              Hủy
            </Button>
            <Button
              onClick={handleWithdrawalAction}
              disabled={processing}
              className={actionType === 'approve' 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-red-600 hover:bg-red-700'
              }
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  {actionType === 'approve' ? (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  {actionType === 'approve' ? 'Duyệt' : 'Từ chối'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
