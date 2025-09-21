'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/lib/useAuth';

interface AdminStats {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalTrades: number;
  totalRevenue: number;
  activeUsers: number;
}

interface AdminDataContextType {
  // Stats
  stats: AdminStats | null;
  statsLoading: boolean;
  
  // Users (cached)
  users: any[];
  usersLoading: boolean;
  usersLastFetch: Date | null;
  
  // Cache management
  refreshStats: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshAll: () => Promise<void>;
  
  // Cache settings
  cacheExpiry: number; // milliseconds
}

const AdminDataContext = createContext<AdminDataContextType | undefined>(undefined);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLastFetch, setUsersLastFetch] = useState<Date | null>(null);
  
  const cacheExpiry = 5 * 60 * 1000; // 5 minutes

  // Check if cache is still valid
  const isCacheValid = (lastFetch: Date | null) => {
    if (!lastFetch) return false;
    return Date.now() - lastFetch.getTime() < cacheExpiry;
  };

  // Fetch stats
  const refreshStats = async () => {
    if (statsLoading) return;
    
    try {
      setStatsLoading(true);
      const response = await fetch('/api/admin/stats', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch users with pagination
  const refreshUsers = async (page = 1, limit = 50) => {
    if (usersLoading) return;
    
    try {
      setUsersLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });
      
      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
        setUsersLastFetch(new Date());
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  // Refresh all data
  const refreshAll = async () => {
    await Promise.all([
      refreshStats(),
      refreshUsers()
    ]);
  };

  // Auto-refresh when admin is authenticated
  useEffect(() => {
    if (isAuthenticated() && isAdmin()) {
      // Load stats if not cached
      if (!stats && !statsLoading) {
        refreshStats();
      }
      
      // Load users if cache is invalid
      if (!isCacheValid(usersLastFetch) && !usersLoading) {
        refreshUsers();
      }
    }
  }, [isAuthenticated, isAdmin]);

  const value: AdminDataContextType = {
    stats,
    statsLoading,
    users,
    usersLoading,
    usersLastFetch,
    refreshStats,
    refreshUsers,
    refreshAll,
    cacheExpiry
  };

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (context === undefined) {
    throw new Error('useAdminData must be used within an AdminDataProvider');
  }
  return context;
}
