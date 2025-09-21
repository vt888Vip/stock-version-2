'use client';

import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAdminState } from '../components/useAdminState';

export default function TransactionsPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, isAdmin, loading } = useAdminState();

  useEffect(() => {
    // Redirect to withdrawals page
    if (!isLoading && !loading && isAuthenticated() && isAdmin()) {
      router.replace('/admin/withdrawals');
    }
  }, [isLoading, loading, isAuthenticated, isAdmin, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p>Đang chuyển hướng đến quản lý rút tiền...</p>
      </div>
    </div>
  );
}
