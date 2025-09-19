import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    // Xác thực admin
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokenData = await verifyToken(token);
    if (!tokenData?.isValid) {
      return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 401 });
    }
    
    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ error: 'Không thể kết nối database' }, { status: 500 });
    }
    
    // Kiểm tra quyền admin
    const admin = await db.collection('users').findOne({ _id: new ObjectId(tokenData.userId) });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    console.log('📊 Calculating admin stats...');

    // Lấy thống kê cơ bản
    const totalUsers = await db.collection('users').countDocuments();
    console.log('👥 Total users:', totalUsers);
    
    const activeUsers = await db.collection('users').countDocuments({ 'status.active': true });
    console.log('✅ Active users:', activeUsers);
    
    // Tính tổng nạp tiền và rút tiền
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    
    try {
      // Kiểm tra xem có collection deposits không
      const collections = await db.listCollections().toArray();
      const hasDeposits = collections.some(c => c.name === 'deposits');
      console.log('💰 Has deposits collection:', hasDeposits);
      
      if (hasDeposits) {
        // Thử các status khác nhau
        const depositsApproved = await db.collection('deposits').aggregate([
          { $match: { status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();
        
        const depositsCompleted = await db.collection('deposits').aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();
        
        const depositsVietnamese = await db.collection('deposits').aggregate([
          { $match: { status: 'Đã duyệt' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();
        
        // Kiểm tra tất cả deposits để xem status có gì
        const allDeposits = await db.collection('deposits').find({}).limit(5).toArray();
        console.log('📝 Sample deposits:', allDeposits.map(d => ({ status: d.status, amount: d.amount })));
        
        let approvedTotal = depositsApproved.length > 0 ? depositsApproved[0].total : 0;
        let completedTotal = depositsCompleted.length > 0 ? depositsCompleted[0].total : 0;
        let vietnameseTotal = depositsVietnamese.length > 0 ? depositsVietnamese[0].total : 0;
        
        totalDeposits = Math.max(approvedTotal, completedTotal, vietnameseTotal);
        
        console.log('💵 Deposits totals:', {
          approved: approvedTotal,
          completed: completedTotal,
          vietnamese: vietnameseTotal,
          final: totalDeposits
        });
      }
    } catch (error) {
      console.log('❌ Error calculating deposits:', error);
    }
    
    try {
      // Kiểm tra withdrawals
      const collections = await db.listCollections().toArray();
      const hasWithdrawals = collections.some(c => c.name === 'withdrawals');
      console.log('🏦 Has withdrawals collection:', hasWithdrawals);
      
      if (hasWithdrawals) {
        const withdrawalsApproved = await db.collection('withdrawals').aggregate([
          { $match: { status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();
        
        const withdrawalsCompleted = await db.collection('withdrawals').aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();
        
        const withdrawalsVietnamese = await db.collection('withdrawals').aggregate([
          { $match: { status: 'Đã duyệt' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();
        
        let approvedTotal = withdrawalsApproved.length > 0 ? withdrawalsApproved[0].total : 0;
        let completedTotal = withdrawalsCompleted.length > 0 ? withdrawalsCompleted[0].total : 0;
        let vietnameseTotal = withdrawalsVietnamese.length > 0 ? withdrawalsVietnamese[0].total : 0;
        
        totalWithdrawals = Math.max(approvedTotal, completedTotal, vietnameseTotal);
        
        console.log('💸 Withdrawals totals:', {
          approved: approvedTotal,
          completed: completedTotal,
          vietnamese: vietnameseTotal,
          final: totalWithdrawals
        });
      }
    } catch (error) {
      console.log('❌ Error calculating withdrawals:', error);
    }

    const stats = {
      totalUsers,
      activeUsers,
      totalDeposits,
      totalWithdrawals
    };

    console.log('📈 Final stats:', stats);

    return NextResponse.json(stats);
    
  } catch (error) {
    console.error('❌ Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
