'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import Header from '@/components/Header';

// Ensure React is available globally
if (typeof window !== 'undefined') {
  window.React = window.React || React;
}

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  useEffect(() => {
    // Chỉ redirect khi đã load xong và không authenticated
    if (!isLoading && !isAuthenticated()) {
      // Thêm delay lớn hơn để đảm bảo authentication state đã được cập nhật hoàn toàn
      const timeoutId = setTimeout(() => {
        // Double check authentication state
        if (!isAuthenticated()) {
          // Kiểm tra flag preventRedirect
          const preventRedirect = localStorage.getItem('preventRedirect')
          if (preventRedirect === 'true') {
            // Nếu có flag preventRedirect, không redirect
            return
          }
          
          // Chỉ redirect nếu thực sự không authenticated và không phải đang trong quá trình login
          const currentPath = window.location.pathname;
          if (!currentPath.includes('/login') && !currentPath.includes('/register')) {
            router.push('/login');
          }
        }
      }, 500); // Tăng delay lên 500ms
      
      return () => clearTimeout(timeoutId);
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
