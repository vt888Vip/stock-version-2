import mongoose, { Schema, Document } from 'mongoose';

export interface IBank extends Document {
  name: string;
  accountNumber: string;
  accountHolder: string;
  branch?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const BankSchema = new Schema<IBank>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  accountNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  accountHolder: {
    type: String,
    required: true,
    trim: true
  },
  branch: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index để tối ưu query (accountNumber đã có unique index)
BankSchema.index({ status: 1 });
BankSchema.index({ createdAt: -1 });

export default mongoose.models.Bank || mongoose.model<IBank>('Bank', BankSchema);
