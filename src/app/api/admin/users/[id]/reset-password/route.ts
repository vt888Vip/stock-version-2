import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import bcrypt from 'bcrypt';
import { verifyToken } from '@/lib/auth';
import mongoose from 'mongoose';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('🔍 Reset password request for user ID:', params.id);
    
    // Verify admin token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'Token không hợp lệ' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return NextResponse.json(
        { success: false, message: 'Token không hợp lệ' },
        { status: 401 }
      );
    }

    // Get request body
    const { newPassword } = await request.json();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
        { status: 400 }
      );
    }

    // Connect to database
    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json(
        { success: false, message: 'Không thể kết nối database' },
        { status: 500 }
      );
    }

    // Try to find user with different ID formats
    let user = null;
    let userId: mongoose.Types.ObjectId | string | null = null;

    // First try with ObjectId
    try {
      const objectId = new mongoose.Types.ObjectId(params.id);
      console.log('✅ Converted ID to ObjectId:', objectId);
      user = await db.collection('users').findOne({ _id: objectId });
      if (user) {
        userId = objectId;
      }
    } catch (error) {
      console.log('❌ Invalid ObjectId format, trying string ID');
    }

    // If not found with ObjectId, try with string ID
    if (!user) {
      console.log('🔍 Trying to find user with string ID:', params.id);
      user = await db.collection('users').findOne({ _id: params.id } as any);
      if (user) {
        userId = params.id; // Use string ID for update
        console.log('✅ Found user with string ID');
      }
    }

    if (!user) {
      console.log('❌ User not found with any ID format');
      return NextResponse.json(
        { success: false, message: 'Không tìm thấy người dùng' },
        { status: 404 }
      );
    }

    console.log('✅ Found user:', user.username);

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password using the correct ID format
    const result = await db.collection('users').updateOne(
      { _id: userId } as any,
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, message: 'Không thể cập nhật mật khẩu' },
        { status: 500 }
      );
    }

    console.log('✅ Password updated successfully for user:', user.username);

    return NextResponse.json({
      success: true,
      message: `Đã đổi mật khẩu cho ${user.username} thành công`
    });

  } catch (error) {
    console.error('❌ Error resetting password:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi server' },
      { status: 500 }
    );
  }
} 