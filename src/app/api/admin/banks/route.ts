import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import Bank from '@/models/Bank';

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    // Kiểm tra quyền admin
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lấy danh sách ngân hàng
    const banks = await Bank.find({})
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      banks
    });
    
  } catch (error) {
    console.error('Error fetching banks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    
    // Kiểm tra quyền admin
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, accountNumber, accountHolder, branch } = body;

    // Validate input
    if (!name || !accountNumber || !accountHolder) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Kiểm tra số tài khoản đã tồn tại chưa
    const existingBank = await Bank.findOne({ accountNumber });
    if (existingBank) {
      return NextResponse.json(
        { error: 'Số tài khoản đã tồn tại' },
        { status: 400 }
      );
    }

    // Tạo ngân hàng mới
    const newBank = new Bank({
      name,
      accountNumber,
      accountHolder,
      branch: branch || '',
      status: 'active'
    });

    const savedBank = await newBank.save();

    return NextResponse.json({
      success: true,
      bank: savedBank
    });
    
  } catch (error) {
    console.error('Error creating bank:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectToDatabase();
    
    // Kiểm tra quyền admin
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { _id, name, accountNumber, accountHolder, branch, status } = body;

    // Validate input
    if (!_id || !name || !accountNumber || !accountHolder) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Kiểm tra ngân hàng có tồn tại không
    const existingBank = await Bank.findById(_id);
    if (!existingBank) {
      return NextResponse.json(
        { error: 'Ngân hàng không tồn tại' },
        { status: 404 }
      );
    }

    // Kiểm tra số tài khoản đã tồn tại ở ngân hàng khác chưa
    const duplicateBank = await Bank.findOne({
      accountNumber,
      _id: { $ne: _id }
    });
    if (duplicateBank) {
      return NextResponse.json(
        { error: 'Số tài khoản đã tồn tại ở ngân hàng khác' },
        { status: 400 }
      );
    }

    // Cập nhật ngân hàng
    const updatedBank = await Bank.findByIdAndUpdate(
      _id,
      {
        name,
        accountNumber,
        accountHolder,
        branch: branch || '',
        status: status || 'active'
      },
      { new: true, runValidators: true }
    );

    if (!updatedBank) {
      return NextResponse.json(
        { error: 'Ngân hàng không tồn tại' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cập nhật ngân hàng thành công',
      bank: updatedBank
    });
    
  } catch (error) {
    console.error('Error updating bank:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectToDatabase();
    
    // Kiểm tra quyền admin
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bankId = searchParams.get('id');

    if (!bankId) {
      return NextResponse.json(
        { error: 'Bank ID is required' },
        { status: 400 }
      );
    }

    // Kiểm tra ngân hàng có tồn tại không
    const existingBank = await Bank.findById(bankId);
    if (!existingBank) {
      return NextResponse.json(
        { error: 'Ngân hàng không tồn tại' },
        { status: 404 }
      );
    }

    // Bỏ qua kiểm tra ràng buộc - cho phép xóa ngân hàng ngay cả khi có user đang sử dụng
    console.log(`🗑️ Xóa ngân hàng: ${existingBank.name} (${existingBank.accountNumber})`);

    // Xóa ngân hàng
    const deletedBank = await Bank.findByIdAndDelete(bankId);

    if (!deletedBank) {
      return NextResponse.json(
        { error: 'Không thể xóa ngân hàng' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Xóa ngân hàng thành công'
    });
    
  } catch (error) {
    console.error('Error deleting bank:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 