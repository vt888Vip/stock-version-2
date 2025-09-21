import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '20');
      const date = searchParams.get('date') || '';
      const dateFrom = searchParams.get('dateFrom') || '';
      const dateTo = searchParams.get('dateTo') || '';
      const username = searchParams.get('username') || '';
      const sessionId = searchParams.get('sessionId') || '';
      const status = searchParams.get('status') || '';
      const direction = searchParams.get('direction') || '';
      const amountMin = searchParams.get('amountMin') || '';
      const amountMax = searchParams.get('amountMax') || '';
      const skip = (page - 1) * limit;

      const db = await getMongoDb();
      if (!db) {
        throw new Error('Could not connect to database');
      }

      // Build query
      const query: any = {};
      
      // Date filtering
      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        
        query.createdAt = {
          $gte: startOfDay,
          $lte: endOfDay
        };
      } else if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) {
          const startDate = new Date(dateFrom);
          startDate.setHours(0, 0, 0, 0);
          query.createdAt.$gte = startDate;
        }
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }

      // Status filtering
      if (status) {
        query.status = status;
      }

      // Direction filtering
      if (direction) {
        query.direction = direction;
      }

      // Amount filtering
      if (amountMin || amountMax) {
        query.amount = {};
        if (amountMin) {
          query.amount.$gte = parseInt(amountMin);
        }
        if (amountMax) {
          query.amount.$lte = parseInt(amountMax);
        }
      }

      // Get paginated results with user information and search
      const aggregationPipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 1,
            sessionId: 1,
            direction: 1,
            amount: 1,
            status: 1,
            result: 1,
            profit: 1,
            createdAt: 1,
            updatedAt: 1,
            completedAt: 1,
            'user.username': 1,
            'user.email': 1,
            'user._id': 1
          }
        }
      ];

      // Add search filters
      if (username) {
        aggregationPipeline.push({
          $match: {
            'user.username': { $regex: username, $options: 'i' }
          }
        });
      }

      if (sessionId) {
        aggregationPipeline.push({
          $match: {
            sessionId: { $regex: sessionId, $options: 'i' }
          }
        });
      }

      // Get total count for pagination
      const totalPipeline = [...aggregationPipeline, { $count: 'total' }];
      const totalResult = await db.collection('trades').aggregate(totalPipeline).toArray();
      const total = totalResult.length > 0 ? totalResult[0].total : 0;

      // Add sorting and pagination
      aggregationPipeline.push(
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      );

      const trades = await db.collection('trades').aggregate(aggregationPipeline).toArray();

      // Format the data for frontend
      const formattedOrders = trades.map(trade => ({
        _id: trade._id,
        username: trade.user?.username || 'Unknown',
        email: trade.user?.email || '',
        userId: trade.user?._id,
        sessionId: trade.sessionId,
        type: trade.direction === 'UP' ? 'LÊN' : 'XUỐNG',
        direction: trade.direction,
        amount: trade.amount,
        status: trade.status,
        result: trade.result,
        profit: trade.profit || 0,
        createdAt: trade.createdAt,
        updatedAt: trade.updatedAt,
        completedAt: trade.completedAt
      }));

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return NextResponse.json({
        success: true,
        orders: formattedOrders,
        pagination: {
          currentPage: page,
          totalPages,
          totalOrders: total,
          ordersPerPage: limit,
          hasNextPage,
          hasPrevPage
        }
      });

    } catch (error) {
      console.error('Error fetching orders:', error);
      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
