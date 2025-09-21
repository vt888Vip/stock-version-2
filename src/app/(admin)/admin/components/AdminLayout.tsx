'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { 
  Settings, 
  Users, 
  TrendingUp, 
  DollarSign, 
  LogOut, 
  History, 
  Banknote, 
  Building, 
  Target,
  CreditCard
} from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: string;
}

export default function AdminLayout({ children, activeTab }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  // Preload next page on hover
  const handleTabHover = (href: string) => {
    router.prefetch(href);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp, href: '/admin/dashboard' },
    { id: 'users', label: 'Quản lý người dùng', icon: Users, href: '/admin/users' },
    { id: 'withdrawals', label: 'Quản lý rút tiền', icon: CreditCard, href: '/admin/withdrawals' },
    { id: 'deposits', label: 'Nạp tiền', icon: Banknote, href: '/admin/deposits' },
    { id: 'banks', label: 'Quản lý ngân hàng', icon: Building, href: '/admin/banks' },
    { id: 'orders', label: 'Lệnh đặt', icon: History, href: '/admin/orders' },
    { id: 'session-results', label: 'Kết quả phiên giao dịch', icon: Target, href: '/admin/session-results' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
                <Settings className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">Xin chào, {user?.username}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Đăng xuất
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white/90 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  onMouseEnter={() => handleTabHover(tab.href)}
                  className={`py-4 px-4 rounded-lg font-medium text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <IconComponent className="h-4 w-4 inline mr-2" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
