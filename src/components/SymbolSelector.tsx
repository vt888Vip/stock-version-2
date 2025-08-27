'use client';

import { useState } from 'react';
import { ChevronDown, Search, Coins, DollarSign, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface Symbol {
  value: string;
  label: string;
  category: string;
}

const SYMBOLS: Symbol[] = [
  // Gold
  { value: 'TVC:GOLD', label: 'Gold (TVC)', category: 'Precious Metals' },
  { value: 'XAUUSD', label: 'Gold/USD', category: 'Precious Metals' },
  { value: 'GOLD', label: 'Gold', category: 'Precious Metals' },
  { value: 'OANDA:XAUUSD', label: 'Gold/USD (OANDA)', category: 'Precious Metals' },
  
  // Silver
  { value: 'TVC:SILVER', label: 'Silver (TVC)', category: 'Precious Metals' },
  { value: 'XAGUSD', label: 'Silver/USD', category: 'Precious Metals' },
  { value: 'OANDA:XAGUSD', label: 'Silver/USD (OANDA)', category: 'Precious Metals' },
  
  // Forex Major Pairs
  { value: 'EURUSD', label: 'EUR/USD', category: 'Forex Major' },
  { value: 'GBPUSD', label: 'GBP/USD', category: 'Forex Major' },
  { value: 'USDJPY', label: 'USD/JPY', category: 'Forex Major' },
  { value: 'USDCHF', label: 'USD/CHF', category: 'Forex Major' },
  { value: 'AUDUSD', label: 'AUD/USD', category: 'Forex Major' },
  { value: 'USDCAD', label: 'USD/CAD', category: 'Forex Major' },
  
  // Forex Minor Pairs
  { value: 'EURGBP', label: 'EUR/GBP', category: 'Forex Minor' },
  { value: 'EURJPY', label: 'EUR/JPY', category: 'Forex Minor' },
  { value: 'GBPJPY', label: 'GBP/JPY', category: 'Forex Minor' },
  { value: 'AUDCAD', label: 'AUD/CAD', category: 'Forex Minor' },
  
  // Cryptocurrencies
  { value: 'BTCUSD', label: 'Bitcoin/USD', category: 'Cryptocurrency' },
  { value: 'ETHUSD', label: 'Ethereum/USD', category: 'Cryptocurrency' },
  { value: 'BINANCE:BTCUSDT', label: 'Bitcoin/USDT', category: 'Cryptocurrency' },
  { value: 'BINANCE:ETHUSDT', label: 'Ethereum/USDT', category: 'Cryptocurrency' },
  
  // Indices
  { value: 'SPX', label: 'S&P 500', category: 'Indices' },
  { value: 'DJI', label: 'Dow Jones', category: 'Indices' },
  { value: 'IXIC', label: 'NASDAQ', category: 'Indices' },
  { value: 'TVC:US30', label: 'US30 (TVC)', category: 'Indices' },
  { value: 'TVC:US500', label: 'US500 (TVC)', category: 'Indices' },
  
  // Commodities
  { value: 'TVC:OIL', label: 'Oil (TVC)', category: 'Commodities' },
  { value: 'USOIL', label: 'US Oil', category: 'Commodities' },
  { value: 'UKOIL', label: 'UK Oil', category: 'Commodities' },
  { value: 'NATURAL_GAS', label: 'Natural Gas', category: 'Commodities' },
];

interface SymbolSelectorProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

export default function SymbolSelector({ currentSymbol, onSymbolChange }: SymbolSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const currentSymbolData = SYMBOLS.find(s => s.value === currentSymbol) || SYMBOLS[0];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Precious Metals':
        return <Coins className="h-4 w-4 text-yellow-500" />;
      case 'Forex Major':
      case 'Forex Minor':
        return <DollarSign className="h-4 w-4 text-green-500" />;
      case 'Cryptocurrency':
        return <Zap className="h-4 w-4 text-orange-500" />;
      case 'Indices':
        return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case 'Commodities':
        return <Coins className="h-4 w-4 text-gray-500" />;
      default:
        return <Coins className="h-4 w-4 text-gray-400" />;
    }
  };

  const filteredSymbols = SYMBOLS.filter(symbol =>
    symbol.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    symbol.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
    symbol.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedSymbols = filteredSymbols.reduce((groups, symbol) => {
    if (!groups[symbol.category]) {
      groups[symbol.category] = [];
    }
    groups[symbol.category].push(symbol);
    return groups;
  }, {} as Record<string, Symbol[]>);

  return (
    <div className="relative">
             <Button
         variant="outline"
         onClick={() => setIsOpen(!isOpen)}
         className="w-full justify-between bg-white border-gray-300 hover:bg-gray-50"
       >
         <span className="flex items-center">
           {getCategoryIcon(currentSymbolData.category)}
           <span className="ml-2 font-medium">{currentSymbolData.label}</span>
           <span className="ml-2 text-xs text-gray-500">({currentSymbolData.value})</span>
         </span>
         <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
       </Button>

      {isOpen && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-96 overflow-hidden border border-gray-300 shadow-lg">
          <CardContent className="p-0">
            {/* Search */}
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Tìm kiếm symbol..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Symbol List */}
            <div className="max-h-80 overflow-y-auto">
              {Object.entries(groupedSymbols).map(([category, symbols]) => (
                <div key={category}>
                  <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                    {getCategoryIcon(category)}
                    {category}
                  </div>
                  {symbols.map((symbol) => (
                    <button
                      key={symbol.value}
                      onClick={() => {
                        onSymbolChange(symbol.value);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors ${
                        symbol.value === currentSymbol ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <div className="font-medium">{symbol.label}</div>
                      <div className="text-xs text-gray-500">{symbol.value}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overlay để đóng dropdown khi click bên ngoài */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsOpen(false);
            setSearchTerm('');
          }}
        />
      )}
    </div>
  );
} 