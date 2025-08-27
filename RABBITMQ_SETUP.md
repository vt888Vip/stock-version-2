# 🐰 Cài Đặt và Cấu Hình RabbitMQ

## 📋 Tổng Quan

RabbitMQ được sử dụng để xử lý lệnh đặt theo queue, tránh race condition khi nhiều người dùng đặt lệnh cùng lúc.

## 🔧 Cài Đặt RabbitMQ

### 1. **Windows (Docker)**
```bash
# Pull RabbitMQ image
docker pull rabbitmq:3-management

# Chạy RabbitMQ container
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management

# Kiểm tra container
docker ps
```

### 2. **Windows (Native)**
1. Tải RabbitMQ từ: https://www.rabbitmq.com/download.html
2. Cài đặt Erlang trước
3. Cài đặt RabbitMQ
4. Khởi động service

### 3. **Linux (Ubuntu/Debian)**
```bash
# Cài đặt Erlang
sudo apt-get install erlang

# Cài đặt RabbitMQ
sudo apt-get install rabbitmq-server

# Khởi động service
sudo systemctl start rabbitmq-server
sudo systemctl enable rabbitmq-server
```

### 4. **macOS**
```bash
# Sử dụng Homebrew
brew install rabbitmq

# Khởi động service
brew services start rabbitmq
```

## 🌐 Truy Cập Management UI

Sau khi cài đặt, truy cập: http://localhost:15672

- **Username**: guest
- **Password**: guest

## ⚙️ Cấu Hình Environment

Thêm vào file `.env`:

```env
# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
```

## 🚀 Khởi Động Hệ Thống

### 1. **Khởi động RabbitMQ**
```bash
# Nếu dùng Docker
docker start rabbitmq

# Nếu dùng native
# RabbitMQ sẽ tự động khởi động
```

### 2. **Khởi động Next.js App**
```bash
npm run dev
```

### 3. **Khởi động Trade Worker**
```bash
# Gọi API để khởi động worker
curl -X POST http://localhost:3000/api/admin/start-worker
```

## 📊 Kiểm Tra Queue

### 1. **Qua Management UI**
- Truy cập: http://localhost:15672
- Vào tab "Queues"
- Xem queue `trade_orders` và `trade_results`

### 2. **Qua API**
```bash
# Xem thông tin queue
curl http://localhost:3000/api/admin/queue-info
```

## 🔍 Monitoring

### 1. **Queue Status**
- `trade_orders`: Queue chứa lệnh đặt
- `trade_results`: Queue chứa kết quả xử lý

### 2. **Metrics**
- **Message Count**: Số message trong queue
- **Consumer Count**: Số worker đang xử lý
- **Processing Rate**: Tốc độ xử lý

## 🛠️ Troubleshooting

### 1. **RabbitMQ không kết nối được**
```bash
# Kiểm tra service
docker ps | grep rabbitmq

# Kiểm tra logs
docker logs rabbitmq

# Restart container
docker restart rabbitmq
```

### 2. **Worker không xử lý lệnh**
```bash
# Kiểm tra logs
tail -f /var/log/your-app.log

# Restart worker
curl -X POST http://localhost:3000/api/admin/start-worker
```

### 3. **Queue bị đầy**
```bash
# Xem thông tin queue
curl http://localhost:3000/api/admin/queue-info

# Purge queue (cẩn thận!)
# Chỉ làm khi cần thiết
```

## 📈 Performance

### 1. **Tối Ưu Hóa**
- **Prefetch**: 1 message per worker
- **Durable**: Queue được lưu trữ
- **Persistent**: Message được lưu trữ

### 2. **Scaling**
- Có thể chạy nhiều worker
- Mỗi worker xử lý 1 message tại một thời điểm
- Tự động load balancing

## 🔒 Security

### 1. **Production Setup**
```env
# Tạo user riêng cho production
RABBITMQ_URL=amqp://username:password@localhost:5672
```

### 2. **Network Security**
- Chỉ mở port 5672 cho app
- Port 15672 chỉ cho admin
- Sử dụng SSL/TLS nếu cần

## 📝 Logs

### 1. **RabbitMQ Logs**
```bash
# Docker
docker logs rabbitmq

# Native
tail -f /var/log/rabbitmq/rabbit@hostname.log
```

### 2. **App Logs**
- `📤 Đã gửi lệnh vào queue`
- `📥 Nhận lệnh từ queue`
- `✅ Xử lý lệnh thành công`
- `❌ Xử lý lệnh thất bại`

## 🎯 Kết Quả Mong Đợi

Sau khi setup:
- ✅ Lệnh đặt được xử lý tuần tự
- ✅ Không còn race condition
- ✅ Balance được cập nhật chính xác
- ✅ Performance tốt hơn
- ✅ Dễ scale và monitor
