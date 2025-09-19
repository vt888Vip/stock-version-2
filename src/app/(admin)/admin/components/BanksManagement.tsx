'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Building, 
  Plus,
  Edit,
  Trash2,
  Save,
  X
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function BanksManagement() {
  const { toast } = useToast();
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingBank, setAddingBank] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  
  // New bank form states
  const [newBank, setNewBank] = useState({
    name: '',
    accountNumber: '',
    accountHolder: '',
    branch: ''
  });

  // Edit bank states
  const [editingBankData, setEditingBankData] = useState<any>(null);

  useEffect(() => {
    loadBanks();
  }, []);

  const loadBanks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/banks', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBanks(data.banks || []);
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.error || 'Không thể tải danh sách ngân hàng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading banks:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách ngân hàng',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddBank = async () => {
    if (!newBank.name || !newBank.accountNumber || !newBank.accountHolder) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng điền đầy đủ thông tin bắt buộc',
        variant: 'destructive',
      });
      return;
    }

    setAddingBank(true);
    try {
      const response = await fetch('/api/admin/banks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newBank)
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Thành công',
          description: 'Đã thêm ngân hàng mới',
        });
        setNewBank({
          name: '',
          accountNumber: '',
          accountHolder: '',
          branch: ''
        });
        loadBanks();
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.error || 'Không thể thêm ngân hàng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error adding bank:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể thêm ngân hàng',
        variant: 'destructive',
      });
    } finally {
      setAddingBank(false);
    }
  };

  const handleEditBank = (bank: any) => {
    setEditingBankData({
      _id: bank._id,
      name: bank.name,
      accountNumber: bank.accountNumber,
      accountHolder: bank.accountHolder,
      branch: bank.branch || '',
      status: bank.status || 'active'
    });
    setEditingBank(true);
  };

  const handleUpdateBank = async () => {
    if (!editingBankData || !editingBankData.name || !editingBankData.accountNumber || !editingBankData.accountHolder) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng điền đầy đủ thông tin bắt buộc',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/banks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editingBankData)
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Thành công',
          description: 'Đã cập nhật ngân hàng',
        });
        setEditingBank(false);
        setEditingBankData(null);
        loadBanks();
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.error || 'Không thể cập nhật ngân hàng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating bank:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật ngân hàng',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteBank = async (bank: any) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ngân hàng ${bank.name}?\n\nSố tài khoản: ${bank.accountNumber}\n\nHành động này không thể hoàn tác!`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/banks?id=${bank._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Thành công',
          description: 'Đã xóa ngân hàng',
        });
        loadBanks();
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.error || 'Không thể xóa ngân hàng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting bank:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xóa ngân hàng',
        variant: 'destructive',
      });
    }
  };

  const resetNewBankForm = () => {
    setNewBank({
      name: '',
      accountNumber: '',
      accountHolder: '',
      branch: ''
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-blue-700">Đang tải danh sách ngân hàng...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Bank Form */}
      <Card>
        <CardHeader>
          <CardTitle>Thêm ngân hàng mới</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bankName">Tên ngân hàng *</Label>
              <Input
                id="bankName"
                placeholder="VD: Vietcombank"
                value={newBank.name}
                onChange={(e) => setNewBank({...newBank, name: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="accountNumber">Số tài khoản *</Label>
              <Input
                id="accountNumber"
                placeholder="Số tài khoản"
                value={newBank.accountNumber}
                onChange={(e) => setNewBank({...newBank, accountNumber: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="accountHolder">Chủ tài khoản *</Label>
              <Input
                id="accountHolder"
                placeholder="Tên chủ tài khoản"
                value={newBank.accountHolder}
                onChange={(e) => setNewBank({...newBank, accountHolder: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="branch">Chi nhánh</Label>
              <Input
                id="branch"
                placeholder="Chi nhánh (tùy chọn)"
                value={newBank.branch}
                onChange={(e) => setNewBank({...newBank, branch: e.target.value})}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button 
              onClick={handleAddBank} 
              disabled={addingBank || !newBank.name || !newBank.accountNumber || !newBank.accountHolder}
            >
              {addingBank ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {addingBank ? 'Đang thêm...' : 'Thêm ngân hàng'}
            </Button>
            <Button 
              variant="outline" 
              onClick={resetNewBankForm}
              disabled={addingBank}
            >
              <X className="h-4 w-4 mr-2" />
              Xóa form
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Banks List */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách ngân hàng ({banks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {banks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Chưa có ngân hàng nào được thêm</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên ngân hàng</TableHead>
                  <TableHead>Số tài khoản</TableHead>
                  <TableHead>Chủ tài khoản</TableHead>
                  <TableHead>Chi nhánh</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {banks.map((bank: any) => (
                  <TableRow key={bank._id}>
                    <TableCell className="font-medium">{bank.name}</TableCell>
                    <TableCell className="font-mono">{bank.accountNumber}</TableCell>
                    <TableCell>{bank.accountHolder}</TableCell>
                    <TableCell>{bank.branch || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={bank.status === 'active' ? 'default' : 'secondary'}>
                        {bank.status === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditBank(bank)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteBank(bank)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Bank Dialog */}
      <Dialog open={editingBank} onOpenChange={setEditingBank}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa ngân hàng</DialogTitle>
          </DialogHeader>
          {editingBankData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editBankName">Tên ngân hàng *</Label>
                <Input
                  id="editBankName"
                  placeholder="VD: Vietcombank"
                  value={editingBankData.name}
                  onChange={(e) => setEditingBankData({...editingBankData, name: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="editAccountNumber">Số tài khoản *</Label>
                <Input
                  id="editAccountNumber"
                  placeholder="Số tài khoản"
                  value={editingBankData.accountNumber}
                  onChange={(e) => setEditingBankData({...editingBankData, accountNumber: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="editAccountHolder">Chủ tài khoản *</Label>
                <Input
                  id="editAccountHolder"
                  placeholder="Tên chủ tài khoản"
                  value={editingBankData.accountHolder}
                  onChange={(e) => setEditingBankData({...editingBankData, accountHolder: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="editBranch">Chi nhánh</Label>
                <Input
                  id="editBranch"
                  placeholder="Chi nhánh (tùy chọn)"
                  value={editingBankData.branch}
                  onChange={(e) => setEditingBankData({...editingBankData, branch: e.target.value})}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="editStatus">Trạng thái</Label>
                <Select
                  value={editingBankData.status}
                  onValueChange={(value) => setEditingBankData({...editingBankData, status: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Hoạt động</SelectItem>
                    <SelectItem value="inactive">Không hoạt động</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBank(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleUpdateBank}
              disabled={!editingBankData?.name || !editingBankData?.accountNumber || !editingBankData?.accountHolder}
            >
              <Save className="h-4 w-4 mr-2" />
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
