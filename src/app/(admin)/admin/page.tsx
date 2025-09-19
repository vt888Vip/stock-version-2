'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, isAdmin } = useAuth();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Chỉ redirect một lần
    if (!isLoading && !hasRedirected) {
      setHasRedirected(true);
      
      // Kiểm tra xác thực
      if (!isAuthenticated()) {
        router.replace('/login');
        return;
      }

      // Kiểm tra quyền admin
      if (!isAdmin()) {
        router.replace('/');
        return;
      }

      // Redirect đến trang dashboard mới
      router.replace('/admin/dashboard');
    }
  }, [isLoading, isAuthenticated, isAdmin, router, hasRedirected]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải...</p>
        </div>
      </div>
    );
  }

  // Fallback UI
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Đang chuyển hướng...</p>
              </div>
            </div>
  );
}

