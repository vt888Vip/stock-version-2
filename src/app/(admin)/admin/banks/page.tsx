'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { useAdminState } from '../components/useAdminState';
import BanksManagement from '../components/BanksManagement';

export default function BanksPage() {
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
    <AdminLayout activeTab="banks">
      <BanksManagement />
    </AdminLayout>
  );
}
