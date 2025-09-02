import mongoose, { Schema, Document } from 'mongoose';

export interface ITrade extends Document {
  tradeId: string;
  userId: mongoose.Types.ObjectId;
  sessionId: string;
  amount: number;
  type: 'buy' | 'sell';
  direction?: 'UP' | 'DOWN'; // Tương thích với database cũ
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  processedAt?: Date;
  lockId?: string;
  retryCount: number;
  errorMessage?: string;
  appliedToBalance?: boolean; // Tương thích với database cũ
  profit?: number; // Tương thích với database cũ
  result?: {
    win: boolean;
    profit: number;
    multiplier: number;
  };
}

const TradeSchema = new Schema<ITrade>({
  tradeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  direction: {
    type: String,
    enum: ['UP', 'DOWN']
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  processedAt: {
    type: Date
  },
  lockId: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0,
    max: 5
  },
  errorMessage: {
    type: String
  },
  appliedToBalance: {
    type: Boolean,
    default: false
  },
  profit: {
    type: Number
  },
  result: {
    win: Boolean,
    profit: Number,
    multiplier: Number
  }
}, {
  timestamps: true
});

// Indexes for performance
TradeSchema.index({ userId: 1, sessionId: 1, status: 1 });
TradeSchema.index({ createdAt: 1, status: 1 });
TradeSchema.index({ tradeId: 1, status: 1 });

export const Trade = mongoose.models.Trade || mongoose.model<ITrade>('Trade', TradeSchema);
