# 🚀 Production Checklist - Hệ Thống Trading

## ✅ Kiểm Tra Trước Khi Deploy

### 1. **Database & Models**
- [x] Model `TradingSession` đã được cập nhật với `result` required
- [x] Model `Trade` giữ nguyên cấu trúc
- [x] Model `User` có balance format đúng
- [x] Tất cả indexes đã được tạo

### 2. **API Endpoints**
- [x] `/api/trading-sessions/create` - Tạo phiên với kết quả có sẵn
- [x] `/api/trading-sessions/session-change` - Tự động tạo phiên với upsert
- [x] `/api/trading-sessions/process-result` - Xử lý kết quả với transactions
- [x] `/api/trades/place` - Đặt lệnh với transactions
- [x] `/api/trades/session-result` - Xem kết quả phiên
- [x] `/api/admin/cleanup-sessions` - Dọn dẹp database

### 3. **API Đã Xóa (Tránh Xung Đột)**
- [x] `/api/trading-sessions/close` - Trùng lặp với process-result
- [x] `/api/trading-sessions/fix-expired` - Không cần thiết
- [x] `/api/cron/process-sessions` - Trùng lặp với process-result
- [x] `/api/admin/create-session` - Không có result
- [x] `/api/admin/session-results/future` - Logic cũ

### 4. **Balance Logic**
- [x] Sử dụng MongoDB transactions cho tất cả thao tác
- [x] Logic đơn giản: `available` và `frozen`
- [x] Validation chặt chẽ trước khi đặt lệnh
- [x] Rate limiting: 5 lệnh per session

### 5. **Race Condition Prevention**
- [x] Sử dụng `upsert` thay vì `insertOne`
- [x] MongoDB transactions cho balance updates
- [x] Cache để tránh xử lý trùng lặp
- [x] Validation session status

### 6. **Error Handling**
- [x] Try-catch cho tất cả API
- [x] Logging chi tiết cho debug
- [x] Rollback tự động khi có lỗi
- [x] User-friendly error messages

## 🔧 Bước Triển Khai Production

### Bước 1: Backup Database
```bash
# Backup toàn bộ database
mongodump --uri="your_mongodb_uri" --out=backup_$(date +%Y%m%d_%H%M%S)
```

### Bước 2: Deploy Code
```bash
# Build và deploy
npm run build
npm start
```

### Bước 3: Chạy Cleanup
```bash
# Dọn dẹp database
curl -X POST http://your-domain.com/api/admin/cleanup-sessions
```

### Bước 4: Test Production
```bash
# Chạy test script
node test-production-ready.js
```

## 🧪 Test Cases

### Test 1: Tạo Phiên Mới
```javascript
// Tạo phiên với kết quả có sẵn
const response = await fetch('/api/trading-sessions/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'test_123',
    startTime: '2024-01-15T10:00:00Z',
    endTime: '2024-01-15T10:05:00Z'
  })
});
// Expected: success: true, data.result: "UP" hoặc "DOWN"
```

### Test 2: Tạo Phiên Trùng Lặp
```javascript
// Tạo lại phiên cùng sessionId
const response = await fetch('/api/trading-sessions/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'test_123', // Cùng sessionId
    startTime: '2024-01-15T10:00:00Z',
    endTime: '2024-01-15T10:05:00Z'
  })
});
// Expected: success: true, data.isNew: false
```

### Test 3: Đặt Lệnh
```javascript
// Đặt lệnh với token hợp lệ
const response = await fetch('/api/trades/place', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer valid_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sessionId: 'test_123',
    direction: 'UP',
    amount: 100000
  })
});
// Expected: success: true, balance được trừ
```

### Test 4: Xử Lý Kết Quả
```javascript
// Xử lý kết quả phiên
const response = await fetch('/api/trading-sessions/process-result', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: 'test_123' })
});
// Expected: success: true, trades được cập nhật
```

## 📊 Monitoring

### Logs Cần Theo Dõi
- `✅ Created new trading session` - Phiên mới được tạo
- `ℹ️ Trading session already exists` - Phiên trùng lặp được xử lý
- `✅ Đã xử lý kết quả phiên` - Kết quả được xử lý
- `✅ [BALANCE] User xxx đặt lệnh` - Balance được cập nhật
- `❌ Error` - Các lỗi cần xử lý

### Metrics Cần Theo Dõi
- Số phiên được tạo mỗi ngày
- Số lệnh được đặt mỗi phiên
- Tỷ lệ thắng/thua
- Thời gian xử lý API
- Số lỗi xảy ra

## 🚨 Troubleshooting

### Vấn Đề Thường Gặp

#### 1. **Phiên Trùng Lặp**
```bash
# Chạy cleanup
curl -X POST http://your-domain.com/api/admin/cleanup-sessions
```

#### 2. **Balance Sai**
```javascript
// Kiểm tra balance trong database
db.users.findOne({ _id: ObjectId("user_id") }, { balance: 1 })
```

#### 3. **API Không Hoạt Động**
```bash
# Kiểm tra logs
tail -f /var/log/your-app.log
```

#### 4. **Database Connection**
```javascript
// Kiểm tra connection
db.adminCommand('ping')
```

## 🎯 Kết Quả Mong Đợi

### Sau Khi Deploy
- ✅ Không còn phiên trùng lặp
- ✅ Tất cả phiên đều có kết quả
- ✅ Balance được cập nhật chính xác
- ✅ Không còn race condition
- ✅ Performance tốt hơn
- ✅ Code dễ maintain hơn

### Metrics Production
- **Uptime**: > 99.9%
- **Response Time**: < 200ms
- **Error Rate**: < 0.1%
- **Concurrent Users**: > 1000
- **Daily Trades**: > 10000

## 📞 Support

Nếu có vấn đề, hãy:
1. Kiểm tra logs trước
2. Chạy test script
3. Backup database
4. Liên hệ support team

---

**Lưu ý**: Checklist này đảm bảo hệ thống đã sẵn sàng cho production và không còn vấn đề về race condition hay balance sai.
