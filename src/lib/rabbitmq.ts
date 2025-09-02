import amqp, { Channel, Connection, Message } from 'amqplib';

// RabbitMQ Configuration - Local Open Source
export const RABBITMQ_CONFIG = {
  url: process.env.RABBITMQ_URL || 'amqp://trading_user:trading_password@localhost:5672',
  username: process.env.RABBITMQ_USERNAME || 'trading_user',
  password: process.env.RABBITMQ_PASSWORD || 'trading_password',
  vhost: process.env.RABBITMQ_VHOST || '/',
  host: process.env.RABBITMQ_HOST || 'localhost',
  port: parseInt(process.env.RABBITMQ_PORT || '5672'),
  tlsPort: parseInt(process.env.RABBITMQ_TLS_PORT || '5672'),
  queues: {
    tradeProcessing: process.env.RABBITMQ_QUEUE_TRADE_PROCESSING || 'trade-processing',
    tradeSettlement: process.env.RABBITMQ_QUEUE_TRADE_SETTLEMENT || 'trade-settlement',
    tradeResults: process.env.RABBITMQ_QUEUE_TRADE_RESULTS || 'trade-results',
    settlements: process.env.RABBITMQ_QUEUE_SETTLEMENTS || 'settlements'
  },
  exchanges: {
    tradeEvents: process.env.RABBITMQ_EXCHANGE_TRADE_EVENTS || 'trade-events'
  },
  retryAttempts: parseInt(process.env.RABBITMQ_RETRY_ATTEMPTS || '3'),
  backoffDelay: parseInt(process.env.RABBITMQ_BACKOFF_DELAY || '5000'), // 5 seconds
  lockTimeout: parseInt(process.env.RABBITMQ_LOCK_TIMEOUT || '30000'), // 30 seconds
  cleanupInterval: parseInt(process.env.RABBITMQ_CLEANUP_INTERVAL || '60000') // 1 minute
};

// Connection manager
class RabbitMQManager {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;


  // Singleton pattern
  private static instance: RabbitMQManager;
  
  public static getInstance(): RabbitMQManager {
    if (!RabbitMQManager.instance) {
      RabbitMQManager.instance = new RabbitMQManager();
    }
    return RabbitMQManager.instance;
  }

  // Connect to RabbitMQ
  async connect(): Promise<void> {
    // SỬA: Kiểm tra nghiêm ngặt hơn để tránh connection leak
    if (this.isConnected && this.connection && this.channel) {
      console.log('✅ RabbitMQ already connected - reusing existing connection');
      return;
    }

    // SỬA: Nếu đang trong quá trình kết nối, đợi
    if (this.connection && !this.isConnected) {
      console.log('⏳ RabbitMQ connection in progress - waiting...');
      // Đợi một chút để connection hoàn thành
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (this.isConnected && this.channel) {
        console.log('✅ RabbitMQ connection completed while waiting');
        return;
      }
    }

    try {
      console.log('🔄 Creating new RabbitMQ connection...');
      
      // Use the full URL from environment
      this.connection = await amqp.connect(RABBITMQ_CONFIG.url);
      this.channel = await this.connection!.createChannel();
      
      // Setup queues and exchanges
      await this.setupQueues();
      await this.setupExchanges();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      console.log('✅ RabbitMQ connected successfully');
      console.log(`📍 Connected to: ${RABBITMQ_CONFIG.host}:${RABBITMQ_CONFIG.port}`);
      
      // Handle connection events - chỉ reconnect khi bị lỗi
      this.connection!.on('close', () => {
        console.log('🔌 RabbitMQ connection closed');
        this.isConnected = false;
        this.channel = null;
        this.handleReconnect();
      });
      
      this.connection!.on('error', (error) => {
        console.error('❌ RabbitMQ connection error:', error);
        this.isConnected = false;
        this.channel = null;
        this.handleReconnect();
      });
      
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error);
      console.error('🔗 Connection URL:', RABBITMQ_CONFIG.url);
      this.isConnected = false;
      this.channel = null;
      this.handleReconnect();
    }
  }

  // Setup queues
  private async setupQueues(): Promise<void> {
    if (!this.channel) throw new Error('Channel not available');

    // Trade processing queue - để worker tạo
    console.log('Queue trade-processing sẽ được tạo bởi worker');
    

    // Trade settlement queue - chỉ assert, không tạo mới
    await this.channel.assertQueue(RABBITMQ_CONFIG.queues.tradeSettlement, {
      durable: true
    });

    // Trade results queue
    await this.channel.assertQueue(RABBITMQ_CONFIG.queues.tradeResults, {
      durable: true
    });

    // Settlements queue
    await this.channel.assertQueue(RABBITMQ_CONFIG.queues.settlements, {
      durable: true,
      arguments: {
        'x-max-priority': 10
      }
    });

    console.log('Queues setup completed');
  }

  // Setup exchanges
  private async setupExchanges(): Promise<void> {
    if (!this.channel) throw new Error('Channel not available');

    // Trade events exchange
    await this.channel.assertExchange(RABBITMQ_CONFIG.exchanges.tradeEvents, 'topic', {
      durable: true
    });

    // Bind queues to exchange
    await this.channel.bindQueue(
      RABBITMQ_CONFIG.queues.tradeResults,
      RABBITMQ_CONFIG.exchanges.tradeEvents,
      'trade.*'
    );

    console.log('Exchanges setup completed');
  }

  // Handle reconnection
  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, 5000 * this.reconnectAttempts); // Exponential backoff
  }

  // Get channel with auto-connect
  async getChannel(): Promise<Channel> {
    // Chỉ tạo connection mới nếu chưa có hoặc đã bị đóng
    if (!this.isConnected || !this.channel) {
      console.log('🔄 Auto-connecting to RabbitMQ...');
      await this.connect();
    }
    
    if (!this.channel) {
      throw new Error('Failed to get RabbitMQ channel');
    }
    
    return this.channel;
  }

  // Publish message to queue
  async publishToQueue(queueName: string, data: any, options: any = {}): Promise<boolean> {
    try {
      const channel = await this.getChannel();
      
      // Gửi trực tiếp data, không wrap trong message object
      const result = channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(data)),
        {
          persistent: true, // Survive broker restart
          ...options
        }
      );

      console.log(`Message published to queue ${queueName}:`, data.tradeId || 'unknown');
      return result;
      
    } catch (error) {
      console.error(`Failed to publish message to queue ${queueName}:`, error);
      return false;
    }
  }

  // Publish message to exchange
  async publishToExchange(exchangeName: string, routingKey: string, data: any, options: any = {}): Promise<boolean> {
    try {
      const channel = await this.getChannel();
      
      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        data,
        timestamp: new Date().toISOString()
      };

      const result = channel.publish(
        exchangeName,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          ...options
        }
      );

      console.log(`Message published to exchange ${exchangeName} with routing key ${routingKey}:`, message.id);
      return result;
      
    } catch (error) {
      console.error(`Failed to publish message to exchange ${exchangeName}:`, error);
      return false;
    }
  }

  // Consume messages from queue
  async consumeQueue(queueName: string, handler: (message: any) => Promise<void>, options: any = {}): Promise<void> {
    try {
      const channel = await this.getChannel();
      
      await channel.consume(
        queueName,
        async (msg: Message | null) => {
          if (!msg) return;

          try {
            const message = JSON.parse(msg.content.toString());
            console.log(`Processing message from queue ${queueName}:`, message.id);
            
            await handler(message);
            
            // Acknowledge message
            channel.ack(msg);
            console.log(`Message processed successfully:`, message.id);
            
                     } catch (error) {
             console.error(`Error processing message:`, error);
             
             // Check if we should retry
             const parsedMessage = JSON.parse(msg.content.toString());
             if (parsedMessage.attempts < parsedMessage.maxAttempts) {
               parsedMessage.attempts++;
               
               // Reject and requeue with delay
               setTimeout(() => {
                 channel.nack(msg, false, true);
               }, RABBITMQ_CONFIG.backoffDelay * Math.pow(2, parsedMessage.attempts - 1));
               
             } else {
               // Reject without requeue (send to dead letter queue)
               channel.nack(msg, false, false);
               console.error(`Message permanently failed after ${parsedMessage.attempts} attempts:`, parsedMessage.id);
             }
           }
        },
        {
          noAck: false, // Manual acknowledgment
          ...options
        }
      );

      console.log(`Consumer started for queue: ${queueName}`);
      
    } catch (error) {
      console.error(`Failed to start consumer for queue ${queueName}:`, error);
    }
  }

  // Get queue info
  async getQueueInfo(queueName: string): Promise<any> {
    try {
      const channel = await this.getChannel();
      const queueInfo = await channel.checkQueue(queueName);
      return queueInfo;
    } catch (error) {
      console.error(`Failed to get queue info for ${queueName}:`, error);
      return null;
    }
  }

  // Close connection
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.isConnected = false;
      console.log('RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }

  // Check connection status
  isConnectionActive(): boolean {
    return this.isConnected && this.connection !== null && this.channel !== null;
  }
}

// Export singleton instance
export const rabbitMQManager = RabbitMQManager.getInstance();

// Helper functions
export const publishTradeToQueue = async (tradeData: any): Promise<boolean> => {
  return await rabbitMQManager.publishToQueue(
    RABBITMQ_CONFIG.queues.tradeProcessing,
    tradeData,
    {
      maxAttempts: RABBITMQ_CONFIG.retryAttempts
    }
  );
};

export const publishTradeResult = async (resultData: any): Promise<boolean> => {
  return await rabbitMQManager.publishToExchange(
    RABBITMQ_CONFIG.exchanges.tradeEvents,
    'trade.completed',
    resultData
  );
};

export const publishSettlementMessage = async (settlementData: any): Promise<boolean> => {
  return await rabbitMQManager.publishToQueue(
    RABBITMQ_CONFIG.queues.settlements,
    settlementData,
    {
      priority: 1,
      expiration: 300000 // 5 minutes
    }
  );
};

// Alias functions để tương thích với code cũ
export const sendTradeOrder = async (tradeData: any): Promise<boolean> => {
  return await rabbitMQManager.publishToQueue(
    RABBITMQ_CONFIG.queues.tradeProcessing,
    {
      ...tradeData,
      action: 'place-trade',
      attempts: 0,
      maxAttempts: RABBITMQ_CONFIG.retryAttempts,
      timestamp: new Date().toISOString()
    },
    {
      priority: tradeData.priority || 0,
      expiration: 300000 // 5 minutes
    }
  );
};

export const sendSettlementOrder = async (settlementData: any): Promise<boolean> => {
  return await publishSettlementMessage(settlementData);
};

export const getQueueStats = async (): Promise<any> => {
  const stats: any = {};
  
  for (const [key, queueName] of Object.entries(RABBITMQ_CONFIG.queues)) {
    const queueInfo = await rabbitMQManager.getQueueInfo(queueName);
    if (queueInfo) {
      stats[key] = {
        name: queueName,
        messages: queueInfo.messageCount,
        consumers: queueInfo.consumerCount
      };
    }
  }
  
  return stats;
};

/**
 * Đợi kết quả từ worker
 */
export async function waitForWorkerResult(tradeIds: string[], timeoutMs: number = 10000): Promise<boolean> {
  const manager = RabbitMQManager.getInstance();
  const channel = await manager.getChannel();
  
  if (!channel) {
    throw new Error('RabbitMQ channel not available');
  }

  return new Promise((resolve, reject) => {
    const responseQueue = `response_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    let processedTrades = new Set<string>();
    let timeout: NodeJS.Timeout;

    // Tạo response queue tạm thời
    channel.assertQueue(responseQueue, { 
      durable: false, 
      autoDelete: true,
      expires: 60000 // Tự động xóa sau 1 phút
    });

    // Consumer để nhận kết quả từ worker
    channel.consume(responseQueue, (msg) => {
      if (!msg) return;

      try {
        const result = JSON.parse(msg.content.toString());
        console.log(`📥 [RESPONSE] Nhận kết quả từ worker:`, result);

        if (result.tradeId && result.success) {
          processedTrades.add(result.tradeId);
          
          // Kiểm tra xem tất cả trades đã được xử lý chưa
          const allProcessed = tradeIds.every(id => processedTrades.has(id));
          
          if (allProcessed) {
            clearTimeout(timeout);
            channel.ack(msg);
            channel.deleteQueue(responseQueue);
            resolve(true);
          }
        }
        
        channel.ack(msg);
      } catch (error) {
        console.error('❌ [RESPONSE] Lỗi xử lý response:', error);
        channel.ack(msg);
      }
    });

    // Timeout
    timeout = setTimeout(() => {
      console.log(`⏰ [RESPONSE] Timeout đợi worker (${timeoutMs}ms)`);
      channel.deleteQueue(responseQueue);
      resolve(false);
    }, timeoutMs);

    // Gửi message với response queue
    tradeIds.forEach(tradeId => {
      const message = {
        tradeId,
        responseQueue,
        timestamp: Date.now()
      };
      
      channel.sendToQueue('trade-processing', Buffer.from(JSON.stringify(message)));
    });
  });
}
