'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import useSWR from 'swr';
import { Upload, Copy, CheckCircle } from 'lucide-react';

export default function DepositPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [fullName, setFullName] = useState('');

  // Lấy token từ localStorage
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('authToken') : null;

  // Lấy cài đặt chung của hệ thống
  const { data: settings, error: settingsError } = useSWR(
    user ? '/api/admin/settings' : null,
    async (url: string) => {
      const res = await fetch(url, { 
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    }
  );
  
  // Lấy thông tin ngân hàng của nền tảng
  const { data: platformBanks, error: platformBanksError } = useSWR(
    user ? '/api/platform/banks' : null,
    async (url: string) => {
      const res = await fetch(url, { 
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch platform banks');
      const data = await res.json();
      return data;
    }
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated()) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng đăng nhập' });
      router.push('/login');
    }
  }, [user, isLoading, isAuthenticated, router, toast]);



  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Đã sao chép',
        description: 'Đã sao chép vào clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Lỗi khi sao chép:', err);
    }
  };

  const handleSubmit = async () => {
    if (!amount || !fullName.trim()) {
      toast({ 
        variant: 'destructive', 
        title: 'Lỗi', 
        description: 'Vui lòng điền đầy đủ số tiền và họ tên' 
      });
      return;
    }

    if (settings && Number(amount) < settings.minDeposit) {
      toast({ variant: 'destructive', title: 'Lỗi', description: `Số tiền nạp tối thiểu là ${settings.minDeposit.toLocaleString()} đ` });
      return;
    }

    try {
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: Number(amount),
          bank: platformBanks?.banks?.[0]?.bankName || 'Ngân hàng',
          fullName: fullName.trim(),
          confirmed: true
        }),
      });
      
      const result = await res.json();
      
      if (res.ok) {
        toast({ title: 'Thành công', description: 'Yêu cầu nạp tiền đã được gửi' });
        setAmount('');
        setFullName('');
      } else {
        toast({ variant: 'destructive', title: 'Lỗi', description: result.message || 'Có lỗi xảy ra' });
      }
    } catch (err) {
      console.error('Lỗi khi gửi yêu cầu:', err);
      toast({ 
        variant: 'destructive', 
        title: 'Lỗi', 
        description: 'Không thể gửi yêu cầu. Vui lòng thử lại sau.' 
      });
    }
  };

  if (isLoading || !user) {
    return <div className="flex justify-center items-center h-[60vh] text-gray-600">Đang tải...</div>;
  }

  const bankInfo = platformBanks?.banks?.[0];
  const transferContent = `NAP-${user?.username || 'user'}-${new Date().getTime().toString().slice(-6)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-blue-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Thông tin ngân hàng */}
          <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                <Upload className="h-4 w-4 text-blue-600" />
                Thông tin chuyển khoản
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!platformBanks ? (
                <div className="text-center py-4 text-slate-600">Đang tải thông tin ngân hàng...</div>
              ) : platformBanksError ? (
                <div className="text-red-600">Không thể tải thông tin ngân hàng</div>
              ) : bankInfo ? (
                <div className="space-y-3">
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
                    <h3 className="text-lg font-bold text-emerald-800 mb-3">Ngân Hàng : {bankInfo.bankName}</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 text-sm font-medium">Chủ tài khoản:</span>
                        <span className="font-semibold text-sm text-slate-800">{bankInfo.accountHolder}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 text-sm font-medium">Số tài khoản:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded">{bankInfo.accountNumber}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(bankInfo.accountNumber)}
                            className="h-6 w-6 p-0 border-slate-300 hover:bg-slate-100"
                          >
                            {copied ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-slate-600" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                                     <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 shadow-sm">
                     <p className="text-blue-800 text-sm font-semibold mb-3">Nhập Họ và Tên:</p>
                     <Input
                       type="text"
                       value={fullName}
                       onChange={(e) => setFullName(e.target.value)}
                       placeholder="Nhập họ và tên của bạn"
                       className="border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                       required
                     />
                   </div>
              
                </div>
              ) : (
                <p className="text-slate-600 text-center">Hiện tại chưa có thông tin ngân hàng.</p>
              )}
            </CardContent>
          </Card>

          {/* Form nạp tiền */}
          <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                <Upload className="h-4 w-4 text-blue-600" />
                Nạp tiền
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-700 text-sm font-medium">Số tiền nạp (VND)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Nhập số tiền"
                  className="mt-1 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  min={settings?.minDeposit || 0}
                  max={settings?.maxDeposit || 100000000}
                  required
                />
                {settings && (
                  <p className="text-xs text-slate-500 mt-1">
                    Số tiền từ {settings.minDeposit?.toLocaleString()} - {settings.maxDeposit?.toLocaleString()} VND
                  </p>
                )}
              </div>



              <Button
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                onClick={handleSubmit}
                disabled={!amount || !fullName.trim()}
              >
                <Upload className="h-5 w-5 mr-2" />
                Gửi yêu cầu nạp tiền
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}