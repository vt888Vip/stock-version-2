"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { useToast } from "@/components/ui/use-toast";
import { useSocket } from '@/contexts/SocketContext';


import { Loader2, AlertCircle, RefreshCw, ArrowDown, ArrowUp, ChevronDown, Plus, Minus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import RightColumn from './RightColumn';
import TradeHistory from './TradeHistory';
import LiquidityTable from '@/components/LiquidityTable';
import TradingViewTickerTape from '@/components/TradingViewTickerTape';
import TradingViewAdvancedChart from '@/components/TradingViewAdvancedChart';
import SymbolSelector from '@/components/SymbolSelector';

// Types
export interface TradeHistoryRecord {
  id: string;
  sessionId: string;
  direction: "UP" | "DOWN";
  amount: number;
  status: "success" | "completed" | "pending" | "queued";
  result: "win" | "lose" | null;
  profit: number;
  createdAt: string;
}

// ✅ XÓA: Interface TradeResult không còn được sử dụng
// Thay thế bằng tradeResults array để lưu nhiều kết quả

const QUICK_AMOUNTS = [100000, 1000000, 5000000, 10000000, 30000000, 50000000, 100000000, 200000000, 500000000];
const SESSION_DURATION = 60; // 60 seconds per session
const RESULT_DELAY = 12; // 12 seconds delay for result (giữ nguyên để tạo kịch tính)

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const formatAmount = (value: string): string => {
  const num = parseFloat(value);
  return isNaN(num) ? '' : num.toLocaleString('vi-VN');
};

// Hàm sync balance đơn giản - chỉ dùng khi cần thiết
async function syncBalance(
  setBalance: React.Dispatch<React.SetStateAction<number>>, 
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>, 
  setLastBalanceSync?: React.Dispatch<React.SetStateAction<number>>
) {
  setIsSyncing(true);
  try {
    const res = await fetch('/api/user/balance/sync', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });
    const data = await res.json();
    
    if (data.success) {
      const newBalance = data.balance.available;
      setBalance(newBalance);
      if (setLastBalanceSync) {
        setLastBalanceSync(Date.now());
      }
    }
  } catch (error) {
    console.error('❌ [BALANCE] Error syncing balance:', error);
  }
  setIsSyncing(false);
}

export default function TradePage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { socket, isConnected } = useSocket();
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [frozenBalance, setFrozenBalance] = useState<number>(0);
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryRecord[]>([]);

  // Utility function để deduplicate trade history
  const deduplicateTradeHistory = (trades: TradeHistoryRecord[]): TradeHistoryRecord[] => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    
    const filtered = trades.filter(trade => {
      if (seen.has(trade.id)) {
        duplicates.push(trade.id);
        console.warn('🚨 Duplicate trade found:', trade.id);
        return false;
      }
      seen.add(trade.id);
      return true;
    });
    
    if (duplicates.length > 0) {
      console.warn('🚨 Found duplicate trades:', duplicates);
    }
    
    return filtered;
  };

  // Utility function để validate và format date
  const validateAndFormatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('🚨 Invalid date:', dateString, 'using current date');
        return new Date().toISOString();
      }
      return date.toISOString();
    } catch (error) {
      console.warn('🚨 Date parsing error:', error, 'using current date');
      return new Date().toISOString();
    }
  };
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(SESSION_DURATION);
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedAction, setSelectedAction] = useState<"UP" | "DOWN" | null>(null);
  // ✅ SỬA: Lưu nhiều trade results thay vì chỉ 1
  const [tradeResults, setTradeResults] = useState<Array<{ tradeId: string; status: string; profit: number; amount: number }>>([]);

  const [sessionStatus, setSessionStatus] = useState<'ACTIVE' | 'PREDICTED' | 'COMPLETED'>('ACTIVE');
  const [chartSymbol, setChartSymbol] = useState('TVC:GOLD');
  const [isSyncingBalance, setIsSyncingBalance] = useState(false);

  // Thêm state cho ngày và giờ hiện tại
  const [currentDate, setCurrentDate] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  // Thêm state cho countdown cập nhật sau 12 giây
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);
  const [isBalanceLocked, setIsBalanceLocked] = useState(false);
  const [lastBalanceSync, setLastBalanceSync] = useState<number>(0);
  const [tradesInCurrentSession, setTradesInCurrentSession] = useState<number>(0);
  
  // ✅ THÊM: State để kiểm soát polling khi đang đặt lệnh
  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  
  // ✅ FIX: State để track sequence number cho socket events
  const [lastSequence, setLastSequence] = useState(0);

  // ✅ FIX: Fetch balance từ server thay vì tự tính
  const fetchBalanceFromServer = async () => {
    try {
      const res = await fetch('/api/user/balance', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await res.json();
      
      if (data.success) {
        setBalance(data.balance.available);
        setFrozenBalance(data.balance.frozen);
      }
    } catch (error) {
      console.error('❌ [BALANCE SYNC] Error fetching balance:', error);
    }
  };

  // ✅ FIX: Debounce balance updates để tránh fetch quá nhiều
  const [balanceUpdateTimeout, setBalanceUpdateTimeout] = useState<NodeJS.Timeout | null>(null);

  // Listen for balance:updated events from Socket.IO
  useEffect(() => {
    const handleBalanceUpdate = (event: CustomEvent) => {
      const { profit, result, amount, tradeId, sequence } = event.detail;
      // console.log('💰 Balance update received from Socket.IO:', event.detail);
      
      // ✅ FIX: Chỉ xử lý events có sequence mới hơn (bỏ qua nếu bằng nhau)
      if (sequence && sequence < lastSequence) {
        console.log('⚠️ Ignoring old balance event:', sequence, '<', lastSequence);
        return;
      }
      
      if (sequence) {
        setLastSequence(sequence);
      }
      
      // ✅ FIX: Chỉ cập nhật trade results, KHÔNG tự tính balance
      setTradeResults(prev => {
        // ✅ SỬA: Check duplicate trước khi thêm
        const existingIndex = prev.findIndex(r => r.tradeId === event.detail.tradeId);
        if (existingIndex >= 0) {
          // Update existing result
          const newResults = [...prev];
          newResults[existingIndex] = {
            tradeId: event.detail.tradeId,
            status: result,
            profit: profit,
            amount: amount
          };
          // console.log('📊 [TRADE RESULTS] Updated existing:', newResults);
          return newResults;
        } else {
          // Add new result
          const newResults = [
            ...prev,
            {
              tradeId: event.detail.tradeId,
              status: result,
              profit: profit,
              amount: amount
            }
          ];
          // console.log('📊 [TRADE RESULTS] Added new:', newResults);
          return newResults;
        }
      });
      
      // ✅ FIX: Debounce fetch balance từ server
      if (balanceUpdateTimeout) {
        clearTimeout(balanceUpdateTimeout);
      }
      
      const timeout = setTimeout(() => {
        fetchBalanceFromServer();
      }, 500); // Debounce 500ms
      
      setBalanceUpdateTimeout(timeout);
    };

    const handleTradePlaced = (event: CustomEvent) => {
      const { tradeId, sessionId, direction, amount, type } = event.detail;
      // console.log('🔍 [DEBUG] handleTradePlaced called with:', event.detail);
      
      // ✅ FIX: Fetch balance từ server thay vì tự tính
      fetchBalanceFromServer();
      
      // Thêm trade mới vào trade history
      const newTradeRecord: TradeHistoryRecord = {
        id: tradeId,
        sessionId: sessionId,
        direction: direction,
        amount: amount || 0,
        status: 'pending',
        result: null,
        profit: 0,
        createdAt: new Date().toISOString(),
      };
      
      // Thêm vào đầu danh sách trade history (deduplicate)
      setTradeHistory(prev => {
        // Kiểm tra xem trade đã tồn tại chưa
        const existingIndex = prev.findIndex(t => t.id === newTradeRecord.id);
        if (existingIndex >= 0) {
          // Cập nhật trade hiện có
          const updated = [...prev];
          updated[existingIndex] = newTradeRecord;
          return updated;
        } else {
          // Thêm trade mới vào đầu
          return [newTradeRecord, ...prev];
        }
      });
      
      // Tăng số trades trong session hiện tại
      setTradesInCurrentSession(prev => {
        const newValue = prev + 1;
        // console.log('🔍 [DEBUG] Tăng tradesInCurrentSession:', prev, '→', newValue);
        return newValue;
      });
    };

    const handleTradeCompleted = (event: CustomEvent) => {
      const { tradeId, sessionId, result, profit, amount, direction, sequence } = event.detail;
      // console.log('🎉 Trade completed event received from Socket.IO:', event.detail);
      
      // ✅ FIX: Chỉ xử lý events có sequence mới hơn (bỏ qua nếu bằng nhau)
      if (sequence && sequence < lastSequence) {
        console.log('⚠️ Ignoring old trade completed event:', sequence, '<', lastSequence);
        return;
      }
      
      if (sequence) {
        setLastSequence(sequence);
      }
      
      // ✅ FIX: Fetch balance từ server thay vì tự tính
      fetchBalanceFromServer();
      
      // ✅ FIX: Thêm trade result mới vào danh sách
      setTradeResults(prev => [
        ...prev,
        {
          tradeId: tradeId,
          status: result,
          profit: profit,
          amount: amount
        }
      ]);
      
      // Giảm số trades trong session hiện tại
      setTradesInCurrentSession(prev => {
        const newValue = Math.max(0, prev - 1);
        // console.log('🔍 [DEBUG] Giảm tradesInCurrentSession (completed):', prev, '→', newValue);
        return newValue;
      });
    };

    const handleTradeHistoryUpdated = (event: CustomEvent) => {
      const { action, trade } = event.detail;
      
      if (action === 'add') {
        // Thêm trade mới vào trade history
        const newTradeRecord: TradeHistoryRecord = {
          id: trade.id,
          sessionId: trade.sessionId,
          direction: trade.direction,
          amount: trade.amount,
          status: trade.status,
          result: trade.result,
          profit: trade.profit,
          createdAt: validateAndFormatDate(trade.createdAt),
        };
        
        setTradeHistory(prev => {
          // Kiểm tra xem trade đã tồn tại chưa
          const existingIndex = prev.findIndex(t => t.id === newTradeRecord.id);
          if (existingIndex >= 0) {
            // Cập nhật trade hiện có
            const updated = [...prev];
            updated[existingIndex] = newTradeRecord;
            return updated;
          } else {
            // Thêm trade mới vào đầu
            return [newTradeRecord, ...prev];
          }
        });
        setTradesInCurrentSession(prev => prev + 1);
        
      } else if (action === 'update') {
        // Cập nhật trade hiện có trong trade history
        setTradeHistory(prev => {
          // Tìm trade với tradeId (format từ database)
          const existingIndex = prev.findIndex(t => 
            t.id === trade.id || 
            t.id === trade.tradeId ||
            t.id === trade.id
          );
          
          // console.log('🔍 Found trade at index:', existingIndex);
          
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = {
              id: trade.id,
              sessionId: trade.sessionId,
              direction: trade.direction,
              amount: trade.amount,
              status: trade.status,
              result: trade.result,
              profit: trade.profit,
              createdAt: validateAndFormatDate(trade.createdAt),
            };
            // console.log('✅ Updated trade in history:', updated[existingIndex]);
            return updated;
          } else {
            // console.log('❌ Trade not found in history, adding as new');
            // Nếu không tìm thấy, thêm như trade mới
            const newTradeRecord: TradeHistoryRecord = {
              id: trade.id,
              sessionId: trade.sessionId,
              direction: trade.direction,
              amount: trade.amount,
              status: trade.status,
              result: trade.result,
              profit: trade.profit,
              createdAt: validateAndFormatDate(trade.createdAt),
            };
            return [newTradeRecord, ...prev];
          }
        });
        
        // Giảm số trades trong session hiện tại nếu trade hoàn thành
        if (trade.status === 'completed') {
          setTradesInCurrentSession(prev => Math.max(0, prev - 1));
          // console.log('✅ Trade completed, reduced trades in session');
        }
      }
    };

    const handleBatchTradesCompleted = (event: CustomEvent) => {
      // console.log('🎉 Batch trades completed event received:', event.detail);
      
      const { trades, sessionId, totalTrades, totalWins, totalLosses } = event.detail;
      
      // Cập nhật trade results cho tất cả trades
      setTradeResults(prev => {
        const newResults = [...prev];
        
        trades.forEach((trade: any) => {
          const existingIndex = newResults.findIndex(r => r.tradeId === trade.tradeId);
          if (existingIndex >= 0) {
            // Update existing
            newResults[existingIndex] = {
              tradeId: trade.tradeId,
              status: trade.result,
              profit: trade.profit,
              amount: trade.amount
            };
          } else {
            // Add new
            newResults.push({
              tradeId: trade.tradeId,
              status: trade.result,
              profit: trade.profit,
              amount: trade.amount
            });
          }
        });
        
        // console.log('📊 [TRADE RESULTS] Batch updated:', newResults);
        return newResults;
      });
      
    };

    // Add event listeners
    window.addEventListener('balance:updated', handleBalanceUpdate as EventListener);
    window.addEventListener('trade:placed', handleTradePlaced as EventListener);
    window.addEventListener('trade:completed', handleTradeCompleted as EventListener);
    window.addEventListener('trades:batch:completed', handleBatchTradesCompleted as EventListener);
    window.addEventListener('trade:history:updated', handleTradeHistoryUpdated as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('balance:updated', handleBalanceUpdate as EventListener);
      window.removeEventListener('trade:placed', handleTradePlaced as EventListener);
      window.removeEventListener('trade:completed', handleTradeCompleted as EventListener);
      window.removeEventListener('trades:batch:completed', handleBatchTradesCompleted as EventListener);
      window.removeEventListener('trade:history:updated', handleTradeHistoryUpdated as EventListener);
    };
  }, [lastSequence]);

  // ✅ FIX: Reconnection handling - fetch balance khi socket reconnect
  useEffect(() => {
    if (socket?.connected) {
      // console.log('🔄 Socket reconnected, fetching balance from server');
      fetchBalanceFromServer();
    }
  }, [socket?.connected]);

  // ✅ FIX: Periodic sync - fetch balance mỗi 30 giây để đảm bảo đồng bộ
  useEffect(() => {
    const interval = setInterval(() => {
      // console.log('🔄 Periodic balance sync');
      fetchBalanceFromServer();
    }, 30000); // Sync mỗi 30 giây
    
    return () => clearInterval(interval);
  }, []);

  // Load user balance and current session
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
      toast({ variant: 'destructive', title: 'Vui lòng đăng nhập để sử dụng tính năng này' });
      return;
    }

    const loadUserData = async () => {
      try {
        let currentSessionId = '';
        
        // Lấy phiên giao dịch hiện tại
        const sessionResponse = await fetch('/api/trading-sessions');
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.success) {
            currentSessionId = sessionData.currentSession.sessionId;
            setCurrentSessionId(sessionData.currentSession.sessionId);
            // ✅ SỬA: Chỉ set timeLeft khi load lần đầu, không ghi đè local timer
            if (timeLeft === SESSION_DURATION) {
              setTimeLeft(sessionData.currentSession.timeLeft);
            }
          }
        }

        // Lấy lịch sử giao dịch từ database
        const tradeHistoryResponse = await fetch('/api/trades/history', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });

        if (tradeHistoryResponse.ok) {
          const tradeHistoryData = await tradeHistoryResponse.json();
          // console.log('📊 [HISTORY] Response data:', tradeHistoryData);
          
          if (tradeHistoryData.trades && tradeHistoryData.trades.length > 0) {
            // Chuyển đổi dữ liệu từ database sang format của component
            const formattedTrades: TradeHistoryRecord[] = tradeHistoryData.trades.map((trade: any) => ({
              id: trade.id || trade._id || trade._id?.toString() || 'unknown',
              sessionId: trade.sessionId,
              direction: trade.direction || 'UP',
              amount: trade.amount || 0,
              status: trade.status || 'pending',
              result: trade.result || null,
              profit: trade.profit || 0,
              createdAt: validateAndFormatDate(trade.createdAt || new Date().toISOString()),
            }));

            setTradeHistory(deduplicateTradeHistory(formattedTrades));
            
            // Đếm số lệnh pending trong phiên hiện tại
            const currentSessionTrades = formattedTrades.filter(trade => 
              trade.sessionId === currentSessionId && 
              trade.status === 'pending'
            );
            setTradesInCurrentSession(currentSessionTrades.length);
          }
        }

        setIsLoading(false);
      } catch (error) {
        setError('Không thể tải dữ liệu. Vui lòng thử lại.');
        setIsLoading(false);
      }
    };

    if (user) {
      loadUserData();
    }
  }, [authLoading, user, router, toast]);

  // ✅ SIMPLIFIED: Load balance ban đầu khi component mount
  useEffect(() => {
    if (!authLoading && user) {
      const loadInitialBalance = async () => {
        try {
          const balanceResponse = await fetch('/api/user/balance', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
          });
          
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            if (balanceData.success) {
              const initialBalance = balanceData.balance.available;
              const initialFrozenBalance = balanceData.balance.frozen || 0;
              setBalance(initialBalance);
              setFrozenBalance(initialFrozenBalance);
              setLastBalanceSync(Date.now());
            }
          }
        } catch (error) {
          console.error('❌ [INIT] Lỗi khi load balance ban đầu:', error);
        }
      };

      loadInitialBalance();
    }
  }, [authLoading, user]);

  // ✅ TỐI ƯU: Smart polling cho session updates
  useEffect(() => {
    // ✅ TẠM DỪNG POLLING: Không polling khi đang đặt lệnh
    if (isPlacingTrade) {
      // console.log('⏸️ Tạm dừng session polling - đang đặt lệnh');
      return;
    }

    const updateSession = async () => {
      try {
        // ✅ SỬ DỤNG MONITORING: Wrap API call với performance tracking
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 giây timeout
        
        const sessionResponse = await fetch('/api/trading-sessions/session-change', {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!sessionResponse.ok) {
          throw new Error(`Session update failed: ${sessionResponse.status} ${sessionResponse.statusText}`);
        }
        
        const sessionData = await sessionResponse.json();
        
        if (sessionData.success) {
            const newSessionId = sessionData.currentSession.sessionId;
            const newTimeLeft = sessionData.currentSession.timeLeft;
            const sessionChanged = sessionData.sessionChanged;
            
            // ✅ UPDATE STATE: Cập nhật state khi có session mới
            if (sessionChanged || newSessionId !== currentSessionId) {
              setCurrentSessionId(newSessionId);
              setTimeLeft(newTimeLeft);
            }
            
            // ✅ SCHEDULER TIMER: Không cập nhật timeLeft từ polling nữa
            // Scheduler sẽ gửi timer updates qua Socket.IO
            // if (sessionChanged || newSessionId !== currentSessionId) {
            //   setTimeLeft(newTimeLeft);
            // }
            
            // Nếu phiên thay đổi, cập nhật sessionId và reset các trạng thái
            if (sessionChanged || newSessionId !== currentSessionId) {
              setCurrentSessionId(newSessionId);
              
              // Reset các trạng thái liên quan khi session mới bắt đầu
              setTradeResults([]); // ✅ SỬA: Reset trade results khi bắt đầu phiên mới
              setTradesInCurrentSession(0); // Reset số lệnh trong phiên mới
              // console.log('🔄 Phiên mới bắt đầu:', newSessionId);
            }
            
            setSessionStatus(sessionData.currentSession.status);
          }
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            console.warn('⏰ Session update timeout - có thể do mạng chậm');
          } else if (error.message.includes('Failed to fetch')) {
            console.warn('🌐 Lỗi kết nối mạng - kiểm tra kết nối internet');
          } else {
            console.error('❌ Lỗi khi cập nhật phiên:', error);
          }
        } else {
          console.error('❌ Lỗi không xác định khi cập nhật phiên:', error);
        }
        
        // ✅ FALLBACK: Sử dụng API backup nếu session-change fail
        try {
          const fallbackResponse = await fetch('/api/trading-sessions');
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            if (fallbackData.success) {
              // ✅ SỬA: Chỉ cập nhật sessionId, không ghi đè timeLeft
              setCurrentSessionId(fallbackData.currentSession.sessionId);
              setSessionStatus(fallbackData.currentSession.status);
              // console.log('✅ Sử dụng fallback API thành công');
            }
          }
        } catch (fallbackError) {
          console.error('❌ Fallback API cũng thất bại:', fallbackError);
        }
      }
    };
    
    // Update immediately
    updateSession();
    
    // ✅ SMART POLLING: Tối ưu polling dựa trên trạng thái
    let interval;
    let retryCount = 0;
    const maxRetries = 3;
    
    const smartUpdateSession = async () => {
      try {
        await updateSession();
        retryCount = 0; // Reset retry count khi thành công
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.warn(`⚠️ Đã thử ${maxRetries} lần, tạm dừng polling trong 30 giây`);
          setTimeout(() => {
            retryCount = 0;
            updateSession();
          }, 30000);
          return;
        }
      }
    };
    
    // ✅ SỬA: Tối ưu polling để không gây conflict với local timer
    if (timeLeft <= 0) {
      interval = 3000; // Poll mỗi 3 giây khi timer = 0 (chờ phiên mới)
    } else if (timeLeft <= 5) {
      interval = 15000; // Poll mỗi 15 giây khi gần về 0 (giảm frequency)
    } else if (timeLeft <= 30) {
      interval = 30000; // Poll mỗi 30 giây khi còn ít thời gian
    } else {
      interval = 60000; // Poll mỗi 60 giây khi còn nhiều thời gian (giảm frequency)
    }
    
    const sessionInterval = setInterval(smartUpdateSession, interval);
    
    return () => clearInterval(sessionInterval);
  }, [currentSessionId, timeLeft, isPlacingTrade]); // ✅ Thêm isPlacingTrade vào dependency

  // ✅ SCHEDULER TIMER: Nhận timer updates từ Scheduler thay vì local timer
  useEffect(() => {
    const handleTimerUpdate = (event: CustomEvent) => {
      const { sessionId, timeLeft: serverTimeLeft } = event.detail;
      
      // ✅ FIX: Cập nhật session mới nếu khác với session hiện tại
      if (sessionId !== currentSessionId) {
        setCurrentSessionId(sessionId);
        setTimeLeft(serverTimeLeft);
        return;
      }
      
      // Cập nhật timer cho session hiện tại
      setTimeLeft(serverTimeLeft);
    };

    // Add event listener
    window.addEventListener('session:timer:update', handleTimerUpdate as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('session:timer:update', handleTimerUpdate as EventListener);
    };
  }, [currentSessionId]);



  // ✅ SCHEDULER SYSTEM: Không cần trigger check-results nữa
  // Scheduler sẽ tự động xử lý settlement
  useEffect(() => {
    if (timeLeft === 0) {
      
      // Chỉ sync balance, không cần gọi check-results
      const syncBalanceAfterDelay = async () => {
        try {
          if (!isPlacingTrade) {
            await syncBalance(setBalance, setIsSyncingBalance, setLastBalanceSync);
          }
        } catch (error) {
          console.error('Lỗi khi sync balance:', error);
        } finally {
          setUpdateCountdown(null);
          setIsBalanceLocked(false);
        }
      };

      // Sync balance sau 12 giây
      setTimeout(syncBalanceAfterDelay, 12000);
    }
  }, [timeLeft, currentSessionId, toast, isPlacingTrade]);




  // Track which trades have been processed to prevent duplicate updates
  const processedTradesRef = useRef<Set<string>>(new Set());

  // ✅ SCHEDULER EVENTS: Lắng nghe events từ Scheduler
  useEffect(() => {
    const handleTradeWindowOpened = (event: CustomEvent) => {
      const data = event.detail;
      console.log('📈 [FRONTEND-SCHEDULER] ===== TRADE WINDOW OPENED =====');
      console.log('📈 [FRONTEND-SCHEDULER] Session:', data.sessionId);
      console.log('📈 [FRONTEND-SCHEDULER] Trade window opened at:', data.timestamp);
      console.log('📈 [FRONTEND-SCHEDULER] ===== TRADE WINDOW OPENED =====');
      // Có thể cập nhật UI state nếu cần
    };

    const handleTradeWindowClosed = (event: CustomEvent) => {
      const data = event.detail;
      console.log('📉 [FRONTEND-SCHEDULER] ===== TRADE WINDOW CLOSED =====');
      console.log('📉 [FRONTEND-SCHEDULER] Session:', data.sessionId);
      console.log('📉 [FRONTEND-SCHEDULER] Trade window closed at:', data.timestamp);
      console.log('📉 [FRONTEND-SCHEDULER] ===== TRADE WINDOW CLOSED =====');
      // Có thể cập nhật UI state nếu cần
    };

    const handleSettlementTriggered = (event: CustomEvent) => {
      const data = event.detail;
    };

    const handleSettlementCompleted = (event: CustomEvent) => {
      const data = event.detail;
      console.log('✅ [FRONTEND-SCHEDULER] ===== SETTLEMENT COMPLETED =====');
      console.log('✅ [FRONTEND-SCHEDULER] Session:', data.sessionId);
      console.log('✅ [FRONTEND-SCHEDULER] Total wins:', data.totalWins);
      console.log('✅ [FRONTEND-SCHEDULER] Total losses:', data.totalLosses);
      console.log('✅ [FRONTEND-SCHEDULER] Completed at:', data.timestamp);
      console.log('✅ [FRONTEND-SCHEDULER] ===== SETTLEMENT COMPLETED =====');
    };

    const handleSessionCompleted = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🏁 [FRONTEND-SCHEDULER] ===== SESSION COMPLETED =====');
      console.log('🏁 [FRONTEND-SCHEDULER] Session:', data.sessionId);
      console.log('🏁 [FRONTEND-SCHEDULER] Completed at:', data.timestamp);
      console.log('🏁 [FRONTEND-SCHEDULER] ===== SESSION COMPLETED =====');
      // Có thể cập nhật UI state nếu cần
    };

    // Add event listeners
    window.addEventListener('session:trade_window:opened', handleTradeWindowOpened as EventListener);
    window.addEventListener('session:trade_window:closed', handleTradeWindowClosed as EventListener);
    window.addEventListener('session:settlement:triggered', handleSettlementTriggered as EventListener);
    window.addEventListener('session:settlement:completed', handleSettlementCompleted as EventListener);
    window.addEventListener('session:completed', handleSessionCompleted as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('session:trade_window:opened', handleTradeWindowOpened as EventListener);
      window.removeEventListener('session:trade_window:closed', handleTradeWindowClosed as EventListener);
      window.removeEventListener('session:settlement:triggered', handleSettlementTriggered as EventListener);
      window.removeEventListener('session:settlement:completed', handleSettlementCompleted as EventListener);
      window.removeEventListener('session:completed', handleSessionCompleted as EventListener);
    };
  }, [toast]);

  // Reset isBalanceLocked khi session mới bắt đầu
  useEffect(() => {
    if (timeLeft > 0 && isBalanceLocked) {
      setIsBalanceLocked(false);
    }
  }, [timeLeft, isBalanceLocked]);

  // Quản lý countdown cập nhật
  useEffect(() => {
    if (updateCountdown === null || updateCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setUpdateCountdown(prev => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [updateCountdown]);



  // Cập nhật ngày và giờ chỉ ở client
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      setCurrentDate(`${day}/${month}/${year}`);
      setCurrentTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    
    // Chỉ cập nhật khi component đã mount (tránh hydration mismatch)
    if (typeof window !== 'undefined') {
      updateDateTime();
      const interval = setInterval(updateDateTime, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  // Tránh gọi syncBalance quá thường xuyên (tối thiểu 5 giây giữa các lần gọi)
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastSync = now - lastBalanceSync;
    const minSyncInterval = 5000; // 5 giây
    
    if (timeSinceLastSync < minSyncInterval) {
      // console.log('⏳ [BALANCE] Chưa đủ thời gian để sync balance lại:', Math.ceil((minSyncInterval - timeSinceLastSync) / 1000), 'giây');
    }
  }, [lastBalanceSync]);

  // Cập nhật symbol biểu đồ mặc định
  useEffect(() => {
    setChartSymbol('TVC:GOLD');
  }, []);

  // Handle amount changes
  const addAmount = useCallback((value: number) => {
    setAmount(prev => {
      const current = parseFloat(prev) || 0;
      if (value < 0) return '0'; // Nhấn dấu trừ thì về 0 luôn
      const newAmount = current + value;
      return newAmount.toString();
    });
  }, []);

  // Handle trade action
  const handleAction = useCallback((direction: "UP" | "DOWN") => {
    const amountValue = parseFloat(amount);
    if (!amount || isNaN(amountValue) || amountValue < 100000) {
      toast({
        title: 'Lỗi',
        description: 'Số tiền phải lớn hơn hoặc bằng 100,000 VND',
        variant: 'destructive',
      });
      return;
    }
    if (amountValue > balance) {
      toast({
        title: 'Lỗi',
        description: 'Số dư không đủ để đặt lệnh',
        variant: 'destructive',
      });
      return;
    }
    setSelectedAction(direction);
    setIsConfirming(true);
  }, [amount, balance, toast]);

  // Handle deposit button click
  const handleDeposit = useCallback(() => {
    router.push('/deposit');
  }, [router]);

  // Confirm trade
  const confirmTrade = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    
    // ✅ THÊM: Kiểm tra và ngăn multiple calls
    if (isPlacingTrade || isSubmitting) {
      // console.log('🔄 [RACE PREVENTION] Đang xử lý lệnh trước, bỏ qua request này');
      return;
    }
    
    // Kiểm tra xem có đang trong quá trình loading không
    if (isLoading) {
      toast({
        title: 'Đang tải dữ liệu',
        description: 'Vui lòng đợi hệ thống tải xong dữ liệu',
        variant: 'destructive',
      });
      return;
    }

    if (!token) {
      toast({
        title: 'Lỗi xác thực',
        description: 'Không tìm thấy token đăng nhập. Vui lòng đăng nhập lại.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }
    if (!selectedAction || !amount || !currentSessionId) {
      toast({
        title: 'Thiếu thông tin',
        description: `Vui lòng kiểm tra lại: ${!selectedAction ? 'hướng lệnh' : ''} ${!amount ? 'số tiền' : ''} ${!currentSessionId ? 'phiên giao dịch' : ''}`,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }

    // Kiểm tra số tiền hợp lệ
    const amountValue = Number(amount);
    if (isNaN(amountValue) || amountValue < 100000) {
      toast({
        title: 'Số tiền không hợp lệ',
        description: 'Số tiền phải lớn hơn hoặc bằng 100,000 VND',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }

    // ✅ SET: Trạng thái đang đặt lệnh ngay từ đầu
    setIsSubmitting(true);
    setIsConfirming(false);
    setIsPlacingTrade(true);

    // Starting trade placement

    try {
      // Debug log request body
             // Lấy tên asset từ symbol hiện tại
       const getAssetName = (symbol: string) => {
         const symbolMap: Record<string, string> = {
           'TVC:GOLD': 'Vàng/Đô la Mỹ',
           'XAUUSD': 'Vàng/Đô la Mỹ',
           'GOLD': 'Vàng/Đô la Mỹ',
           'OANDA:XAUUSD': 'Vàng/Đô la Mỹ',
           'TVC:SILVER': 'Bạc/Đô la Mỹ',
           'XAGUSD': 'Bạc/Đô la Mỹ',
           'EURUSD': 'EUR/USD',
           'GBPUSD': 'GBP/USD',
           'USDJPY': 'USD/JPY',
           'BTCUSD': 'Bitcoin/USD',
           'ETHUSD': 'Ethereum/USD',
           'SPX': 'S&P 500',
           'DJI': 'Dow Jones',
           'IXIC': 'NASDAQ',
         };
         return symbolMap[symbol] || symbol;
       };

       const requestBody = {
         sessionId: currentSessionId,
         type: selectedAction === 'UP' ? 'buy' : 'sell',
         amount: Number(amount)
       };

      // Gọi API để đặt lệnh
      const response = await fetch('/api/trades/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(errorData.error || errorData.message || `Lỗi ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        
        const newTrade: TradeHistoryRecord = {
          id: data.tradeId || 'unknown',
          sessionId: currentSessionId,
          direction: selectedAction,
          amount: Number(amount),
          status: 'pending',
          result: null,
          profit: 0,
          createdAt: new Date().toISOString(),
        };

        setTradeHistory(prev => {
          // Kiểm tra xem trade đã tồn tại chưa
          const existingIndex = prev.findIndex(t => t.id === newTrade.id);
          if (existingIndex >= 0) {
            // Cập nhật trade hiện có
            const updated = [...prev];
            updated[existingIndex] = newTrade;
            return updated;
          } else {
            // Thêm trade mới vào đầu
            return [newTrade, ...prev];
          }
        });
        // Nếu có quản lý frozen, có thể cập nhật thêm ở đây

        setAmount('');
        setSelectedAction(null);

        // Cập nhật số lệnh trong phiên hiện tại
        const tradesInSession = data.tradesInSession || 1;
        setTradesInCurrentSession(tradesInSession);
        
        // Hiển thị thông tin về số lệnh đã đặt trong phiên
        const sessionInfo = tradesInSession > 1 ? ` (Lệnh thứ ${tradesInSession} trong phiên)` : '';
        

        toast({
          title: '✅ Đặt lệnh thành công!',
          description: `Lệnh ${selectedAction === 'UP' ? 'LÊN' : 'XUỐNG'} - ${formatCurrency(Number(amount))} - Đang đợi kết quả${sessionInfo}`,
          duration: 2500, // Hiển thị 2.5 giây cho giao diện điện thoại
        });

        // Trade placed successfully

        // ✅ CẬP NHẬT BALANCE NGAY (Optimistic UI)
        const tradeAmount = Number(amount);
        setBalance(prev => prev - tradeAmount);
        setFrozenBalance(prev => prev + tradeAmount);
        
        // Socket.IO event sẽ được gửi từ server
      }
    } catch (error) {
      console.error('Lỗi khi đặt lệnh:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Lỗi khi đặt lệnh',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setIsPlacingTrade(false); // ✅ RESET: Trạng thái đặt lệnh
    }
  }, [selectedAction, amount, currentSessionId, toast, isBalanceLocked, isPlacingTrade, isSubmitting]);

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2">Đang tải dữ liệu...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Đã xảy ra lỗi</h2>
        <p className="text-gray-600 mb-4 text-center">{error}</p>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Tải lại trang
        </Button>
      </div>
    );
  }

  return (
    <div className="max-h-screen h-screen bg-gray-900">
      <div className="p-1 md:p-8">
        <Dialog
          open={false} // ĐÃ XOÁ: Không mở Dialog kết quả thắng/thua nữa
          onOpenChange={() => {}}
        >
          {/* ĐÃ XOÁ: Nội dung Dialog kết quả thắng/thua */}
        </Dialog>

        <Dialog open={isConfirming} onOpenChange={setIsConfirming}>
          <DialogContent className="sm:max-w-[425px] bg-gray-800">
            <DialogHeader>
              <DialogTitle className="text-white text-center">
                Phiên hiện tại <span className="text-red-500">{currentSessionId || 'N/A'}</span>
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-gray-300 text-center">
              XÁC NHẬN
            </DialogDescription>
            <DialogFooter className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => setIsConfirming(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                className={`flex-1 ${selectedAction === "UP" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                onClick={confirmTrade}
                disabled={isSubmitting}
              >
                Xác nhận
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="max-w-7xl mx-auto">
          {/* Desktop Layout - Đặt lệnh bên trái, biểu đồ và lịch sử bên phải */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-6">
              <Card className="bg-white border border-gray-300 rounded-md shadow">
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <ChevronDown className="h-4 w-4 text-gray-700" />
                    <CardTitle className="text-gray-900 text-base font-medium">Đặt lệnh</CardTitle>
                    <span className="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded ml-auto" suppressHydrationWarning>
                      Phiên: {currentSessionId || 'N/A'}
                    </span>
                  </div>
                </CardHeader>
                                 <CardContent>
                                       {/* Hiển thị số dư */}
                                       <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between text-blue-900">
                        <span className="font-semibold">SỐ DƯ:</span>
                        <span className="text-lg font-bold" suppressHydrationWarning>{formatCurrency(balance || 0)} VND</span>
                      </div>
                      {/* Debug info - chỉ hiển thị trong development */}
                      {process.env.NODE_ENV === 'development' && (
                        <div className="mt-2 text-xs text-blue-700">
                          <div>Last Sync: {lastBalanceSync ? new Date(lastBalanceSync).toLocaleTimeString() : 'Never'}</div>
                          <div>Balance Locked: {isBalanceLocked ? 'Yes' : 'No'}</div>
                          <div>Syncing: {isSyncingBalance ? 'Yes' : 'No'}</div>
                          <div className="mt-1 pt-1 border-t border-blue-300">
                            <button 
                              onClick={async () => {
                                try {
                                  const response = await fetch('/api/test-balance', {
                                    headers: {
                                      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                                    }
                                  });
                                  const data = await response.json();
                                  if (data.success) {
                                    // console.log('🔍 [DEBUG] Balance Test Result:', data.data);
                                    alert(`Current: ${data.data.currentBalance.available} | Calculated: ${data.data.calculatedBalance.available}`);
                                  }
                                } catch (error) {
                                  console.error('Debug balance error:', error);
                                }
                              }}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                            >
                              Test Balance
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                   
                   <div className="mb-4">
                     <div className="flex justify-between items-center mb-2">
                       <label htmlFor="amount" className="text-sm text-gray-400">
                         Số tiền (VND)
                       </label>
                       <span className="text-xs text-gray-400">Tối thiểu: {formatCurrency(100000)}</span>
                     </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="icon" onClick={() => addAmount(-100000)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        id="amount"
                        type="text"
                        value={formatAmount(amount)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, "");
                          if (/^\d*$/.test(raw)) setAmount(raw);
                        }}
                        placeholder="Nhập số tiền"
                        suppressHydrationWarning
                      />
                      <Button variant="outline" size="icon" onClick={() => addAmount(100000)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {QUICK_AMOUNTS.map((value) => (
                        <Button
                          key={value}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-sm font-semibold bg-white hover:bg-gray-100"
                          onClick={() => addAmount(value)}
                        >
                          {value >= 1000000 ? `+${value / 1000000}M` : `+${value / 1000}K`}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1 mb-4 text-sm text-gray-900">
                    <div className="flex justify-between">
                      <span>Ngày:</span>
                      <span suppressHydrationWarning>{currentDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Giờ:</span>
                      <span suppressHydrationWarning>{currentTime}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Phiên hiện tại:</span>
                      <span suppressHydrationWarning>{currentSessionId || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="border border-red-600 rounded bg-gray-100 text-center py-3">
                      <div className="text-sm text-gray-900">Hãy đặt lệnh:</div>
                      <div className="text-xl font-bold text-red-600" suppressHydrationWarning>{String(timeLeft).padStart(2, '0')}s</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Button
                      type="button"
                      className="w-full h-14 bg-green-600 hover:bg-green-700 text-lg font-bold flex items-center justify-center"
                      onClick={() => handleAction("UP")}
                      disabled={isLoading || !amount || isSubmitting || balance <= 0}
                    >
                      LÊN <ArrowUp className="h-5 w-5 ml-2" />
                    </Button>
                    <Button
                      type="button"
                      className="w-full h-14 bg-red-600 hover:bg-red-700 text-lg font-bold flex items-center justify-center"
                      onClick={() => handleAction("DOWN")}
                      disabled={isLoading || !amount || isSubmitting || balance <= 0}
                    >
                      XUỐNG <ArrowDown className="h-5 w-5 ml-2" />
                    </Button>
                    
                    {/* Thông báo hết tiền trong form đặt lệnh */}
                    {balance <= 0 && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span className="text-red-700 font-semibold text-sm">Không thể đặt lệnh</span>
                        </div>
                        <p className="text-red-600 text-xs mb-2">
                          Số dư không đủ. Vui lòng nạp tiền trước.
                        </p>
                        <Button 
                          onClick={handleDeposit}
                          size="sm"
                          className="w-full bg-red-600 hover:bg-red-700 text-white text-xs"
                        >
                          <Wallet className="h-3 w-3 mr-1" />
                          Nạp tiền
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-300 rounded-md shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900">Cập nhật</CardTitle>
                </CardHeader>
                <CardContent>
                  <LiquidityTable />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8 space-y-6">
              {/* Market Data Ticker */}
              <Card className="bg-white border-gray-300 rounded-md shadow">
                <CardContent className="p-0">
                  <TradingViewTickerTape />
                </CardContent>
              </Card>

                             {/* Advanced Chart */}
               <Card className="bg-white border-gray-500 rounded-md shadow h-[500px]">
                 <CardContent className="p-2 h-full">
                   <TradingViewAdvancedChart 
                     key={chartSymbol} 
                     symbol={chartSymbol} 
                     interval="1"
                   />
                 </CardContent>
               </Card>

              {/* Trade History */}
              <TradeHistory tradeHistory={tradeHistory} formatCurrency={formatCurrency} />

              {/* Liquidity Table */}
              <Card className="bg-white border-gray-300 rounded-md shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900">Thanh khoản</CardTitle>
                </CardHeader>
                <CardContent>
                  <LiquidityTable />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Mobile Layout - Thứ tự: Biểu đồ → Số dư → Đặt lệnh → Lịch sử giao dịch - Full màn hình với margin nhẹ */}
          <div className="lg:hidden space-y-2 min-h-screen">
            {/* 1. Biểu đồ */}
            <div className="space-y-2">
              {/* Market Data Ticker */}
              <Card className="bg-white border border-gray-200 rounded-lg shadow-sm">
                <CardContent className="p-0">
                  <TradingViewTickerTape />
                </CardContent>
              </Card>

                             {/* Advanced Chart */}
               <Card className="bg-white border border-gray-200 rounded-lg shadow-sm h-[400px]">
                 <CardContent className="p-0 h-full">
                   <TradingViewAdvancedChart 
                     key={chartSymbol} 
                     symbol={chartSymbol} 
                     interval="1"
                   />
                 </CardContent>
               </Card>
            </div>

            {/* 3. Đặt lệnh */}
            <Card className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <ChevronDown className="h-4 w-4 text-gray-700" />
                  <CardTitle className="text-gray-900 text-base font-medium">Đặt lệnh</CardTitle>
                  <span className="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded ml-auto" suppressHydrationWarning>
                    Phiên: {currentSessionId || 'N/A'}
                  </span>
                </div>
              </CardHeader>
                             <CardContent>
                 {/* Hiển thị số dư */}
                                   <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between text-blue-900">
                      <span className="font-semibold text-sm">SỐ DƯ:</span>
                      <span className="text-base font-bold" suppressHydrationWarning>{formatCurrency(balance || 0)} VND</span>
                    </div>
                    {/* Debug info - chỉ hiển thị trong development */}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="mt-1 text-xs text-blue-700">
                        <div>Last Sync: {lastBalanceSync ? new Date(lastBalanceSync).toLocaleTimeString() : 'Never'}</div>
                        <div>Balance Locked: {isBalanceLocked ? 'Yes' : 'No'}</div>
                        <div>Syncing: {isSyncingBalance ? 'Yes' : 'No'}</div>
                        <div className="mt-1 pt-1 border-t border-blue-300">
                          <button 
                            onClick={async () => {
                              try {
                                const response = await fetch('/api/test-balance', {
                                  headers: {
                                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                                  }
                                });
                                const data = await response.json();
                                if (data.success) {
                                  // console.log('🔍 [DEBUG] Balance Test Result:', data.data);
                                  alert(`Current: ${data.data.currentBalance.available} | Calculated: ${data.data.calculatedBalance.available}`);
                                }
                              } catch (error) {
                                console.error('Debug balance error:', error);
                              }
                            }}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                          >
                            Test Balance
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                 
                 <div className="mb-3">
                   <div className="flex justify-between items-center mb-2">
                     <label htmlFor="amount-mobile" className="text-sm text-gray-400">
                       Số tiền (VND)
                     </label>
                     <span className="text-xs text-gray-400">Tối thiểu: {formatCurrency(100000)}</span>
                   </div>
                  <div className="flex items-center space-x-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => addAmount(-100000)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      id="amount-mobile"
                      type="text"
                      value={formatAmount(amount)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, "");
                        if (/^\d*$/.test(raw)) setAmount(raw);
                      }}
                      placeholder="Nhập số tiền"
                      suppressHydrationWarning
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => addAmount(100000)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {QUICK_AMOUNTS.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs font-semibold bg-white hover:bg-gray-100 h-8"
                        onClick={() => addAmount(value)}
                      >
                        {value >= 1000000 ? `+${value / 1000000}M` : `+${value / 1000}K`}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 mb-4 text-xs text-gray-900">
                  <div className="flex justify-between">
                    <span>Ngày:</span>
                    <span suppressHydrationWarning>{currentDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Giờ:</span>
                    <span suppressHydrationWarning>{currentTime}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Phiên hiện tại:</span>
                    <span suppressHydrationWarning>{currentSessionId || 'N/A'}</span>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="border border-red-600 rounded bg-gray-100 text-center py-2">
                    <div className="text-xs text-gray-900">Hãy đặt lệnh:</div>
                    <div className="text-lg font-bold text-red-600" suppressHydrationWarning>{String(timeLeft).padStart(2, '0')}s</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Button
                    type="button"
                    className="w-full h-12 bg-green-600 hover:bg-green-700 text-base font-bold flex items-center justify-center"
                    onClick={() => handleAction("UP")}
                    disabled={isLoading || !amount || isSubmitting || balance <= 0}
                  >
                    LÊN <ArrowUp className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    type="button"
                    className="w-full h-12 bg-red-600 hover:bg-red-700 text-base font-bold flex items-center justify-center"
                    onClick={() => handleAction("DOWN")}
                    disabled={isLoading || !amount || isSubmitting || balance <= 0}
                  >
                    XUỐNG <ArrowDown className="h-4 w-4 ml-2" />
                  </Button>
                  
                  {/* Thông báo hết tiền trong form đặt lệnh */}
                  {balance <= 0 && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-red-700 font-semibold text-sm">Không thể đặt lệnh</span>
                      </div>
                      <p className="text-red-600 text-xs mb-2">
                        Số dư không đủ. Vui lòng nạp tiền trước.
                      </p>
                      <Button 
                        onClick={handleDeposit}
                        size="sm"
                        className="w-full bg-red-600 hover:bg-red-700 text-white text-xs"
                      >
                        <Wallet className="h-3 w-3 mr-1" />
                        Nạp tiền
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 4. Lịch sử giao dịch */}
            <TradeHistory tradeHistory={tradeHistory} formatCurrency={formatCurrency} />

            {/* 5. Cập nhật */}
            <Card className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">Cập nhật</CardTitle>
              </CardHeader>
              <CardContent>
                <LiquidityTable />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}