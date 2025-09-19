import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// GET: Lấy danh sách yêu cầu nạp tiền
export async function GET(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const tokenData = await verifyToken(token);
    if (!tokenData?.isValid) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }
    
    const db = await getMongoDb();
    
    // Kiểm tra quyền admin
    const admin = await db.collection('users').findOne({ _id: new ObjectId(tokenData.userId) });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    // Lấy danh sách yêu cầu nạp tiền
    const deposits = await db.collection('deposits')
      .aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: '$userInfo'
        },
        {
          $project: {
            _id: 1,
            depositId: 1,
            amount: 1,
            status: 1,
            proofImage: 1,
            bankInfo: 1,
            createdAt: 1,
            updatedAt: 1,
            username: '$userInfo.username',
            userEmail: '$userInfo.email'
          }
        },
        {
          $sort: { createdAt: -1 }
        }
      ]).toArray();

    return NextResponse.json({ deposits });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi lấy danh sách nạp tiền' }, { status: 500 });
  }
}

// POST: Duyệt yêu cầu nạp tiền hoặc nạp tiền thủ công
export async function POST(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const tokenData = await verifyToken(token);
    if (!tokenData?.isValid) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }
    
    const db = await getMongoDb();
    
    // Kiểm tra quyền admin
    const admin = await db.collection('users').findOne({ _id: new ObjectId(tokenData.userId) });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    const body = await req.json();
    
    console.log('Received request body:', body);
    
    // Kiểm tra xem có phải nạp tiền thủ công không
    if (body.userId && body.amount) {
      // Nạp tiền thủ công
      const { userId, amount, note } = body;
      
      console.log('Manual deposit - userId:', userId, 'amount:', amount, 'note:', note);
      
      if (!userId || !amount) {
        console.log('Missing required fields - userId:', userId, 'amount:', amount);
        return NextResponse.json({ message: 'Thiếu thông tin cần thiết' }, { status: 400 });
      }

      // Validate amount
      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        return NextResponse.json({ message: 'Số tiền không hợp lệ' }, { status: 400 });
      }

      // Kiểm tra user tồn tại
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user) {
        console.log('User not found for ID:', userId);
        return NextResponse.json({ message: 'Không tìm thấy người dùng' }, { status: 404 });
      }

      console.log('Found user:', user.username);

      // Tính balance mới
      const userBalance = user.balance || { available: 0, frozen: 0 };
      const currentAvailable = typeof userBalance === 'number' ? userBalance : userBalance.available || 0;
      const newAvailableBalance = currentAvailable + amountValue;

      console.log('Balance update - current:', currentAvailable, 'new:', newAvailableBalance);

      // Cộng tiền vào tài khoản người dùng
      await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { 
          $set: { 
            balance: {
              available: newAvailableBalance,
              frozen: typeof userBalance === 'number' ? 0 : userBalance.frozen || 0
            },
            updatedAt: new Date()
          }
        }
      );

      // Tạo giao dịch
      await db.collection('transactions').insertOne({
        userId: new ObjectId(userId),
        username: user.username,
        type: 'deposit',
        amount: amountValue,
        status: 'completed',
        note: `Nạp tiền thủ công - ${note || 'Được nạp bởi admin'}`,
        createdAt: new Date()
      });

      console.log('Manual deposit completed successfully');

      return NextResponse.json({ 
        message: 'Đã nạp tiền thành công',
        userId: userId,
        amount: amountValue
      });
    }

    // Xử lý duyệt/từ chối yêu cầu nạp tiền
    const { depositId, action, note } = body; // action: 'approve' | 'reject'

    if (!depositId || !action) {
      return NextResponse.json({ message: 'Thiếu thông tin cần thiết' }, { status: 400 });
    }

    // Tìm yêu cầu nạp tiền
    const deposit = await db.collection('deposits').findOne({ _id: new ObjectId(depositId) });
    if (!deposit) {
      return NextResponse.json({ message: 'Không tìm thấy yêu cầu nạp tiền' }, { status: 404 });
    }

    if (deposit.status !== 'CHO XU LY') {
      return NextResponse.json({ message: 'Yêu cầu này đã được xử lý' }, { status: 400 });
    }

    if (action === 'approve') {
      // Cập nhật trạng thái yêu cầu nạp tiền
      await db.collection('deposits').updateOne(
        { _id: new ObjectId(depositId) },
        { 
          $set: { 
            status: 'DA DUYET',
            approvedBy: new ObjectId(tokenData.userId),
            approvedAt: new Date(),
            adminNote: note || ''
          }
        }
      );

      // Lấy thông tin user hiện tại
      const userData = await db.collection('users').findOne({ _id: deposit.user });
      if (!userData) {
        return NextResponse.json({ message: 'Không tìm thấy người dùng' }, { status: 404 });
      }

      // Tính balance mới
      const userBalance = userData.balance || { available: 0, frozen: 0 };
      const currentAvailable = typeof userBalance === 'number' ? userBalance : userBalance.available || 0;
      const newAvailableBalance = currentAvailable + deposit.amount;

      // Cộng tiền vào tài khoản người dùng
      await db.collection('users').updateOne(
        { _id: deposit.user },
        { 
          $set: { 
            balance: {
              available: newAvailableBalance,
              frozen: typeof userBalance === 'number' ? 0 : userBalance.frozen || 0
            },
            updatedAt: new Date()
          }
        }
      );

      // Tạo giao dịch
      await db.collection('transactions').insertOne({
        userId: deposit.user,
        username: deposit.username,
        type: 'deposit',
        amount: deposit.amount,
        status: 'completed',
        note: `Nạp tiền - ${note || 'Được duyệt bởi admin'}`,
        depositId: deposit.depositId,
        createdAt: new Date()
      });

      return NextResponse.json({ 
        message: 'Đã duyệt yêu cầu nạp tiền thành công',
        depositId: depositId
      });

    } else if (action === 'reject') {
      // Cập nhật trạng thái yêu cầu nạp tiền
      await db.collection('deposits').updateOne(
        { _id: new ObjectId(depositId) },
        { 
          $set: { 
            status: 'TU CHOI',
            rejectedBy: new ObjectId(tokenData.userId),
            rejectedAt: new Date(),
            adminNote: note || ''
          }
        }
      );

      return NextResponse.json({ 
        message: 'Đã từ chối yêu cầu nạp tiền',
        depositId: depositId
      });

    } else {
      return NextResponse.json({ message: 'Hành động không hợp lệ' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error processing deposit:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi xử lý yêu cầu nạp tiền' }, { status: 500 });
  }
}
