import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    // Kiểm tra quyền admin
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lấy lịch sử giao dịch (deposits và withdrawals)
    const deposits = await User.find({}, { password: 0 })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const withdrawals = await User.find({}, { password: 0 })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Kết hợp và format dữ liệu
    const transactions = [
      ...deposits.map((deposit: any) => ({
        _id: deposit._id,
        username: deposit.username,
        type: 'deposit',
        amount: deposit.amount,
        status: deposit.status,
        note: deposit.note,
        createdAt: deposit.createdAt
      })),
      ...withdrawals.map((withdrawal: any) => ({
        _id: withdrawal._id,
        withdrawalId: withdrawal.withdrawalId, // thêm trường này để frontend dùng
        username: withdrawal.username,
        type: 'withdrawal',
        amount: withdrawal.amount,
        status: withdrawal.status,
        note: withdrawal.note,
        createdAt: withdrawal.createdAt
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      transactions
    });
    
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 