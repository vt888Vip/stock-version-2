'use client';

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import AdminLayout from './AdminLayout';
import { useAdminState } from './useAdminState';
import { AdminTableSkeleton } from '@/components/ui/skeleton';

interface OptimizedPageWrapperProps {
  children: React.ReactNode;
  activeTab: string;
  showSkeleton?: boolean;
}

export default function OptimizedPageWrapper({ 
  children, 
  activeTab, 
  showSkeleton = true 
}: OptimizedPageWrapperProps) {
  const { user, isLoading, isAuthenticated, isAdmin, loading } = useAdminState();

  // Loading state
  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Đang tải...</p>
        </div>
      </div>
    );
  }

  // Không render nếu không có quyền
  if (!isAuthenticated() || !isAdmin()) {
    return null;
  }

  return (
    <AdminLayout activeTab={activeTab}>
      <Suspense fallback={
        showSkeleton ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
            <AdminTableSkeleton rows={5} />
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )
      }>
        {children}
      </Suspense>
    </AdminLayout>
  );
}
