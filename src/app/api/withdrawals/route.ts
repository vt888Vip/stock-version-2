import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// API để tạo yêu cầu rút tiền mới
export async function POST(req: NextRequest) {
  try {
    
    // Xác thực người dùng
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }
    

    // Parse request body
    const body = await req.json();
    
    const { amount, bankName, accountNumber, accountHolder } = body;

    if (!amount || !bankName || !accountNumber || !accountHolder) {
      return NextResponse.json({ message: 'Thiếu thông tin cần thiết' }, { status: 400 });
    }

    // Kết nối DB
    const db = await getMongoDb();

    // Lấy thông tin người dùng
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json({ message: 'Không tìm thấy người dùng' }, { status: 404 });
    }

    // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
    let userBalance = user.balance || { available: 0, frozen: 0 };
    
    // Nếu balance là number (kiểu cũ), chuyển đổi thành object
    if (typeof userBalance === 'number') {
      userBalance = {
        available: userBalance,
        frozen: 0
      };
      
    }
    
    const currentAvailable = userBalance.available || 0;
    
    // Kiểm tra số dư
    if (currentAvailable < amount) {
      return NextResponse.json({ message: 'Số dư không đủ' }, { status: 400 });
    }

    // ✅ TRỪ TIỀN NGAY LẬP TỨC khi user rút tiền
    const newAvailableBalance = currentAvailable - amount;
    const newBalance = {
      ...userBalance,
      available: newAvailableBalance
    };
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          balance: newBalance,
          updatedAt: new Date()
        } 
      }
    );
    

    // Tạo yêu cầu rút tiền mới với ID theo định dạng RUT-username-timestamp
    const timestamp = new Date().getTime();
    const username = user.username || 'user';
    const withdrawalId = `RUT-${username}-${timestamp}`;

    const withdrawal = {
      withdrawalId,
      user: new ObjectId(userId),
      username: user.username,
      amount,
      bankName,
      bankAccountNumber: accountNumber,
      accountHolder: accountHolder,
      status: 'Chờ duyệt',
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('withdrawals').insertOne(withdrawal);

    return NextResponse.json({
      message: 'Yêu cầu rút tiền đã được gửi và tiền đã bị trừ khỏi tài khoản. Vui lòng chờ admin xét duyệt.',
      withdrawalId: result.insertedId
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi tạo yêu cầu rút tiền' }, { status: 500 });
  }
}
