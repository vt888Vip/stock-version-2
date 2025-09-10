import { redisManager } from './redis';
import { getMongoDb } from './db';
import { ObjectId } from 'mongodb';
/**
 * Atomic operation để đặt trade với Redis lock
 */
export async function atomicPlaceTrade(userId, sessionId, amount, type) {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    return await redisManager.atomicUpdateUserBalance(userId, { available: -amount, frozen: amount }, async () => {
        const db = await getMongoDb();
        if (!db) {
            throw new Error('Database connection failed');
        }
        const session = await db.client.startSession();
        try {
            return await session.withTransaction(async () => {
                // 1. Kiểm tra trade đã tồn tại chưa
                const existingTrade = await db.collection('trades').findOne({ tradeId });
                if (existingTrade) {
                    throw new Error(`Trade already exists: ${tradeId}`);
                }
                // 2. Kiểm tra user balance và status
                const userResult = await db.collection('users').findOneAndUpdate({
                    _id: new ObjectId(userId),
                    'balance.available': { $gte: amount },
                    'status.active': true,
                    'status.betLocked': { $ne: true }
                }, {
                    $inc: {
                        'balance.available': -amount,
                        'balance.frozen': amount
                    },
                    $set: {
                        updatedAt: new Date()
                    }
                }, {
                    session,
                    returnDocument: 'after'
                });
                if (!userResult) {
                    throw new Error('Insufficient balance or user locked');
                }
                // 3. Tạo trade record
                const trade = {
                    tradeId,
                    userId: new ObjectId(userId),
                    sessionId,
                    amount,
                    type,
                    status: 'pending',
                    createdAt: new Date(),
                    retryCount: 0,
                    direction: type === 'buy' ? 'UP' : 'DOWN',
                    appliedToBalance: false
                };
                await db.collection('trades').insertOne(trade, { session });
                return {
                    success: true,
                    tradeId,
                    balance: {
                        available: userResult.balance.available,
                        frozen: userResult.balance.frozen
                    }
                };
            });
        }
        finally {
            await session.endSession();
        }
    });
}
/**
 * Atomic operation để check kết quả trade với Redis lock
 */
export async function atomicCheckTradeResult(tradeId, userId, sessionId, amount, type) {
    return await redisManager.atomicProcessTrade(tradeId, async () => {
        const db = await getMongoDb();
        if (!db) {
            throw new Error('Database connection failed');
        }
        const session = await db.client.startSession();
        try {
            return await session.withTransaction(async () => {
                // 1. Kiểm tra trade có tồn tại không
                const trade = await db.collection('trades').findOne({ tradeId });
                if (!trade) {
                    throw new Error(`Trade not found: ${tradeId}`);
                }
                // 2. Kiểm tra trade đã được xử lý chưa
                if (trade.status === 'completed' || trade.status === 'failed') {
                    return { success: true, message: 'Trade already processed' };
                }
                if (trade.appliedToBalance === true) {
                    return { success: true, message: 'Trade already applied to balance' };
                }
                // 3. Cập nhật status thành processing
                await db.collection('trades').updateOne({ tradeId }, { $set: { status: 'processing', updatedAt: new Date() } }, { session });
                // 4. Lấy kết quả session từ cache hoặc database
                let sessionResult = await redisManager.getSessionResult(sessionId);
                if (!sessionResult) {
                    const sessionDoc = await db.collection('trading_sessions').findOne({ sessionId }, { result: 1 });
                    if (!sessionDoc || !sessionDoc.result) {
                        throw new Error(`Session result not available: ${sessionId}`);
                    }
                    sessionResult = sessionDoc.result;
                    await redisManager.setSessionResult(sessionId, sessionResult);
                }
                // 5. So sánh trade với kết quả session
                const userPrediction = type === 'buy' ? 'UP' : 'DOWN';
                const isWin = userPrediction === sessionResult;
                // 6. Tính toán profit/loss
                const profit = isWin ? Math.floor(amount * 0.9) : -amount;
                // 7. Cập nhật balance user
                if (isWin) {
                    // THẮNG: Trả lại tiền gốc + tiền thắng
                    const userResult = await db.collection('users').findOneAndUpdate({
                        _id: new ObjectId(userId),
                        'balance.frozen': { $gte: amount }
                    }, {
                        $inc: {
                            'balance.frozen': -amount,
                            'balance.available': amount + profit
                        },
                        $set: {
                            updatedAt: new Date()
                        }
                    }, {
                        session,
                        returnDocument: 'after'
                    });
                    if (!userResult) {
                        throw new Error('Insufficient frozen balance');
                    }
                }
                else {
                    // THUA: Chỉ trừ frozen (mất tiền)
                    const userResult = await db.collection('users').findOneAndUpdate({
                        _id: new ObjectId(userId),
                        'balance.frozen': { $gte: amount }
                    }, {
                        $inc: {
                            'balance.frozen': -amount
                        },
                        $set: {
                            updatedAt: new Date()
                        }
                    }, {
                        session,
                        returnDocument: 'after'
                    });
                    if (!userResult) {
                        throw new Error('Insufficient frozen balance');
                    }
                }
                // 8. Cập nhật trade với kết quả
                await db.collection('trades').updateOne({ tradeId }, {
                    $set: {
                        status: 'completed',
                        processedAt: new Date(),
                        profit: profit,
                        appliedToBalance: true,
                        result: {
                            isWin,
                            profit: profit,
                            sessionResult,
                            processedAt: new Date()
                        }
                    }
                }, { session });
                // 9. Cập nhật thống kê session
                await redisManager.atomicUpdateSessionStats(sessionId, {
                    totalTrades: 1,
                    totalWins: isWin ? 1 : 0,
                    totalLosses: isWin ? 0 : 1,
                    totalWinAmount: isWin ? amount : 0,
                    totalLossAmount: isWin ? 0 : amount
                }, async () => {
                    return await db.collection('trading_sessions').updateOne({ sessionId }, {
                        $inc: {
                            totalTrades: 1,
                            totalWins: isWin ? 1 : 0,
                            totalLosses: isWin ? 0 : 1,
                            totalWinAmount: isWin ? amount : 0,
                            totalLossAmount: isWin ? 0 : amount
                        }
                    }, { session });
                });
                return {
                    success: true,
                    tradeId,
                    isWin,
                    profit,
                    sessionResult
                };
            });
        }
        finally {
            await session.endSession();
        }
    });
}
/**
 * Atomic operation để sync user balance
 */
export async function atomicSyncUserBalance(userId) {
    return await redisManager.withLock(`user:${userId}:balance`, async () => {
        const db = await getMongoDb();
        if (!db) {
            throw new Error('Database connection failed');
        }
        // Lấy balance từ database
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) }, { projection: { balance: 1 } });
        if (!user) {
            throw new Error('User not found');
        }
        // Cập nhật cache
        await redisManager.setBalance(userId, {
            available: user.balance?.available || 0,
            frozen: user.balance?.frozen || 0
        });
        return {
            success: true,
            balance: {
                available: user.balance?.available || 0,
                frozen: user.balance?.frozen || 0
            }
        };
    });
}
/**
 * Atomic operation để batch process trades
 */
export async function atomicBatchProcessTrades(trades) {
    const results = [];
    // Process trades in parallel với individual locks
    const promises = trades.map(async (trade) => {
        try {
            const result = await atomicCheckTradeResult(trade.tradeId, trade.userId, trade.sessionId, trade.amount, trade.type);
            return result;
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    const batchResults = await Promise.allSettled(promises);
    batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
            results.push(result.value);
        }
        else {
            results.push({
                success: false,
                error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
            });
        }
    });
    return results;
}
/**
 * Health check cho atomic operations
 */
export async function atomicOperationsHealthCheck() {
    const redisHealth = await redisManager.healthCheck();
    let mongodbHealth = { healthy: false, error: 'Unknown error' };
    try {
        const db = await getMongoDb();
        if (db) {
            await db.admin().ping();
            mongodbHealth = { healthy: true };
        }
    }
    catch (error) {
        mongodbHealth = {
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
    return {
        redis: redisHealth,
        mongodb: mongodbHealth
    };
}
