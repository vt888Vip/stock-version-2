'use client';

import { useEffect, useRef, useState, memo } from "react";

const TradingViewTickerTape = memo(function TradingViewTickerTape() {
  const container = useRef<HTMLDivElement>(null);
  const [symbolCount, setSymbolCount] = useState(10); // Default symbol count
  const [isLoaded, setIsLoaded] = useState(false);

  // List of exactly 20 most reliable symbols - guaranteed to have data
  const allSymbols = [
    // Major Currency Pairs - Most Liquid & Reliable
    { proName: "FX_IDC:EURUSD", title: "EUR/USD" },
    { proName: "FX_IDC:GBPUSD", title: "GBP/USD" },
    { proName: "FX_IDC:USDJPY", title: "USD/JPY" },
    { proName: "FX_IDC:USDCHF", title: "USD/CHF" },
    { proName: "FX_IDC:AUDUSD", title: "AUD/USD" },
    { proName: "FX_IDC:USDCAD", title: "USD/CAD" },
    
    // Cross Currency Pairs - Reliable
    { proName: "FX_IDC:EURGBP", title: "EUR/GBP" },
    { proName: "FX_IDC:EURJPY", title: "EUR/JPY" },
    
    // Asian Currencies - Major ones
    { proName: "FX_IDC:USDCNH", title: "USD/CNH" },
    { proName: "FX_IDC:USDSGD", title: "USD/SGD" },
    
    // Precious Metals - Most Reliable
    { proName: "OANDA:XAUUSD", title: "Vàng/Đô la Mỹ" },
    { proName: "OANDA:XAGUSD", title: "Bạc/Đô la Mỹ" },
    
    // Energy - Major Commodities
    { proName: "TVC:USOIL", title: "Dầu WTI" },
    { proName: "TVC:UKOIL", title: "Dầu Brent" },
    
    // Major US Indices - Most Reliable
    { proName: "NASDAQ:NDX", title: "NASDAQ 100" },
    { proName: "SP:SPX", title: "S&P 500" },
    
    // European Indices - Reliable
    { proName: "FTSE:UKX", title: "FTSE 100" },
    
    // Cryptocurrencies - Major & Reliable
    { proName: "BINANCE:BTCUSDT", title: "Bitcoin" },
    { proName: "BINANCE:BNBUSDT", title: "BNB" },
    
    // Bonds - Major Government Bonds
    { proName: "TVC:US10Y", title: "US 10Y Bond" }
  ];

  useEffect(() => {
    // Always show exactly 20 symbols regardless of screen size
    const updateSymbolCount = () => {
      setSymbolCount(20); // Fixed: Always show 20 symbols
    };

    // Initial count
    updateSymbolCount();

    // Update on resize with debounce to avoid excessive reloads
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateSymbolCount();
      }, 300);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  useEffect(() => {
    if (!container.current) return;
    setIsLoaded(false);
    
    // Đảm bảo container có thẻ widget bên trong trước khi thêm script
    const widgetContainer = container.current.querySelector('.tradingview-widget-container__widget');
    if (!widgetContainer) {
      const div = document.createElement('div');
      div.className = 'tradingview-widget-container__widget';
      container.current.appendChild(div);
    }
    
    // Đợi một chút để đảm bảo DOM đã render
    const timer = setTimeout(() => {
      if (!container.current) return;
      
      // Clear any existing scripts
      const existingScripts = container.current.querySelectorAll('script');
      existingScripts.forEach(script => script.remove());
      
      // Create and configure the script
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
      script.async = true;
      script.type = "text/javascript";
      script.innerHTML = JSON.stringify({
        symbols: allSymbols.slice(0, symbolCount),
        showSymbolLogo: true,
        colorTheme: "light",
        isTransparent: false,
        displayMode: "adaptive",
        locale: "vi_VN",
        width: "100%",
        height: 46
      });
      
      // Show loading state is complete when script loads
      script.onload = () => {
        setIsLoaded(true);
      };

      // Append the script to the container
      container.current.appendChild(script);
    }, 300); // Delay để DOM sẵn sàng trước khi render widget
    
    return () => {
      clearTimeout(timer);
      // Cleanup
      if (container.current) {
        const scripts = container.current.querySelectorAll('script');
        scripts.forEach(script => script.remove());
      }
    };
  }, [symbolCount]); // Re-render when symbolCount changes

  return (
    <div className="w-full overflow-hidden">
      {!isLoaded && (
        <div className="h-10 bg-gray-100 animate-pulse w-full rounded" />
      )}
      <div 
        ref={container} 
        className={`tradingview-widget-container w-full ${!isLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        style={{ 
          height: "46px",
          marginBottom: "8px"
        }}
      >
        <div className="tradingview-widget-container__widget"></div>
      </div>
    </div>
  );
});

export default TradingViewTickerTape;
