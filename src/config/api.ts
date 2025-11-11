const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    // Phía server - sử dụng biến môi trường hoặc domain mặc định
    return process.env.NEXT_PUBLIC_APP_URL || 
           (process.env.NODE_ENV === 'production' 
             ? 'https://newlondonfinancial.com'
             : 'http://localhost:3000');
  }

  // Phía client - tự động detect protocol và domain
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  
  // Sử dụng domain hiện tại (tự động detect)
  return `${protocol}//${hostname}${window.location.port ? ':' + window.location.port : ''}`;
};

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  ENDPOINTS: {
    // Authentication
    AUTH: {
      LOGIN: '/api/auth/login',
      LOGOUT: '/api/auth/logout',
      ME: '/api/auth/me',
      REGISTER: '/api/register',
      SETUP: '/api/setup',
    },
    
    // Users
    USERS: {
      BASE: '/api/users',
      BANK_INFO: '/api/users/bank-info',
      UPDATE_BANK_INFO: '/api/users/bank-info',
    },
    
    // Trades
    TRADES: {
      BASE: '/api/trades',
      BY_ID: (id: string) => `/api/trades/${id}`,
    },
    
    // Orders
    ORDERS: {
      BASE: '/api/orders',
      HISTORY: '/api/orders/history',
    },
    
    // Trading Sessions
    TRADING_SESSIONS: {
      BASE: '/api/trading-sessions',
      RESULT: '/api/trading-sessions/result',
    },
    
    // Deposits
    DEPOSITS: {
      BASE: '/api/deposits',
      HISTORY: '/api/deposits/history',
    },
    
    // Withdrawals
    WITHDRAWALS: {
      BASE: '/api/withdrawals',
      HISTORY: '/api/withdrawals/history',
    },
    
    // Admin
    ADMIN: {
      // Users
      USERS: {
        BASE: '/api/admin/users',
        BY_ID: (id: string) => `/api/admin/users/${id}`,
      },
      
      // Deposits
      DEPOSITS: {
        BASE: '/api/admin/deposits',
        BY_ID: (id: string) => `/api/admin/deposits/${id}`,
      },
      
      // Withdrawals
      WITHDRAWALS: {
        BASE: '/api/admin/withdrawals',
        BY_ID: (id: string) => `/api/admin/withdrawals/${id}`,
      },
      
      // Verification
      VERIFICATION: {
        REQUESTS: '/api/admin/verification-requests',
        BY_ID: (id: string) => `/api/admin/verification-requests/${id}`,
      },
      
      // Stats
      STATS: {
        BASE: '/api/admin/stats',
      },
    },
    
    // Upload
    UPLOAD: {
      BASE: '/api/upload',
      BLOB: '/api/blob',
      TEST_BLOB: '/api/test-blob',
    },
  },
  
  // Helper functions
  getFullUrl: (endpoint: string) => {
    return `${getApiBaseUrl()}${endpoint}`;
  },
  
  // Default headers
  getHeaders: (token?: string) => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  },
};