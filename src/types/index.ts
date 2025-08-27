// User types
export interface User {
  _id: string
  username: string
  fullName: string
  phone: string
  email?: string
  balance: Balance
  role: "user" | "admin"
  bankInfo?: BankInfo
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ✅ CHUẨN HÓA: Balance luôn là object
export interface Balance {
  available: number  // Số dư khả dụng
  frozen: number     // Số dư đã đóng băng
}

// Bank information
export interface BankInfo {
  bankName: string
  accountNumber: string
  accountName: string
}

// Trading session
export interface Session {
  _id: string
  sessionId: string
  result: "up" | "down" | "pending"
  startTime: string
  endTime: string
  startPrice?: number
  endPrice?: number
  isActive: boolean
  isCompleted: boolean
  createdAt: string
}

// Deposit request
export interface Deposit {
  _id: string
  user: User | string
  amount: number
  bankInfo: {
    bankName: string
    accountNumber: string
    accountName: string
    transferContent?: string
  }
  status: "pending" | "approved" | "rejected"
  proofImage?: string
  notes?: string
  approvedBy?: User | string
  approvedAt?: string
  createdAt: string
  updatedAt: string
}

// Withdrawal request
export interface Withdrawal {
  _id: string
  user: User | string
  amount: number
  bank: BankInfo
  status: "pending" | "processing" | "completed" | "rejected"
  notes?: string
  processedBy?: User | string
  processedAt?: string
  createdAt: string
  updatedAt: string
}

// Order
export interface Order {
  _id: string
  user: User | string
  session: Session | string
  type: "up" | "down"
  amount: number
  result: "win" | "lose" | "pending"
  payout: number
  createdAt: string
  updatedAt: string
}

// System settings
export interface Settings {
  _id: string
  bankDetails: BankInfo[]
  depositLimits: {
    min: number
    max: number
  }
  withdrawalLimits: {
    min: number
    max: number
  }
  tradingSettings: {
    minBet: number
    maxBet: number
    winRate: number
  }
  createdAt: string
  updatedAt: string
}

// Polling statistics
export interface PollingStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime: number;
}

// Authentication
export interface AuthResponse {
  token: string
  user: User
}

// Error response
export interface ErrorResponse {
  message: string
  error?: string
}
