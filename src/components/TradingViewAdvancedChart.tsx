import { useEffect, useRef } from 'react';

interface TradingViewAdvancedChartProps {
  symbol?: string; // e.g. "TVC:GOLD"
  interval?: string; // e.g. "15" for 15 minutes
  theme?: 'light' | 'dark';
  height?: number | string;
  interactive?: boolean; // if false, disable user interaction
  style?: number; // 1 = Candles, 3 = Line, etc.
  onSymbolChange?: (symbol: string) => void; // Callback khi symbol thay đổi
}

// Embeds TradingView Advanced Chart widget using external script
// Docs: https://www.tradingview.com/widget/advanced-chart/
export default function TradingViewAdvancedChart({
  symbol = 'TVC:GOLD', // Quay lại symbol gốc vì nó hoạt động
  interval = '1',
  theme = 'dark',
  height = '100%',
  style = 1,
  interactive = true,
  onSymbolChange,
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget (Hot reload)
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;

    script.innerHTML = JSON.stringify({
      autosize: true,
      theme,
      interval,
      symbol,
      timezone: 'Etc/UTC',
      allow_symbol_change: true, // Cho phép thay đổi symbol
      hide_side_toolbar: false,
      hide_volume: false,
      hide_legend: false,
      locale: 'en',
      style,
      withdateranges: false,
      hide_top_toolbar: false,
      enable_publishing: false,
      save_image: false,
      hide_logo: true,
      hide_watermark: true,
      container_id: `tradingview-chart-${Date.now()}`,
    });

    containerRef.current.appendChild(script);

    if (!interactive && containerRef.current) {
      // Disable all pointer events to prevent any interaction (zoom, pan, etc.)
      containerRef.current.style.pointerEvents = 'none';
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [symbol, interval, theme, interactive, style]);

  return (
    <div className="relative tradingview-widget-container w-full" style={{ height }} ref={containerRef}>
      <div className="tradingview-widget-container__widget" style={{ height }} />
      {!interactive && (
        <div
          className="absolute inset-0 z-10 select-none touch-none"
          style={{ pointerEvents: 'auto' }}
          onWheelCapture={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        />
      )}
      {/* Loading indicator */}
      <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Đang tải biểu đồ...</p>
        </div>
      </div>
    </div>
  );
}