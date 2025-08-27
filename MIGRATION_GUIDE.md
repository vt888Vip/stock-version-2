# 🚀 Hướng Dẫn Migration Field `appliedToBalance`

## 📋 Tổng Quan

Migration này thêm field `appliedToBalance` vào collection `trades` để giải quyết race condition trong API `check-results`.

## 🎯 Mục Đích

- **Tránh Race Condition**: Mỗi trade chỉ được apply balance 1 lần
- **Atomic Operations**: Update trade và balance trong cùng 1 transaction
- **Idempotent API**: API có thể được gọi nhiều lần mà không bị duplicate

## 🔧 Các Thay Đổi

### 1. Model Trade (`src/models/Trade.ts`)
```typescript
export interface ITrade extends Document {
  // ... existing fields
  appliedToBalance?: boolean; // ✅ THÊM FIELD NÀY
}

const tradeSchema = new Schema<ITrade>({
  // ... existing fields
  appliedToBalance: { 
    type: Boolean, 
    default: false, // ✅ DEFAULT FALSE
    index: true 
  },
});
```

### 2. API Place Trade (`src/app/api/trades/place/route.ts`)
```typescript
const trade = {
  // ... existing fields
  appliedToBalance: false, // ✅ THÊM FIELD NÀY
};
```

### 3. API Check Results (`src/app/api/trades/check-results/route.ts`)
```typescript
// ✅ PHƯƠNG ÁN MỚI: Tìm trades chưa được apply balance
const pendingTrades = await db.collection('trades')
  .find({ 
    sessionId,
    status: 'pending',
    appliedToBalance: false  // ✅ CHỈ LẤY NHỮNG TRADE CHƯA APPLY
  })
  .toArray();

// ✅ ATOMIC OPERATION: Update trade và balance trong 1 transaction
const dbSession = await mongoose.startSession();
await dbSession.withTransaction(async () => {
  // Đánh dấu trade đã được apply balance
  await db.collection('trades').updateOne(
    { _id: trade._id },
    {
      $set: {
        status: 'completed',
        result: isWin ? 'win' : 'lose',
        profit: profit,
        appliedToBalance: true, // ✅ ĐÁNH DẤU ĐÃ APPLY
        completedAt: new Date(),
        updatedAt: new Date()
      }
    },
    { session: dbSession }
  );

  // Update balance user
  // ... balance update logic
});
```

## 🚀 Cách Chạy Migration

### 1. Chạy Migration Script
```bash
npm run migrate-applied-to-balance
```

### 2. Kiểm Tra Kết Quả
Script sẽ hiển thị:
- Số lượng trades được cập nhật
- Index được tạo thành công
- Migration hoàn thành

### 3. Restart Application
```bash
npm run dev
```

## ✅ Kiểm Tra Migration

### 1. Kiểm Tra Database
```javascript
// Kiểm tra trades có field appliedToBalance
db.trades.find({ appliedToBalance: { $exists: true } }).count()

// Kiểm tra index
db.trades.getIndexes()
```

### 2. Test API
```bash
# Test API check-results với nhiều request đồng thời
curl -X POST http://localhost:3000/api/trades/check-results \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "YOUR_SESSION_ID"}'
```

## 🛡️ Bảo Mật

- **Atomic Operations**: Sử dụng MongoDB transactions
- **Idempotent**: API an toàn khi gọi nhiều lần
- **Race Condition Safe**: Mỗi trade chỉ được xử lý 1 lần

## 📊 Performance

- **Index Optimization**: Index cho `{ sessionId, appliedToBalance, status }`
- **Transaction Efficiency**: Chỉ xử lý trades chưa được apply
- **Memory Safe**: Không load tất cả trades vào memory

## 🔄 Rollback (Nếu Cần)

```javascript
// Xóa field appliedToBalance (chỉ khi cần thiết)
db.trades.updateMany(
  { appliedToBalance: { $exists: true } },
  { $unset: { appliedToBalance: "" } }
);

// Xóa index
db.trades.dropIndex("sessionId_1_appliedToBalance_1_status_1");
```

## 📝 Logs

Migration script sẽ log:
- Số lượng trades được cập nhật
- Index creation status
- Error handling
- Completion status

## 🎉 Kết Quả

Sau migration:
- ✅ Race condition được giải quyết
- ✅ API check-results an toàn với concurrent requests
- ✅ Balance updates chính xác
- ✅ Performance được tối ưu
