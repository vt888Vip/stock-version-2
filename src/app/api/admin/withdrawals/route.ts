import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// API để admin lấy danh sách yêu cầu rút tiền với phân trang
export async function GET(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }

    // Kiểm tra quyền admin
    const db = await getMongoDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    // Lấy tham số phân trang và tìm kiếm
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const amountMin = searchParams.get('amountMin') || '';
    const amountMax = searchParams.get('amountMax') || '';

    // Xây dựng query filter
    const filter: any = {};
    
    // Tìm kiếm theo username
    if (search) {
      // Tìm user theo username trước
      const users = await db.collection('users').find({
        username: { $regex: search, $options: 'i' }
      }).toArray();
      
      if (users.length > 0) {
        filter.user = { $in: users.map(u => u._id) };
      } else {
        // Nếu không tìm thấy user nào, trả về empty result
        filter.user = { $in: [] };
      }
    }

    // Lọc theo trạng thái
    if (status) {
      filter.status = status;
    }

    // Lọc theo khoảng thời gian
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }

    // Lọc theo khoảng số tiền
    if (amountMin || amountMax) {
      filter.amount = {};
      if (amountMin) {
        filter.amount.$gte = parseInt(amountMin);
      }
      if (amountMax) {
        filter.amount.$lte = parseInt(amountMax);
      }
    }

    // Tính toán skip
    const skip = (page - 1) * limit;

    // Lấy tổng số withdrawals (cho pagination)
    const totalWithdrawals = await db.collection('withdrawals').countDocuments(filter);

    // Lấy danh sách yêu cầu rút tiền với phân trang
    const withdrawals = await db.collection('withdrawals')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Thêm thông tin user cho mỗi withdrawal
    const withdrawalsWithUserInfo = await Promise.all(
      withdrawals.map(async (withdrawal) => {
        const user = await db.collection('users').findOne({ _id: withdrawal.user });
        if (user) {
          const userBalance = user.balance || { available: 0, frozen: 0 };
          const availableBalance = typeof userBalance === 'number' ? userBalance : userBalance.available || 0;
          return { 
            ...withdrawal, 
            username: user.username,
            email: user.email,
            userBalance: availableBalance,
            bank: user.bank || {}
          };
        }
        return withdrawal;
      })
    );

    // Tính toán thông tin phân trang
    const totalPages = Math.ceil(totalWithdrawals / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      success: true,
      withdrawals: withdrawalsWithUserInfo,
      pagination: {
        currentPage: page,
        totalPages,
        totalWithdrawals,
        withdrawalsPerPage: limit,
        hasNextPage,
        hasPrevPage
      }
    });

  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi lấy danh sách yêu cầu rút tiền' }, { status: 500 });
  }
}

// API để admin xử lý yêu cầu rút tiền
// Lưu ý: 
// - Khi duyệt: chỉ thay đổi trạng thái (tiền đã bị trừ khi user tạo yêu cầu)
// - Khi từ chối: hoàn lại tiền cho user + thay đổi trạng thái
export async function POST(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }

    // Kiểm tra quyền admin
    const db = await getMongoDb();
    const admin = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    // Parse request body
    const { withdrawalId, action, notes } = await req.json();
    console.log('[ADMIN WITHDRAWALS] Nhận request:', { withdrawalId, action, notes });

    if (!withdrawalId || !action) {
      console.log('[ADMIN WITHDRAWALS] Thiếu thông tin:', { withdrawalId, action });
      return NextResponse.json({ message: 'Thiếu thông tin cần thiết' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      console.log('[ADMIN WITHDRAWALS] Hành động không hợp lệ:', action);
      return NextResponse.json({ message: 'Hành động không hợp lệ' }, { status: 400 });
    }

    // Lấy thông tin yêu cầu rút tiền
    const withdrawal = await db.collection('withdrawals').findOne({ withdrawalId });
    console.log('[ADMIN WITHDRAWALS] Kết quả truy vấn withdrawal:', withdrawal);
    if (!withdrawal) {
      return NextResponse.json({ message: 'Không tìm thấy yêu cầu rút tiền', debug: { withdrawalId } }, { status: 404 });
    }

    if (withdrawal.status !== 'Chờ duyệt') {
      return NextResponse.json({ message: 'Yêu cầu rút tiền đã được xử lý' }, { status: 400 });
    }

    if (action === 'approve') {
      // Lấy thông tin user để log
      const user = await db.collection('users').findOne({ _id: withdrawal.user });
      if (user) {
        console.log(`[ADMIN WITHDRAWALS] Đã duyệt yêu cầu rút tiền ${withdrawal.amount} VND của user ${user.username}`);
      }
    }

    // Cập nhật trạng thái yêu cầu rút tiền
    const updateData = {
      status: action === 'approve' ? 'Đã duyệt' : 'Từ chối',
      notes: notes || '',
      updatedAt: new Date(),
      processedBy: admin.username,
      processedAt: new Date()
    };

    await db.collection('withdrawals').updateOne(
      { withdrawalId },
      { $set: updateData }
    );

    // Nếu từ chối, cần hoàn lại tiền cho user
    if (action === 'reject') {
      console.log(`[ADMIN WITHDRAWALS] Đã từ chối yêu cầu rút tiền ${withdrawal.amount} VND của user ${withdrawal.username}`);
      
      // Hoàn lại tiền cho user
      const user = await db.collection('users').findOne({ _id: withdrawal.user });
      if (user) {
        // Chuẩn hóa balance format
        let userBalance = user.balance || { available: 0, frozen: 0 };
        if (typeof userBalance === 'number') {
          userBalance = {
            available: userBalance,
            frozen: 0
          };
        }
        
        // Hoàn lại tiền vào available balance
        const newBalance = {
          ...userBalance,
          available: (userBalance.available || 0) + withdrawal.amount
        };
        
        await db.collection('users').updateOne(
          { _id: withdrawal.user },
          { 
            $set: { 
              balance: newBalance,
              updatedAt: new Date()
            } 
          }
        );
        
        console.log(`[ADMIN WITHDRAWALS] Đã hoàn lại ${withdrawal.amount} VND cho user ${user.username}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' 
        ? 'Đã duyệt yêu cầu rút tiền' 
        : 'Đã từ chối yêu cầu rút tiền và hoàn lại tiền cho người dùng'
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi xử lý yêu cầu rút tiền' }, { status: 500 });
  }
}
