'use client';

import { useEffect } from 'react';
import { initializeTradeWorker } from '@/lib/tradeWorker';

export default function TradeWorkerInitializer() {
  useEffect(() => {
    // Chỉ khởi động worker ở client side
    if (typeof window !== 'undefined') {
      console.log('🚀 Khởi động Trade Worker...');
      initializeTradeWorker();
    }
  }, []);

  // Component này không render gì
  return null;
}
