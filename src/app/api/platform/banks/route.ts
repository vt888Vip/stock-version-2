import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import Bank from '@/models/Bank';

export async function GET(req: NextRequest) {
  try {
    // Lấy token từ header hoặc cookie
    let token = req.headers.get('authorization')?.split(' ')[1];
    
    // Nếu không có token trong header, thử lấy từ cookie
    if (!token) {
      const cookieHeader = req.headers.get('cookie');
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [name, value] = cookie.trim().split('=');
          acc[name] = value;
          return acc;
        }, {} as Record<string, string>);
        
        token = cookies['token'] || cookies['authToken'];
      }
    }
    
    // Nếu không có token trong localStorage, thử lấy từ cookie
    if (!token) {
      return NextResponse.json({ 
        success: false, 
        message: 'Bạn cần đăng nhập' 
      }, { status: 401 });
    }

    const tokenData = await verifyToken(token);
    if (!tokenData?.isValid) {
      return NextResponse.json({ 
        success: false, 
        message: 'Phiên đăng nhập hết hạn' 
      }, { status: 401 });
    }

    // Kết nối đến MongoDB
    await connectToDatabase();

    // Lấy thông tin ngân hàng của nền tảng từ collection banks
    const platformBanks = await Bank.find({ status: 'active' }).lean();
    console.log('Found banks:', platformBanks.length);
    
    console.log('Raw banks data:', platformBanks);

    return NextResponse.json({
      success: true,
      banks: platformBanks.map(bank => ({
        bankName: bank.name,
        accountNumber: bank.accountNumber,
        accountHolder: bank.accountHolder,
        branch: bank.branch || '',
        isActive: bank.status === 'active'
      })).filter(bank => bank.isActive && bank.bankName && bank.accountNumber) // Chỉ trả về các ngân hàng đang hoạt động và có đủ thông tin
    });
  } catch (error) {
    console.error('Error fetching platform banks:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Có lỗi xảy ra khi lấy thông tin ngân hàng' 
    }, { status: 500 });
  }
}
