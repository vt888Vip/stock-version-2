#!/usr/bin/env node

/**
 * Script để setup RabbitMQ queues và exchanges
 * Chạy script này sau khi cài đặt RabbitMQ
 */

const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://trading_user:trading_password@localhost:5672';

async function setupRabbitMQ() {
  let connection;
  let channel;

  try {
    console.log('🔌 Connecting to RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    console.log('✅ Connected to RabbitMQ');

    // 1. Tạo exchanges
    console.log('📡 Creating exchanges...');
    
    await channel.assertExchange('trade-events', 'topic', {
      durable: true,
      autoDelete: false
    });
    console.log('✅ Created exchange: trade-events');

    // 2. Tạo queues
    console.log('📋 Creating queues...');
    
    const queues = [
      'trade-processing',
      'trade-settlement', 
      'trade-results',
      'settlements'
    ];

    for (const queueName of queues) {
      await channel.assertQueue(queueName, {
        durable: true,
        autoDelete: false,
        arguments: {
          'x-message-ttl': 300000, // 5 minutes TTL
          'x-max-length': 10000    // Max 10k messages
        }
      });
      console.log(`✅ Created queue: ${queueName}`);
    }

    // 3. Bind queues to exchanges
    console.log('🔗 Binding queues to exchanges...');
    
    await channel.bindQueue('trade-processing', 'trade-events', 'trade.place');
    await channel.bindQueue('trade-settlement', 'trade-events', 'trade.settle');
    await channel.bindQueue('trade-results', 'trade-events', 'trade.result');
    await channel.bindQueue('settlements', 'trade-events', 'session.settle');
    
    console.log('✅ Bound queues to exchanges');

    // 4. Kiểm tra setup
    console.log('🔍 Verifying setup...');
    
    const queueInfo = await channel.checkQueue('trade-processing');
    console.log(`✅ Queue trade-processing: ${queueInfo.messageCount} messages, ${queueInfo.consumerCount} consumers`);

    console.log('\n🎉 RabbitMQ setup completed successfully!');
    console.log('\n📊 Queue Information:');
    console.log('   - trade-processing: Xử lý đặt lệnh');
    console.log('   - trade-settlement: Xử lý thanh toán');
    console.log('   - trade-results: Kết quả giao dịch');
    console.log('   - settlements: Thanh toán phiên');
    
    console.log('\n🔧 Management Commands:');
    console.log('   - List queues: rabbitmqctl list_queues');
    console.log('   - List exchanges: rabbitmqctl list_exchanges');
    console.log('   - List bindings: rabbitmqctl list_bindings');
    console.log('   - Web UI: http://localhost:15672');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

// Chạy setup
setupRabbitMQ().catch(console.error);
