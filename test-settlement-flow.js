#!/usr/bin/env node
import amqp from 'amqplib';
import dotenv from 'dotenv';

// Load environment
dotenv.config({ path: '.env.local' });

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://trading_user:trading_password@localhost:5672';
const SETTLEMENTS_QUEUE = 'settlements';

async function testSettlementFlow() {
  let connection;
  let channel;
  
  try {
    console.log('🔌 Kết nối RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    
    // Tạo queue nếu chưa có
    await channel.assertQueue(SETTLEMENTS_QUEUE, {
      durable: true,
      maxPriority: 10
    });
    
    console.log('✅ Kết nối RabbitMQ thành công');
    
    // Test settlement message
    const testSettlementMessage = {
      id: `test_settlement_${Date.now()}`,
      sessionId: 'test_session_123',
      result: 'UP',
      timestamp: new Date().toISOString(),
      source: 'test',
      tradeCount: 0
    };
    
    console.log('📤 Gửi test settlement message:', testSettlementMessage);
    
    const sent = channel.sendToQueue(
      SETTLEMENTS_QUEUE,
      Buffer.from(JSON.stringify(testSettlementMessage)),
      {
        persistent: true,
        priority: 1,
        expiration: 300000
      }
    );
    
    console.log(`📤 Settlement message sent: ${sent ? 'SUCCESS' : 'FAILED'}`);
    
    // Kiểm tra queue info
    const queueInfo = await channel.checkQueue(SETTLEMENTS_QUEUE);
    console.log('📊 Settlement queue info:', {
      name: queueInfo.queue,
      messages: queueInfo.messageCount,
      consumers: queueInfo.consumerCount
    });
    
    console.log('✅ Test settlement flow completed');
    
  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

// Test với settlement message thực tế
async function testRealSettlement() {
  let connection;
  let channel;
  
  try {
    console.log('🔌 Kết nối RabbitMQ cho test thực tế...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    
    await channel.assertQueue(SETTLEMENTS_QUEUE, {
      durable: true,
      maxPriority: 10
    });
    
    // Settlement message giống như scheduler gửi
    const realSettlementMessage = {
      id: `scheduler_settlement_202510091809_${Date.now()}`,
      sessionId: '202510091809',
      result: 'UP',
      timestamp: new Date().toISOString(),
      source: 'scheduler',
      tradeCount: 0
    };
    
    console.log('📤 Gửi real settlement message:', realSettlementMessage);
    
    const sent = channel.sendToQueue(
      SETTLEMENTS_QUEUE,
      Buffer.from(JSON.stringify(realSettlementMessage)),
      {
        persistent: true,
        priority: 1,
        expiration: 300000
      }
    );
    
    console.log(`📤 Real settlement message sent: ${sent ? 'SUCCESS' : 'FAILED'}`);
    
    // Kiểm tra queue info
    const queueInfo = await channel.checkQueue(SETTLEMENTS_QUEUE);
    console.log('📊 Settlement queue info:', {
      name: queueInfo.queue,
      messages: queueInfo.messageCount,
      consumers: queueInfo.consumerCount
    });
    
    if (queueInfo.consumerCount === 0) {
      console.log('⚠️ CẢNH BÁO: Không có consumer nào đang lắng nghe settlements queue!');
      console.log('💡 Hãy chạy settlement worker: node start-settlement-worker.js');
    } else {
      console.log(`✅ Có ${queueInfo.consumerCount} consumer(s) đang lắng nghe settlements queue`);
    }
    
  } catch (error) {
    console.error('❌ Lỗi test real settlement:', error);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

// Main function
async function main() {
  console.log('🧪 Testing Settlement Flow...\n');
  
  console.log('1️⃣ Testing basic settlement message...');
  await testSettlementFlow();
  
  console.log('\n2️⃣ Testing real settlement message...');
  await testRealSettlement();
  
  console.log('\n✅ All tests completed!');
}

main().catch(console.error);
