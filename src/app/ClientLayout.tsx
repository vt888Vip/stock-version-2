'use client';

import React from 'react';
import { AuthProvider } from '@/lib/useAuth';
import { Toaster } from '@/components/ui/toaster';
import { initializeFutureSessionsManager } from '@/lib/futureSessionsManager';

// Đảm bảo React được khai báo trong phạm vi toàn cục
declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      React: typeof React;
    }
  }
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chỉ gán trong môi trường browser
  React.useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).React) {
      (window as any).React = React;
    }
  }, []);

  // Khởi động FutureSessionsManager
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      initializeFutureSessionsManager();
    }
  }, []);

  return (
    <AuthProvider>
      {children}
      <Toaster />
    </AuthProvider>
  );
}
