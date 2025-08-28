import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    // Kiểm tra quyền admin (có thể thêm middleware sau)
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lấy thống kê cơ bản
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ 'status.active': true });
    
    // Tính tổng nạp tiền và rút tiền (nếu có collection deposits/withdrawals)
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    
    try {
      const deposits = await User.aggregate([
        { $match: { status: 'Đã duyệt' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      
      if (deposits.length > 0) {
        totalDeposits = deposits[0].total;
      }
    } catch (error) {
      console.log('No deposits collection or error:', error);
    }
    
    try {
      const withdrawals = await User.aggregate([
        { $match: { status: 'Đã duyệt' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      
      if (withdrawals.length > 0) {
        totalWithdrawals = withdrawals[0].total;
      }
    } catch (error) {
      console.log('No withdrawals collection or error:', error);
    }

    return NextResponse.json({
      totalUsers,
      activeUsers,
      totalDeposits,
      totalWithdrawals
    });
    
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
