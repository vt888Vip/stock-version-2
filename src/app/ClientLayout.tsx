'use client';

import React from 'react';
import { AuthProvider } from '@/lib/useAuth';
import { Toaster } from '@/components/ui/toaster';
import { SocketProvider } from '@/contexts/SocketContext';

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

  // ✅ Khởi động background services thông qua API
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      // Gọi API để khởi động services ở server-side
      fetch('/api/init-services')
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log('✅ Background services initialized successfully');
          } else {
            console.error('❌ Failed to initialize background services:', data.message);
          }
        })
        .catch(error => {
          console.error('❌ Error initializing background services:', error);
        });

      // ✅ Khởi động Scheduler Service
      fetch('/api/scheduler/init', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          if (!data.success) {
            console.error('❌ Failed to initialize scheduler service:', data.message);
          }
        })
        .catch(error => {
          console.error('❌ Error initializing scheduler service:', error);
        });    }
  }, []);

  return (
    <AuthProvider>
      <SocketProvider>
        {children}
        <Toaster />
      </SocketProvider>
    </AuthProvider>
  );
}
