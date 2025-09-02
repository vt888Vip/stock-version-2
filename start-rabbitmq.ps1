# PowerShell script để khởi động RabbitMQ

Write-Host "🐰 Starting RabbitMQ..." -ForegroundColor Green

# Kiểm tra RabbitMQ service
$service = Get-Service -Name "RabbitMQ" -ErrorAction SilentlyContinue

if ($service) {
    if ($service.Status -eq "Running") {
        Write-Host "✅ RabbitMQ service is already running" -ForegroundColor Green
    } else {
        Write-Host "🔄 Starting RabbitMQ service..." -ForegroundColor Yellow
        Start-Service -Name "RabbitMQ"
        Start-Sleep -Seconds 5
        
        if ((Get-Service -Name "RabbitMQ").Status -eq "Running") {
            Write-Host "✅ RabbitMQ service started successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to start RabbitMQ service" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "❌ RabbitMQ service not found. Please install RabbitMQ first." -ForegroundColor Red
    Write-Host "Run: choco install rabbitmq" -ForegroundColor Yellow
    exit 1
}

# Kiểm tra RabbitMQ status
Write-Host "🔍 Checking RabbitMQ status..." -ForegroundColor Cyan
try {
    $status = & rabbitmqctl status 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ RabbitMQ is running and responding" -ForegroundColor Green
    } else {
        Write-Host "⚠️ RabbitMQ is running but not responding to commands" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ Could not check RabbitMQ status" -ForegroundColor Yellow
}

# Hiển thị thông tin kết nối
Write-Host "`n📊 RabbitMQ Connection Info:" -ForegroundColor Cyan
Write-Host "   URL: amqp://trading_user:trading_password@localhost:5672" -ForegroundColor White
Write-Host "   Management UI: http://localhost:15672" -ForegroundColor White
Write-Host "   Username: admin" -ForegroundColor White
Write-Host "   Password: (your admin password)" -ForegroundColor White

Write-Host "`n🚀 RabbitMQ is ready for your trading application!" -ForegroundColor Green
