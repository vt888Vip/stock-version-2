'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Banknote, 
  Search, 
  X, 
  Eye, 
  CheckCircle, 
  XCircle,
  Download,
  Plus,
  User,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function DepositsManagement() {
  const { toast } = useToast();
  const [deposits, setDeposits] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Manual deposit states
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  
  // User search states
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [filteredUsers, setFilteredUsers] = useState([]);
  
  // Search states
  const [searchName, setSearchName] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // Filter users based on search query
  useEffect(() => {
    if (userSearchQuery.trim() === '') {
      setFilteredUsers(users.slice(0, 10)); // Show first 10 users when no search
    } else {
      const filtered = users.filter((user: any) =>
        user.username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        user.bank?.accountNumber?.includes(userSearchQuery)
      ).slice(0, 10); // Limit to 10 results
      setFilteredUsers(filtered);
    }
  }, [userSearchQuery, users]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.user-search-container')) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load deposits
      const depositsResponse = await fetch('/api/admin/deposits', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (depositsResponse.ok) {
        const depositsData = await depositsResponse.json();
        setDeposits(depositsData.deposits || []);
      }

      // Load users
      const usersResponse = await fetch('/api/admin/users', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData.users || []);
        setFilteredUsers(usersData.users?.slice(0, 10) || []); // Initialize with first 10 users
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải dữ liệu',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProcessDeposit = async (depositId: string, action: 'approve' | 'reject') => {
    try {
      const response = await fetch('/api/admin/deposits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ depositId, action })
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: action === 'approve' ? 'Đã duyệt nạp tiền' : 'Đã từ chối nạp tiền',
        });
        loadData(); // Reload data
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể xử lý nạp tiền',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error processing deposit:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xử lý nạp tiền',
        variant: 'destructive',
      });
    }
  };

  const handleDeposit = async () => {
    if (!selectedUser || !depositAmount) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn người dùng và nhập số tiền',
        variant: 'destructive',
      });
      return;
    }

    // Debug: Log thông tin để kiểm tra
    console.log('Selected user:', selectedUser);
    console.log('Deposit amount:', depositAmount);
    console.log('Deposit note:', depositNote);

    try {
      const requestBody = {
        userId: typeof selectedUser._id === 'string' ? selectedUser._id : selectedUser._id.toString(),
        amount: parseFloat(depositAmount),
        note: depositNote
      };

      console.log('Request body:', requestBody);

      const response = await fetch('/api/admin/deposits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('Success result:', result);
        toast({
          title: 'Thành công',
          description: 'Đã nạp tiền thành công',
        });
        setSelectedUser(null);
        setDepositAmount('');
        setDepositNote('');
        setUserSearchQuery('');
        setShowUserDropdown(false);
        loadData();
      } else {
        const error = await response.json();
        console.log('Error response:', error);
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể nạp tiền',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error depositing:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể nạp tiền',
        variant: 'destructive',
      });
    }
  };

  const handleUserSelect = (user: any) => {
    setSelectedUser(user);
    setUserSearchQuery(user.username);
    setShowUserDropdown(false);
  };

  const clearSelectedUser = () => {
    setSelectedUser(null);
    setUserSearchQuery('');
    setShowUserDropdown(false);
  };

  // Filter deposits based on search criteria
  const filteredDeposits = deposits.filter((deposit: any) => {
    const nameMatch = searchName === '' || 
      deposit.username?.toLowerCase().includes(searchName.toLowerCase());
    
    const dateMatch = () => {
      if (!searchDateFrom && !searchDateTo) return true;
      
      const depositDate = new Date(deposit.createdAt);
      const fromDate = searchDateFrom ? new Date(searchDateFrom) : null;
      const toDate = searchDateTo ? new Date(searchDateTo) : null;
      
      if (fromDate && toDate) {
        return depositDate >= fromDate && depositDate <= toDate;
      } else if (fromDate) {
        return depositDate >= fromDate;
      } else if (toDate) {
        return depositDate <= toDate;
      }
      
      return true;
    };
    
    return nameMatch && dateMatch();
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-blue-700">Đang tải danh sách nạp tiền...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Manual Deposit Form */}
      <Card>
        <CardHeader>
          <CardTitle>Nạp tiền thủ công</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative user-search-container">
              <Label htmlFor="user">Chọn người dùng</Label>
              <div className="relative">
                <Input
                  id="user"
                  type="text"
                  placeholder="Tìm kiếm người dùng..."
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value);
                    setShowUserDropdown(true);
                  }}
                  onFocus={() => setShowUserDropdown(true)}
                  className="pr-10"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                  {selectedUser && (
                    <button
                      onClick={clearSelectedUser}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <X className="h-4 w-4 text-gray-400" />
                    </button>
                  )}
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              </div>
              
              {/* User Dropdown */}
              {showUserDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user: any) => (
                      <div
                        key={user._id}
                        onClick={() => handleUserSelect(user)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{user.username}</div>
                              <div className="text-sm text-gray-500">
                                Số dư: {user.balance?.available?.toLocaleString() || 0}đ
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            <div>Đã nạp: {user.totalDeposited?.toLocaleString() || 0}đ</div>
                            {user.bank?.name && (
                              <div className="text-xs">{user.bank.name}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-gray-500 text-center">
                      Không tìm thấy người dùng
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="amount">Số tiền</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Nhập số tiền"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              placeholder="Ghi chú về giao dịch"
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
            />
          </div>
          <Button 
            onClick={handleDeposit} 
            className="mt-4"
            disabled={!selectedUser || !depositAmount}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nạp tiền
          </Button>
        </CardContent>
      </Card>

      {/* Deposit Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Yêu cầu nạp tiền</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Người dùng</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Ngân hàng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead>Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deposits.map((deposit: any) => (
                <TableRow key={deposit._id}>
                  <TableCell className="font-medium">{deposit.username}</TableCell>
                  <TableCell>{deposit.amount.toLocaleString()}đ</TableCell>
                  <TableCell>
                    {deposit.bankInfo?.bankName ? (
                      <div>
                        <div className="font-medium">{deposit.bankInfo.bankName}</div>
                        {deposit.bankInfo.accountNumber && (
                          <div className="text-sm text-gray-500">{deposit.bankInfo.accountNumber}</div>
                        )}
                      </div>
                    ) : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      deposit.status === 'CHO XU LY' ? 'secondary' : 
                      deposit.status === 'DA DUYET' ? 'default' : 
                      'destructive'
                    }>
                      {deposit.status === 'CHO XU LY' ? 'Chờ xử lý' : 
                       deposit.status === 'DA DUYET' ? 'Đã duyệt' : 
                       deposit.status === 'TU CHOI' ? 'Đã từ chối' : 
                       deposit.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(deposit.createdAt).toLocaleString('vi-VN')}
                  </TableCell>
                  <TableCell>
                    {deposit.status === 'CHO XU LY' && (
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="default"
                          onClick={() => handleProcessDeposit(deposit._id, 'approve')}
                        >
                          Duyệt
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleProcessDeposit(deposit._id, 'reject')}
                        >
                          Từ chối
                        </Button>
                      </div>
                    )}
                    {deposit.status === 'DA DUYET' && (
                      <Badge variant="default">Đã duyệt</Badge>
                    )}
                    {deposit.status === 'TU CHOI' && (
                      <Badge variant="destructive">Đã từ chối</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
