'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  History, 
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function TransactionsManagement() {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage] = useState(50);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/transactions', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải lịch sử giao dịch',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProcessTransaction = async (transactionId: string, action: 'approve' | 'reject') => {
    try {
      const response = await fetch('/api/admin/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ transactionId, action })
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: action === 'approve' ? 'Đã duyệt giao dịch' : 'Đã từ chối giao dịch',
        });
        loadTransactions(); // Reload data
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể xử lý giao dịch',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xử lý giao dịch',
        variant: 'destructive',
      });
    }
  };

  const handleProcessWithdrawal = async (withdrawalId: string, action: 'approve' | 'reject') => {
    try {
      const response = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ withdrawalId, action })
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: action === 'approve' ? 'Đã duyệt rút tiền' : 'Đã từ chối rút tiền',
        });
        loadTransactions(); // Reload data
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể xử lý rút tiền',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xử lý rút tiền',
        variant: 'destructive',
      });
    }
  };

  // Pagination logic
  const indexOfLastTransaction = currentPage * transactionsPerPage;
  const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
  const currentTransactions = transactions.slice(indexOfFirstTransaction, indexOfLastTransaction);
  const totalPages = Math.ceil(transactions.length / transactionsPerPage);

  // Pagination functions
  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const goToFirstPage = () => {
    setCurrentPage(1);
  };

  const goToLastPage = () => {
    setCurrentPage(totalPages);
  };

  const goToPreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-blue-700">Đang tải lịch sử giao dịch...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Lịch sử giao dịch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Người dùng</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentTransactions.map((transaction: any) => (
                <TableRow key={transaction._id}>
                  <TableCell className="font-medium">{transaction.username}</TableCell>
                  <TableCell>
                    <Badge variant={transaction.type === 'deposit' ? 'default' : 'secondary'}>
                      {transaction.type === 'deposit' ? 'Nạp tiền' : 'Rút tiền'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'}>
                      {transaction.amount.toLocaleString()}đ
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      transaction.type === 'deposit'
                        ? (transaction.status === 'completed' ? 'default' : 'destructive')
                        : transaction.status === 'Đã duyệt' ? 'default' : transaction.status === 'Từ chối' ? 'destructive' : 'secondary'
                    }>
                      {transaction.type === 'deposit'
                        ? (transaction.status === 'completed' ? 'Hoàn thành' : transaction.status === 'rejected' ? 'Từ chối' : 'Đang xử lý')
                        : transaction.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{transaction.note || 'N/A'}</TableCell>
                  <TableCell>
                    {new Date(transaction.createdAt).toLocaleString('vi-VN')}
                  </TableCell>
                  <TableCell>
                    {(transaction.status === 'pending' || transaction.status === 'processing' || transaction.status === 'Đang xử lý' || transaction.status === 'Chờ duyệt') && (
                      <div className="flex gap-2">
                        <button
                          className="rounded-full px-3 py-1 text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition"
                          onClick={async () => {
                            if (transaction.type === 'withdrawal') {
                              const withdrawalId = transaction.withdrawalId || (typeof transaction._id === 'string' ? transaction._id : transaction._id?.toString?.() || '');
                              console.log('Duyệt rút tiền:', { withdrawalId, _id: transaction._id, raw: transaction });
                              if (!withdrawalId || !withdrawalId.startsWith('RUT-')) {
                                alert('Không tìm thấy withdrawalId hợp lệ để duyệt!');
                                return;
                              }
                              await handleProcessWithdrawal(withdrawalId, 'approve');
                            } else {
                              await handleProcessTransaction(transaction._id, 'approve');
                            }
                          }}
                        >
                          Duyệt
                        </button>
                        <button
                          className="rounded-full px-3 py-1 text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition"
                          onClick={async () => {
                            if (transaction.type === 'withdrawal') {
                              const withdrawalId = transaction.withdrawalId || (typeof transaction._id === 'string' ? transaction._id : transaction._id?.toString?.() || '');
                              console.log('Từ chối rút tiền:', { withdrawalId, _id: transaction._id, raw: transaction });
                              if (!withdrawalId || !withdrawalId.startsWith('RUT-')) {
                                alert('Không tìm thấy withdrawalId hợp lệ để từ chối!');
                                return;
                              }
                              await handleProcessWithdrawal(withdrawalId, 'reject');
                            } else {
                              await handleProcessTransaction(transaction._id, 'reject');
                            }
                          }}
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Hiển thị {indexOfFirstTransaction + 1}-{Math.min(indexOfLastTransaction, transactions.length)} trong tổng số {transactions.length} giao dịch
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToFirstPage}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1"
                >
                  <ChevronsLeft className="h-4 w-4" />
                  Đầu
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNumber}
                        variant={currentPage === pageNumber ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToPage(pageNumber)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNumber}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1"
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToLastPage}
                  disabled={currentPage === totalPages}
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
