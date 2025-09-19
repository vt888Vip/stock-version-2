'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/ui/use-toast';

export function useAdminState() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  // Kiểm tra quyền truy cập
  useEffect(() => {
    if (!isLoading && !hasCheckedAuth) {
      setHasCheckedAuth(true);
      
      if (!isAuthenticated()) {
        toast({
          title: 'Lỗi',
          description: 'Vui lòng đăng nhập để truy cập trang quản trị',
          variant: 'destructive',
        });
        router.push('/login');
        return;
      }

      if (!isAdmin()) {
        toast({
          title: 'Lỗi',
          description: 'Bạn không có quyền truy cập trang này',
          variant: 'destructive',
        });
        router.push('/');
        return;
      }

      // Nếu có quyền, set loading về false
      setLoading(false);
    }
  }, [isLoading, isAuthenticated, isAdmin, router, toast, hasCheckedAuth]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    isAdmin,
    activeTab,
    loading,
    setLoading,
    handleTabChange,
    toast
  };
}
