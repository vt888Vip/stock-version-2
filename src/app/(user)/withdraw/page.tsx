"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '../../../../components/ui/separator';
import { Wallet, ArrowDownRight, Building2, AlertCircle } from 'lucide-react';
import useSWR from 'swr';

// Hàm chuẩn hóa tên chủ tài khoản: bỏ dấu, viết hoa
const normalizeAccountHolder = (name: string): string => {
  if (!name) return '';
  
  const vietnameseMap: { [key: string]: string } = {
    'à': 'A', 'á': 'A', 'ả': 'A', 'ã': 'A', 'ạ': 'A',
    'ă': 'A', 'ằ': 'A', 'ắ': 'A', 'ẳ': 'A', 'ẵ': 'A', 'ặ': 'A',
    'â': 'A', 'ầ': 'A', 'ấ': 'A', 'ẩ': 'A', 'ẫ': 'A', 'ậ': 'A',
    'è': 'E', 'é': 'E', 'ẻ': 'E', 'ẽ': 'E', 'ẹ': 'E',
    'ê': 'E', 'ề': 'E', 'ế': 'E', 'ể': 'E', 'ễ': 'E', 'ệ': 'E',
    'ì': 'I', 'í': 'I', 'ỉ': 'I', 'ĩ': 'I', 'ị': 'I',
    'ò': 'O', 'ó': 'O', 'ỏ': 'O', 'õ': 'O', 'ọ': 'O',
    'ô': 'O', 'ồ': 'O', 'ố': 'O', 'ổ': 'O', 'ỗ': 'O', 'ộ': 'O',
    'ơ': 'O', 'ờ': 'O', 'ớ': 'O', 'ở': 'O', 'ỡ': 'O', 'ợ': 'O',
    'ù': 'U', 'ú': 'U', 'ủ': 'U', 'ũ': 'U', 'ụ': 'U',
    'ư': 'U', 'ừ': 'U', 'ứ': 'U', 'ử': 'U', 'ữ': 'U', 'ự': 'U',
    'ỳ': 'Y', 'ý': 'Y', 'ỷ': 'Y', 'ỹ': 'Y', 'ỵ': 'Y',
    'đ': 'D',
    'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
    'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
    'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
    'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
    'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E',
    'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
    'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
    'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
    'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
    'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
    'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
    'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y',
    'Đ': 'D'
  };
  
  let normalized = name;
  
  // Thay thế các ký tự có dấu
  for (const [accented, plain] of Object.entries(vietnameseMap)) {
    normalized = normalized.replace(new RegExp(accented, 'g'), plain);
  }
  
  // Loại bỏ khoảng trắng thừa và chuyển thành chữ hoa
  return normalized.replace(/\s+/g, ' ').trim().toUpperCase();
};

export default function WithdrawPage() {
  const { user, isLoading, isAuthenticated, refreshUser } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('authToken') : null;
  const router = useRouter();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ TỐI ƯU: Lấy thông tin balance với polling 10 giây
  const { data: balanceData, error: balanceError, mutate: refreshBalance } = useSWR(
    token ? '/api/user/balance' : null,
    url => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json()),
    {
      refreshInterval: 10000, // Polling mỗi 10 giây
      revalidateOnFocus: true, // Revalidate khi focus
      revalidateOnReconnect: true, // Revalidate khi reconnect
      dedupingInterval: 5000, // Dedupe requests trong 5 giây
    }
  );

  // ✅ THÊM: Polling thông tin ngân hàng mỗi 30 giây
  const { data: userData, mutate: refreshUserData } = useSWR(
    token ? '/api/auth/me' : null,
    url => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json()),
    {
      refreshInterval: 30000, // Polling mỗi 30 giây
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 10000,
    }
  );

  // ✅ TỐI ƯU: Chỉ refresh một lần khi component mount
  useEffect(() => {
    if (user && token) {
      // Chỉ refresh một lần khi component mount
      refreshBalance();
    }
  }, [user, token, refreshBalance]);

  // ✅ TỐI ƯU: Refresh khi user quay lại trang (focus) - chỉ một lần
  useEffect(() => {
    let hasRefreshed = false;
    
    const handleFocus = () => {
      if (user && token && !hasRefreshed) {
        hasRefreshed = true;
        refreshBalance();
        
        // Reset flag sau 5 giây
        setTimeout(() => {
          hasRefreshed = false;
        }, 5000);
      }
    };

    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, token, refreshBalance]);


  const availableBalance = balanceData?.balance?.available || 0;
  const WITHDRAWAL_FEE = 0.04; // 4% phí rút tiền

  useEffect(() => {
    if (!isLoading && !isAuthenticated()) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng đăng nhập' });
      router.push('/login');
    }
  }, [user, isLoading, isAuthenticated, router, toast]);

  // ✅ CẬP NHẬT: Sử dụng dữ liệu từ polling để có thông tin mới nhất
  const currentUser = userData?.user || user;
  const hasBankInfo = currentUser?.bank?.name && currentUser?.bank?.accountNumber && currentUser?.bank?.accountHolder;

  // Tính toán số tiền thực nhận sau khi trừ phí
  const calculateActualAmount = (withdrawAmount: number) => {
    const fee = withdrawAmount * WITHDRAWAL_FEE;
    return withdrawAmount - fee;
  };

  // Tính toán phí rút tiền
  const calculateFee = (withdrawAmount: number) => {
    return withdrawAmount * WITHDRAWAL_FEE;
  };

  const handleLinkBank = () => {
    router.push('/account?tab=bank');
  };

  const handleSubmit = async () => {
    if (!amount) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng nhập số tiền rút' });
      return;
    }

    const withdrawAmount = Number(amount);

    // Kiểm tra số dư
    if (withdrawAmount > availableBalance) {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: 'Số dư không đủ để thực hiện giao dịch này',
      });
      return;
    }

    setIsSubmitting(true);

    try {
             // ✅ SỬ DỤNG: Thông tin ngân hàng từ polling (đã có sẵn)
       const bankInfo = currentUser?.bank || {};
    
      // Kiểm tra thông tin ngân hàng chi tiết hơn
      if (!bankInfo.name) {
        console.error('❌ [DEBUG] Thiếu tên ngân hàng:', bankInfo.name);
        toast({ 
          variant: 'destructive', 
          title: 'Lỗi', 
          description: 'Thiếu tên ngân hàng. Vui lòng kiểm tra lại.' 
        });
        return;
      }
      
      if (!bankInfo.accountNumber) {
        console.error('❌ [DEBUG] Thiếu số tài khoản:', bankInfo.accountNumber);
        toast({ 
          variant: 'destructive', 
          title: 'Lỗi', 
          description: 'Thiếu số tài khoản. Vui lòng kiểm tra lại.' 
        });
        return;
      }
      
      if (!bankInfo.accountHolder) {
        console.error('❌ [DEBUG] Thiếu chủ tài khoản:', bankInfo.accountHolder);
        toast({ 
          variant: 'destructive', 
          title: 'Lỗi', 
          description: 'Thiếu chủ tài khoản. Vui lòng kiểm tra lại.' 
        });
        return;
      }

      // Gửi yêu cầu rút tiền với thông tin ngân hàng mới nhất từ database
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          amount: withdrawAmount,
          bankName: bankInfo.name,
          accountNumber: bankInfo.accountNumber,
          accountHolder: normalizeAccountHolder(bankInfo.accountHolder)
        }),
      });
      
      const result = await res.json();
      
      if (res.ok) {
        toast({ 
          title: 'Thành công', 
          description: `Đã gửi yêu cầu rút tiền thành công. Bạn vui lòng chờ hệ thống tiếp nhận và tự động thanh khoản cho bạn.` 
        });
        setAmount('');
        
                 // Refresh balance data và user data
         refreshBalance();
         refreshUserData();
      } else {
        toast({ variant: 'destructive', title: 'Lỗi', description: result.message || 'Không thể gửi yêu cầu rút tiền' });
      }
    } catch (err) {
      console.error('❌ [WITHDRAW] Lỗi khi gửi yêu cầu rút tiền:', err);
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Không thể gửi yêu cầu rút tiền' });
    } finally {
      setIsSubmitting(false);
    }
  };



   if (isLoading || !user) {
    return <div className="flex justify-center items-center h-screen text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-blue-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
                     {/* Header */}
           <div className="text-center">
             <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">Rút tiền</h1>
             <p className="text-slate-300 text-xs sm:text-sm">Thực hiện rút tiền về tài khoản ngân hàng</p>
           </div>

          {/* Số dư */}
          <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4 text-green-600" />
                Số dư khả dụng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-green-600 mb-1">
                  {availableBalance.toLocaleString()} VND
                </div>
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                  Phí rút: 4%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Kiểm tra tài khoản ngân hàng */}
          {!hasBankInfo ? (
            <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  Liên kết ngân hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                                 <div className="text-center space-y-3">
                   <div className="text-amber-600 text-base sm:text-lg font-medium">
                     ⚠️ Bạn chưa liên kết tài khoản ngân hàng
                   </div>
                   <p className="text-slate-600 text-xs sm:text-sm">
                     Vui lòng liên kết tài khoản ngân hàng để có thể rút tiền
                   </p>
                  <Button 
                    onClick={handleLinkBank}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Building2 className="h-4 w-4 mr-2" />
                    Liên kết ngân hàng
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Form rút tiền */}
              <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                    Rút tiền
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                                     <div>
                     <Label className="text-slate-700 text-xs sm:text-sm font-medium">Số tiền rút (VND)</Label>
                     <Input
                       type="number"
                       value={amount}
                       onChange={(e) => setAmount(e.target.value)}
                       placeholder="Nhập số tiền muốn rút"
                       className="mt-1 border-slate-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                     />
                   </div>
                                     {/* Thông tin chi tiết */}
                   {amount && Number(amount) > 0 && (
                     <div className="bg-gradient-to-r from-slate-50 to-gray-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                       <h4 className="text-slate-800 font-semibold mb-3 text-sm sm:text-base">Chi tiết giao dịch:</h4>
                       <div className="space-y-2 text-xs sm:text-sm">
                         <div className="flex justify-between">
                           <span className="text-slate-600">Số tiền rút:</span>
                           <span className="font-semibold text-slate-800">{Number(amount).toLocaleString()} VND</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-slate-600">Phí rút (4%):</span>
                           <span className="text-red-600 font-semibold">-{calculateFee(Number(amount)).toLocaleString()} VND</span>
                         </div>
                         <Separator className="bg-slate-300 my-2" />
                         <div className="flex justify-between font-bold">
                           <span className="text-slate-700">Số tiền thực nhận:</span>
                           <span className="text-green-600">{calculateActualAmount(Number(amount)).toLocaleString()} VND</span>
                         </div>
                       </div>
                     </div>
                   )}

                                     <Button
                     className="w-full bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-semibold py-2 sm:py-3 rounded-xl transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed shadow-lg hover:shadow-xl text-sm sm:text-base"
                     onClick={handleSubmit}
                     disabled={!amount || isSubmitting || Number(amount) <= 0 || Number(amount) > availableBalance}
                   >
                                         {isSubmitting ? (
                       <>
                         <div className="h-4 w-4 sm:h-5 sm:w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                         Đang xử lý...
                       </>
                     ) : (
                       <>
                         <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                         Gửi yêu cầu rút tiền
                       </>
                     )}
                                     </Button>
                 </CardContent>
               </Card>

              {/* Thông tin ngân hàng */}
              <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    Thông tin tài khoản ngân hàng
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                                     <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-xl border border-blue-200">
                     <div className="space-y-2">
                                               <div className="flex justify-between items-center">
                          <span className="text-slate-600 text-xs sm:text-sm font-medium">Tên ngân hàng:</span>
                          <span className="font-semibold text-xs sm:text-sm text-slate-800">{currentUser?.bank?.name || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 text-xs sm:text-sm font-medium">Số tài khoản:</span>
                          <span className="font-mono text-xs sm:text-sm font-bold text-slate-800">{currentUser?.bank?.accountNumber || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 text-xs sm:text-sm font-medium">Chủ tài khoản:</span>
                          <span className="font-semibold text-xs sm:text-sm text-slate-800">{normalizeAccountHolder(currentUser?.bank?.accountHolder || '') || 'N/A'}</span>
                        </div>
                     </div>
                   </div>
                </CardContent>
              </Card>
             </>
           )}
        </div>
      </div>
    </div>
  );
}
