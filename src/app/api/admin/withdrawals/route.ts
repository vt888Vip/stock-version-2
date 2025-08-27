import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// API để admin lấy danh sách yêu cầu rút tiền
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

    // Lấy danh sách yêu cầu rút tiền
    const withdrawals = await db.collection('withdrawals')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
    const withdrawalsWithBalance = await Promise.all(
      withdrawals.map(async (withdrawal) => {
        const user = await db.collection('users').findOne({ _id: withdrawal.user });
        if (user) {
          let userBalance = user.balance || { available: 0, frozen: 0 };
          
          // Nếu balance là number (kiểu cũ), chuyển đổi thành object
          if (typeof userBalance === 'number') {
            userBalance = {
              available: userBalance,
              frozen: 0
            };
            
            // Cập nhật database để chuyển đổi sang kiểu mới
            await db.collection('users').updateOne(
              { _id: withdrawal.user },
              { 
                $set: { 
                  balance: userBalance,
                  updatedAt: new Date()
                } 
              }
            );
            
            console.log(`🔄 [WITHDRAWAL ADMIN MIGRATION] User ${user.username}: Chuyển đổi balance từ number sang object`);
          }
          
          return { ...withdrawal, userBalance: userBalance.available || 0 };
        }
        return withdrawal;
      })
    );

    return NextResponse.json({
      success: true,
      withdrawals: withdrawalsWithBalance
    });

  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi lấy danh sách yêu cầu rút tiền' }, { status: 500 });
  }
}

// API để admin xử lý yêu cầu rút tiền
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
      // ✅ TIỀN ĐÃ BỊ TRỪ KHI USER RÚT - CHỈ CẬP NHẬT TRẠNG THÁI
      console.log(`[ADMIN WITHDRAWALS] Duyệt yêu cầu rút tiền ${withdrawal.amount} VND của user ${withdrawal.username} - Tiền đã bị trừ trước đó`);
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

    // Nếu từ chối, cần trả lại tiền cho user vì tiền đã bị trừ khi rút
    if (action === 'reject') {
      const user = await db.collection('users').findOne({ _id: withdrawal.user });
      if (user) {
        // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
        let userBalance = user.balance || { available: 0, frozen: 0 };
        
        // Nếu balance là number (kiểu cũ), chuyển đổi thành object
        if (typeof userBalance === 'number') {
          userBalance = {
            available: userBalance,
            frozen: 0
          };
          
          console.log(`🔄 [WITHDRAWAL REJECT MIGRATION] User ${user.username}: Chuyển đổi balance từ number sang object`);
        }
        
        const currentAvailable = userBalance.available || 0;
        const newAvailableBalance = currentAvailable + withdrawal.amount;
        
        const newBalance = {
          ...userBalance,
          available: newAvailableBalance
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
        
        console.log(`💰 [ADMIN WITHDRAWALS] Đã từ chối và trả lại ${withdrawal.amount} VND cho user ${user.username}. Số dư cũ: ${currentAvailable} VND, Số dư mới: ${newAvailableBalance} VND`);
      }
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'Đã duyệt yêu cầu rút tiền' : 'Đã từ chối yêu cầu rút tiền'
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi xử lý yêu cầu rút tiền' }, { status: 500 });
  }
}
