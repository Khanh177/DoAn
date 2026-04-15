import React, { useEffect } from "react";

export default function ChartXAU() {
    useEffect(() => {
        const s = document.createElement("script");
        s.src = "https://s3.tradingview.com/tv.js";
        s.async = true;
        s.onload = () => {
            if (!window.TradingView) return;
            new window.TradingView.widget({
                container_id: "tv_xau",
                autosize: true,
                symbol: "OANDA:XAUUSD",
                interval: "1",
                timezone: "Asia/Ho_Chi_Minh",
                theme: "light",
                style: "1",
                locale: "vi",
                studies: ["volume@tv-basicstudies"],
                allow_symbol_change: false,
            });
        };
        document.body.appendChild(s);
    }, []);

    return (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden h-full">
            <div id="tv_xau" className="w-full h-full" />
        </div>
    );
}
