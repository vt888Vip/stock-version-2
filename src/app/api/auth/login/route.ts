import { NextResponse } from 'next/server';
import { comparePassword } from '@/lib/auth';
import { getMongoDb } from '@/lib/db';
import { generateToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: 'Tên đăng nhập và mật khẩu là bắt buộc' },
        { status: 400 }
      );
    }

    const db = await getMongoDb();
    const user = await db.collection('users').findOne({ username });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng' },
        { status: 401 }
      );
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng' },
        { status: 401 }
      );
    }

    // Generate token
    const token = generateToken(user._id.toString());
    
    // Prepare response
    const response = NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token: token
    });
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi hệ thống' },
      { status: 500 }
    );
  }
}
