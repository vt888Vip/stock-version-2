'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/useAuth';
import { formatCurrency } from '@/lib/utils';

interface Transaction {
  _id: string;
  type: 'deposit' | 'withdrawal' | 'trade';
  amount: number;
  profit?: number;
  status: string;
  result?: 'win' | 'lose' | null;
  direction?: string;
  asset?: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  proofImage?: string;
  bankInfo?: any;
  adminNote?: string;
}

export default function TransactionHistoryPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [expandedWithdrawals, setExpandedWithdrawals] = useState<Set<string>>(new Set());

  // Helper function to get token
  const getToken = () => {
    return localStorage.getItem('token') || localStorage.getItem('authToken');
  };

  const fetchTransactions = async (type = 'all', pageNum = 1) => {
    try {
      const token = getToken();
      setLoading(true);
      const url = `/api/user/transaction-history?type=${type}&page=${pageNum}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions);
        setTotalPages(data.pagination.totalPages);
      } else {
        const errorData = await response.json();
        console.error('❌ [FRONTEND] API Error:', errorData);
      }
    } catch (error) {
      console.error('❌ [FRONTEND] Lỗi khi lấy lịch sử giao dịch:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getToken();
    
    if (token && user) {
      fetchTransactions(activeTab, page);
    } else {
      console.log('❌ [FRONTEND] Không có token hoặc user, không gọi API');
    }
  }, [user, activeTab, page]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setPage(1);
  };

  // Handle transaction click to show bank details
  const handleTransactionClick = (transaction: Transaction) => {
    if (transaction.type === 'withdrawal' || transaction.type === 'deposit') {
      setSelectedTransaction(transaction);
      setShowBankModal(true);
    }
  };

  // Handle withdrawal expansion toggle
  const toggleWithdrawalExpansion = (transactionId: string) => {
    setExpandedWithdrawals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionId)) {
        newSet.delete(transactionId);
      } else {
        newSet.add(transactionId);
      }
      return newSet;
    });
  };

     const getStatusBadge = (status: string, result?: string) => {
     if (result === 'win') {
       return <Badge className="bg-green-500">THẮNG</Badge>;
     } else if (result === 'lose') {
       return <Badge className="bg-red-500">THUA</Badge>;
     }

     switch (status) {
       case 'DA DUYET':
       case 'Đã duyệt':
         return <Badge className="bg-green-200 text-green-800">Đã duyệt</Badge>;
       case 'CHO XU LY':
       case 'Chờ duyệt':
       case 'Chờ xử lý':
         return <Badge className="bg-yellow-200 text-yellow-800">Chờ duyệt</Badge>;
       case 'TU CHOI':
       case 'Từ chối':
         return <Badge className="bg-red-200 text-red-800">Từ chối</Badge>;
       case 'completed':
       case 'Hoàn thành':
         return <Badge className="bg-blue-200 text-blue-800">Hoàn thành</Badge>;
       case 'pending':
       case 'Đang xử lý':
         return <Badge className="bg-yellow-200 text-yellow-800">Đang xử lý</Badge>;
       default:
         return <Badge className="bg-gray-200 text-gray-800">{status}</Badge>;
     }
   };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return '💰';
      case 'withdrawal':
        return '💸';
      case 'trade':
        return '📈';
      default:
        return '📊';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderTransaction = (transaction: Transaction) => {
    // Nếu là withdrawal, hiển thị giao diện giống như đã bỏ khỏi trang withdraw
    if (transaction.type === 'withdrawal') {
      return (
        <Card key={transaction._id} className="mb-4 bg-gradient-to-r from-slate-50 to-gray-50 border border-slate-200">
          <CardContent className="p-3 sm:p-4">
                         <div className="flex justify-between items-start mb-2">
               <div className="flex flex-col gap-2">
                 <span className="font-semibold text-slate-800 text-sm sm:text-base">
                   {transaction.amount?.toLocaleString()} VND
                 </span>
               </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 flex-shrink-0">
                  {formatDate(transaction.createdAt)}
                </span>
                <div className="flex-shrink-0">
                  {getStatusBadge(transaction.status)}
                </div>
                                 <Button
                   variant="ghost"
                   size="sm"
                   onClick={(e) => {
                     e.stopPropagation();
                     toggleWithdrawalExpansion(transaction._id);
                   }}
                   className="h-6 w-6 p-0 hover:bg-slate-200 text-slate-600"
                 >
                   <span className="text-lg font-bold">
                     {expandedWithdrawals.has(transaction._id) ? '-' : '+'}
                   </span>
                 </Button>
               </div>
             </div>
             
             {/* Thông tin chi tiết - chỉ hiển thị khi click dấu + */}
             {expandedWithdrawals.has(transaction._id) && (
               <div className="space-y-2 text-xs sm:text-sm border-t border-slate-200 pt-3 mt-3 bg-slate-50 p-3 rounded-lg">
                 <div className="flex justify-between">
                   <span className="text-slate-600">Loại giao dịch:</span>
                   <span className="font-medium text-slate-800">Ngân hàng</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-slate-600">Số tiền rút:</span>
                   <span className="font-medium text-red-600">
                     {transaction.amount?.toLocaleString()} VND
                   </span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-slate-600">Số tiền nhận:</span>
                   <span className="font-medium text-green-600">
                     {Math.round(transaction.amount * 0.96).toLocaleString()} VND
                   </span>
                 </div>
                 {transaction.bankInfo && (
                   <>
                     <div className="flex justify-between">
                       <span className="text-slate-600">Ngân hàng:</span>
                       <span className="font-medium text-slate-800">{transaction.bankInfo.bankName || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-slate-600">Số tài khoản:</span>
                       <span className="font-mono text-slate-800">{transaction.bankInfo.accountNumber || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-slate-600">Người thụ hưởng:</span>
                       <span className="font-medium text-slate-800">{transaction.bankInfo.accountName || transaction.bankInfo.accountHolder || 'N/A'}</span>
                     </div>
                   </>
                 )}
                 {transaction.adminNote && (
                   <div className="pt-2 border-t border-slate-200">
                     <span className="text-slate-600">Ghi chú:</span>
                     <span className="text-slate-800 ml-2">{transaction.adminNote}</span>
                   </div>
                 )}
               </div>
             )}
          </CardContent>
        </Card>
      );
    }

         // Giao diện mặc định cho các loại giao dịch khác
     return (
       <Card 
         key={transaction._id} 
         className={`mb-3 sm:mb-4 ${transaction.type === 'deposit' ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
         onClick={() => transaction.type === 'deposit' && handleTransactionClick(transaction)}
       >
         <CardContent className="p-3 sm:p-4">
           <div className="flex items-center justify-between">
             <div className="flex items-center space-x-2 sm:space-x-3">
               <span className="text-xl sm:text-2xl">{getTypeIcon(transaction.type)}</span>
               <div>
                 <h3 className="font-semibold text-sm sm:text-base">{transaction.description}</h3>
                 <p className="text-xs sm:text-sm text-gray-500">{formatDate(transaction.createdAt)}</p>
                 {transaction.adminNote && (
                   <p className="text-xs sm:text-sm text-gray-600 mt-1">Ghi chú: {transaction.adminNote}</p>
                 )}
               </div>
             </div>
                           <div className="text-right">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    {transaction.type === 'trade' && transaction.result === 'win' && (
                      <span className="text-green-600 font-semibold text-xs sm:text-sm">
                        +{formatCurrency(transaction.amount + (transaction.profit || 0))}
                      </span>
                    )}
                    {transaction.type === 'trade' && transaction.result === 'lose' && (
                      <span className="text-red-600 font-semibold text-xs sm:text-sm">
                        -{formatCurrency(transaction.amount)}
                      </span>
                    )}
                    {transaction.type !== 'trade' && (
                      <span className={`font-semibold text-xs sm:text-sm ${
                        transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.type === 'deposit' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </span>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(transaction.status, transaction.result || undefined)}
                  </div>
                </div>
               {transaction.type === 'trade' && transaction.result === 'win' && (
                 <p className="text-xs sm:text-sm text-green-600">
                   Lợi nhuận: +{formatCurrency(transaction.profit || 0)}
                 </p>
               )}
             </div>
           </div>
         </CardContent>
       </Card>
     );
  };

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Lịch sử giao dịch</h1>
        <p className="text-gray-600 text-sm sm:text-base">Xem lại tất cả các giao dịch của bạn</p>
        <p className="text-xs sm:text-sm text-blue-600 mt-2">💡 Click vào giao dịch nạp/rút tiền để xem tài khoản ngân hàng của bạn</p>
      </div>

             <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
         <TabsList className="grid w-full grid-cols-4">
           <TabsTrigger value="all" className="text-xs sm:text-sm">Tất cả</TabsTrigger>
           <TabsTrigger value="deposits" className="text-xs sm:text-sm">Nạp tiền</TabsTrigger>
           <TabsTrigger value="withdrawals" className="text-xs sm:text-sm">Rút tiền</TabsTrigger>
           <TabsTrigger value="trades" className="text-xs sm:text-sm">Giao dịch</TabsTrigger>
         </TabsList>

                 <TabsContent value={activeTab} className="mt-4 sm:mt-6">
           {loading ? (
             <div className="text-center py-6 sm:py-8">
               <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-gray-900 mx-auto"></div>
               <p className="mt-2 text-sm sm:text-base">Đang tải...</p>
             </div>
           ) : transactions.length === 0 ? (
             <Card>
               <CardContent className="p-6 sm:p-8 text-center">
                 <p className="text-gray-500 text-sm sm:text-base">Chưa có giao dịch nào</p>
               </CardContent>
             </Card>
           ) : (
            <div>
              {transactions.map(renderTransaction)}
              
                             {/* Phân trang */}
               {totalPages > 1 && (
                 <div className="flex justify-center space-x-2 mt-4 sm:mt-6">
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => setPage(page - 1)}
                     disabled={page === 1}
                     className="text-xs sm:text-sm"
                   >
                     Trước
                   </Button>
                   <span className="flex items-center px-2 sm:px-4 text-xs sm:text-sm">
                     Trang {page} / {totalPages}
                   </span>
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => setPage(page + 1)}
                     disabled={page === totalPages}
                     className="text-xs sm:text-sm"
                   >
                     Sau
                   </Button>
                 </div>
               )}
            </div>
          )}
        </TabsContent>
      </Tabs>

             {/* Bank Details Modal */}
       <Dialog open={showBankModal} onOpenChange={setShowBankModal}>
         <DialogContent className="sm:max-w-[500px]">
           <DialogHeader>
             <DialogTitle className="text-lg sm:text-xl">Thông tin tài khoản ngân hàng</DialogTitle>
           </DialogHeader>
                     {selectedTransaction && (
             <div className="space-y-3 sm:space-y-4">
               <div className="grid grid-cols-2 gap-3 sm:gap-4">
                 <div>
                   <label className="text-xs sm:text-sm font-medium text-gray-700">Loại giao dịch:</label>
                   <p className="text-xs sm:text-sm text-gray-900 capitalize">
                     {selectedTransaction.type === 'deposit' ? 'Nạp tiền' : 'Rút tiền'}
                   </p>
                 </div>
                 <div>
                   <label className="text-xs sm:text-sm font-medium text-gray-700">Ngày tạo:</label>
                   <p className="text-xs sm:text-sm text-gray-900">{formatDate(selectedTransaction.createdAt)}</p>
                 </div>
                 <div>
                   <label className="text-xs sm:text-sm font-medium text-gray-700">Số tiền:</label>
                   <p className={`text-xs sm:text-sm font-semibold ${
                     selectedTransaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                   }`}>
                     {selectedTransaction.type === 'deposit' ? '+' : '-'}{formatCurrency(selectedTransaction.amount)}
                   </p>
                 </div>
                 <div>
                   <label className="text-xs sm:text-sm font-medium text-gray-700">Trạng thái:</label>
                   <div className="mt-1">
                     {getStatusBadge(selectedTransaction.status)}
                   </div>
                 </div>
               </div>
              
                             <div className="border-t pt-3 sm:pt-4">
                 <h4 className="font-medium text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">Tài khoản ngân hàng của bạn:</h4>
                 <div className="space-y-2 sm:space-y-3">
                   <div>
                     <label className="text-xs sm:text-sm font-medium text-gray-700">Tên ngân hàng:</label>
                     <p className="text-xs sm:text-sm text-gray-900">{selectedTransaction.bankInfo?.bankName || 'Chưa cập nhật'}</p>
                   </div>
                   <div>
                     <label className="text-xs sm:text-sm font-medium text-gray-700">Số tài khoản:</label>
                     <p className="text-xs sm:text-sm text-gray-900 font-mono">{selectedTransaction.bankInfo?.accountNumber || 'Chưa cập nhật'}</p>
                   </div>
                   <div>
                     <label className="text-xs sm:text-sm font-medium text-gray-700">Chủ tài khoản:</label>
                     <p className="text-xs sm:text-sm text-gray-900">{selectedTransaction.bankInfo?.accountName || selectedTransaction.bankInfo?.accountHolder || 'Chưa cập nhật'}</p>
                   </div>
                 </div>
                 {(!selectedTransaction.bankInfo?.bankName || !selectedTransaction.bankInfo?.accountNumber) && (
                   <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                     <p className="text-xs sm:text-sm text-yellow-800">
                       💡 Bạn chưa cập nhật thông tin ngân hàng. Vui lòng cập nhật trong trang cá nhân để sử dụng tính năng rút tiền.
                     </p>
                   </div>
                 )}
               </div>

                             {selectedTransaction.adminNote && (
                 <div className="border-t pt-3 sm:pt-4">
                   <label className="text-xs sm:text-sm font-medium text-gray-700">Ghi chú:</label>
                   <p className="text-xs sm:text-sm text-gray-900 mt-1">{selectedTransaction.adminNote}</p>
                 </div>
               )}

               <div className="flex justify-end pt-3 sm:pt-4">
                 <Button size="sm" onClick={() => setShowBankModal(false)} className="text-xs sm:text-sm">
                   Đóng
                 </Button>
               </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 