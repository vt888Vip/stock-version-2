import mongoose, { Schema, Document } from 'mongoose';

export interface ITradeLock extends Document {
  tradeId: string;
  userId: mongoose.Types.ObjectId;
  sessionId: string;
  lockExpiry: Date;
  createdAt: Date;
  status: 'active' | 'expired' | 'released';
  lockType: 'trade' | 'balance';
}

const TradeLockSchema = new Schema<ITradeLock>({
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
  lockExpiry: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'released'],
    default: 'active',
    index: true
  },
  lockType: {
    type: String,
    enum: ['trade', 'balance'],
    default: 'trade'
  }
}, {
  timestamps: true
});

// Indexes for performance
TradeLockSchema.index({ tradeId: 1, status: 1 });
TradeLockSchema.index({ userId: 1, status: 1 });
TradeLockSchema.index({ lockExpiry: 1, status: 1 });
TradeLockSchema.index({ createdAt: 1, status: 1 });

// TTL index để tự động xóa expired locks
TradeLockSchema.index({ lockExpiry: 1 }, { expireAfterSeconds: 0 });

export const TradeLock = mongoose.models.TradeLock || mongoose.model<ITradeLock>('TradeLock', TradeLockSchema);
