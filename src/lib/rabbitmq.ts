import amqp, { Channel, Connection } from 'amqplib';

// Cấu hình RabbitMQ
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const TRADE_QUEUE = 'trade_orders';
const TRADE_RESULT_QUEUE = 'trade_results';

let connection: Connection | null = null;
let channel: Channel | null = null;

/**
 * Kết nối đến RabbitMQ
 */
export async function connectRabbitMQ(): Promise<{ connection: Connection; channel: Channel }> {
  try {
    if (!connection) {
      console.log('🔌 Kết nối RabbitMQ...');
      connection = await amqp.connect(RABBITMQ_URL);
      
      connection.on('error', (error) => {
        console.error('❌ RabbitMQ connection error:', error);
        connection = null;
        channel = null;
      });

      connection.on('close', () => {
        console.log('🔌 RabbitMQ connection closed');
        connection = null;
        channel = null;
      });
    }

    if (!channel) {
      channel = await connection.createChannel();
      
      // Tạo queue cho lệnh đặt
      await channel.assertQueue(TRADE_QUEUE, {
        durable: true, // Queue sẽ được lưu trữ khi restart
        maxPriority: 10 // Hỗ trợ priority
      });

      // Tạo queue cho kết quả
      await channel.assertQueue(TRADE_RESULT_QUEUE, {
        durable: true
      });

      console.log('✅ RabbitMQ connected và queues đã được tạo');
    }

    return { connection, channel };
  } catch (error) {
    console.error('❌ Lỗi kết nối RabbitMQ:', error);
    throw error;
  }
}

/**
 * Gửi lệnh đặt vào queue
 */
export async function sendTradeOrder(orderData: {
  sessionId: string;
  userId: string;
  direction: 'UP' | 'DOWN';
  amount: number;
  priority?: number;
}): Promise<boolean> {
  try {
    const { channel } = await connectRabbitMQ();
    
    const message = {
      ...orderData,
      timestamp: new Date().toISOString(),
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    const success = channel.sendToQueue(
      TRADE_QUEUE,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true, // Message sẽ được lưu trữ
        priority: orderData.priority || 0
      }
    );

    if (success) {
      console.log(`📤 Đã gửi lệnh vào queue: ${message.id}`);
      return true;
    } else {
      console.error('❌ Không thể gửi lệnh vào queue');
      return false;
    }
  } catch (error) {
    console.error('❌ Lỗi gửi lệnh vào queue:', error);
    return false;
  }
}

/**
 * Xử lý lệnh đặt từ queue
 */
export async function processTradeOrder(
  callback: (orderData: any) => Promise<{ success: boolean; result?: any; error?: string }>
): Promise<void> {
  try {
    const { channel } = await connectRabbitMQ();
    
    console.log('🔄 Bắt đầu xử lý lệnh đặt từ queue...');
    
    // Thiết lập prefetch để chỉ xử lý 1 message tại một thời điểm
    await channel.prefetch(1);
    
    channel.consume(TRADE_QUEUE, async (msg) => {
      if (!msg) return;

      try {
        const orderData = JSON.parse(msg.content.toString());
        console.log(`📥 Nhận lệnh từ queue: ${orderData.id}`);

        // Xử lý lệnh
        const result = await callback(orderData);

        if (result.success) {
          // Gửi kết quả thành công vào queue kết quả
          await sendTradeResult({
            orderId: orderData.id,
            success: true,
            result: result.result,
            timestamp: new Date().toISOString()
          });

          // Acknowledge message
          channel.ack(msg);
          console.log(`✅ Xử lý lệnh thành công: ${orderData.id}`);
        } else {
          // Gửi kết quả lỗi vào queue kết quả
          await sendTradeResult({
            orderId: orderData.id,
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
          });

          // Acknowledge message (không retry để tránh loop vô hạn)
          channel.ack(msg);
          console.log(`❌ Xử lý lệnh thất bại: ${orderData.id} - ${result.error}`);
        }

      } catch (error) {
        console.error(`❌ Lỗi xử lý lệnh:`, error);
        
        // Gửi kết quả lỗi
        try {
          const orderData = JSON.parse(msg.content.toString());
          await sendTradeResult({
            orderId: orderData.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
        } catch (parseError) {
          console.error('❌ Lỗi parse message:', parseError);
        }

        // Acknowledge message để tránh loop
        channel.ack(msg);
      }
    });

  } catch (error) {
    console.error('❌ Lỗi thiết lập consumer:', error);
  }
}

/**
 * Gửi kết quả xử lý vào queue kết quả
 */
export async function sendTradeResult(resultData: {
  orderId: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: string;
}): Promise<boolean> {
  try {
    const { channel } = await connectRabbitMQ();
    
    const success = channel.sendToQueue(
      TRADE_RESULT_QUEUE,
      Buffer.from(JSON.stringify(resultData)),
      { persistent: true }
    );

    if (success) {
      console.log(`📤 Đã gửi kết quả vào queue: ${resultData.orderId}`);
      return true;
    } else {
      console.error('❌ Không thể gửi kết quả vào queue');
      return false;
    }
  } catch (error) {
    console.error('❌ Lỗi gửi kết quả vào queue:', error);
    return false;
  }
}

/**
 * Lấy kết quả xử lý từ queue
 */
export async function getTradeResult(orderId: string, timeout: number = 30000): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connectRabbitMQ();
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for trade result'));
      }, timeout);

      const checkResult = async () => {
        try {
          const msg = await channel.get(TRADE_RESULT_QUEUE);
          
          if (msg) {
            const result = JSON.parse(msg.content.toString());
            
            if (result.orderId === orderId) {
              clearTimeout(timeoutId);
              channel.ack(msg);
              resolve(result);
              return;
            } else {
              // Nếu không phải kết quả cần tìm, đặt lại vào queue
              channel.nack(msg, false, true);
            }
          }
          
          // Kiểm tra lại sau 100ms
          setTimeout(checkResult, 100);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      };

      checkResult();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Đóng kết nối RabbitMQ
 */
export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    console.log('🔌 RabbitMQ connection closed');
  } catch (error) {
    console.error('❌ Lỗi đóng RabbitMQ connection:', error);
  }
}

/**
 * Lấy thông tin queue
 */
export async function getQueueInfo(): Promise<{
  tradeQueue: { messageCount: number; consumerCount: number };
  resultQueue: { messageCount: number; consumerCount: number };
}> {
  try {
    const { channel } = await connectRabbitMQ();
    
    const tradeQueueInfo = await channel.checkQueue(TRADE_QUEUE);
    const resultQueueInfo = await channel.checkQueue(TRADE_RESULT_QUEUE);

    return {
      tradeQueue: {
        messageCount: tradeQueueInfo.messageCount,
        consumerCount: tradeQueueInfo.consumerCount
      },
      resultQueue: {
        messageCount: resultQueueInfo.messageCount,
        consumerCount: resultQueueInfo.consumerCount
      }
    };
  } catch (error) {
    console.error('❌ Lỗi lấy thông tin queue:', error);
    throw error;
  }
}
