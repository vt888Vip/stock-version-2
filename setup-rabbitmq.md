# Setup RabbitMQ Open-Source

## 1. Cài đặt RabbitMQ trên Windows

### Option 1: Sử dụng Chocolatey (Recommended)
```bash
# Cài đặt Chocolatey nếu chưa có
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Cài đặt RabbitMQ
choco install rabbitmq

# Hoặc cài đặt Erlang trước (nếu cần)
choco install erlang
choco install rabbitmq
```

### Option 2: Download từ website
1. Tải Erlang: https://www.erlang.org/downloads
2. Tải RabbitMQ: https://www.rabbitmq.com/download.html
3. Cài đặt Erlang trước, sau đó cài RabbitMQ

## 2. Khởi động RabbitMQ

```bash
# Khởi động service
net start RabbitMQ

# Hoặc từ command line
rabbitmq-server
```

## 3. Cấu hình RabbitMQ

### Tạo user admin
```bash
# Tạo user admin
rabbitmqctl add_user admin your_password
rabbitmqctl set_user_tags admin administrator
rabbitmqctl set_permissions -p / admin ".*" ".*" ".*"
```

### Tạo user cho ứng dụng
```bash
# Tạo user cho trading app
rabbitmqctl add_user trading_user trading_password
rabbitmqctl set_permissions -p / trading_user ".*" ".*" ".*"
```

## 4. Cấu hình Environment Variables

Tạo file `.env.local`:
```env
# RabbitMQ Local
RABBITMQ_URL=amqp://trading_user:trading_password@localhost:5672
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=trading_user
RABBITMQ_PASSWORD=trading_password
RABBITMQ_VHOST=/

# MongoDB (giữ nguyên)
MONGODB_URI=mongodb://localhost:27017/trading
```

## 5. Kiểm tra RabbitMQ

```bash
# Kiểm tra status
rabbitmqctl status

# Kiểm tra queues
rabbitmqctl list_queues

# Kiểm tra connections
rabbitmqctl list_connections
```

## 6. Web Management Interface

Truy cập: http://localhost:15672
- Username: admin
- Password: your_password

## 7. Lợi ích của RabbitMQ Open-Source

- ✅ Không giới hạn connections
- ✅ Không giới hạn messages
- ✅ Full control và customization
- ✅ Không có downtime
- ✅ Performance tốt hơn
- ✅ Miễn phí hoàn toàn
