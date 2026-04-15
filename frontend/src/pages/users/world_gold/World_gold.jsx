import React, { useEffect, useState, useCallback, useRef } from "react";
import Header from "../../../layouts/Header";
import OrderBook from "./OrderBook";
import TradeForm from "./TradeForm";
import TradeHistory from "./TradeHistory";
import ChartXAU from "./ChartXAU";
import api from "../../../api/axios";

const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

export default function WorldGold() {
    const [isLoggedIn] = useState(true);
    const [username] = useState("User Demo");

    const [wallet, setWallet] = useState({
        so_du_tien: 0,
        luong_vang: 0,
        reserved_usd: 0,
        reserved_xau: 0,
        available_usd: 0,
        available_xau: 0,
    });
    const [currentPrice, setCurrentPrice] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const wsRef = useRef(null);
    const retryTimer = useRef(null);
    const [wsMessage, setWsMessage] = useState(null);

    const userId = (() => {
        const v = localStorage.getItem("user_id");
        return v ? Number(v) : 0;
    })();

    const loadWallet = useCallback(() => {
        return api
            .get("/wallet/spot/me")
            .then((r) => {
                const w = r.data || {};
                setWallet({
                    so_du_tien: Number(w.balance || 0),
                    luong_vang: Number(w.gold_world_balance || 0),
                    reserved_usd: Number(w.reserved_usd || 0),
                    reserved_xau: Number(w.reserved_xau || 0),
                    available_usd: Number(w.available_usd || 0),
                    available_xau: Number(w.available_xau || 0),
                });
            })
            .catch(() => { });
    }, []);

    const loadPrice = useCallback(() => {
        return api
            .get("/price/xauusd")
            .then((r) => {
                const raw = r?.data?.price;
                const p = Number(raw);
                if (Number.isFinite(p) && p > 0) setCurrentPrice(p);
            })
            .catch(() => { });
    }, []);

    useEffect(() => {
        loadWallet();
        const wiv = setInterval(loadWallet, 60000);
        return () => clearInterval(wiv);
    }, [loadWallet]);

    useEffect(() => {
        loadPrice();
        const piv = setInterval(loadPrice, 15000);
        return () => clearInterval(piv);
    }, [loadPrice]);

    useEffect(() => {
        let stopped = false;

        const openWS = () => {
            if (stopped) return;
            const token = encodeURIComponent(localStorage.getItem("access_token") || "");
            const url = `${WS_BASE}/spot/world/ws?uid=${userId || 0}&token=${token}`;

            try {
                wsRef.current?.close?.();
            } catch { }

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (retryTimer.current) {
                    clearTimeout(retryTimer.current);
                    retryTimer.current = null;
                }
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    setWsMessage({ ...msg, timestamp: Date.now() });

                    if (msg.type === "xau_price" && typeof msg.price === "number") {
                        const p = Number(msg.price);
                        if (Number.isFinite(p) && p > 0) setCurrentPrice(p);
                    }

                    if (msg.type === "wallet_update") {
                        const b = Number(msg.balance);
                        const g = Number(msg.gold_world_balance);
                        const resUsd = Number(msg.reserved_usd || 0);
                        const resXau = Number(msg.reserved_xau || 0);
                        const availUsd = Number(msg.available_usd);
                        const availXau = Number(msg.available_xau);
                        setWallet((prev) => ({
                            so_du_tien: Number.isFinite(b) ? b : prev.so_du_tien,
                            luong_vang: Number.isFinite(g) ? g : prev.luong_vang,
                            reserved_usd: Number.isFinite(resUsd) ? resUsd : prev.reserved_usd,
                            reserved_xau: Number.isFinite(resXau) ? resXau : prev.reserved_xau,
                            available_usd: Number.isFinite(availUsd) ? availUsd : prev.available_usd,
                            available_xau: Number.isFinite(availXau) ? availXau : prev.available_xau,
                        }));
                    }

                    if (
                        msg.type === "spot_order" ||
                        msg.type === "spot_exec" ||
                        msg.type === "spot_refresh" ||
                        msg.type === "spot_limit_filled"
                    ) {
                        setRefreshKey((k) => k + 1);
                    }
                } catch { }
            };

            ws.onclose = () => {
                if (stopped) return;
                retryTimer.current = setTimeout(openWS, 1500);
            };
        };

        openWS();
        return () => {
            stopped = true;
            if (retryTimer.current) clearTimeout(retryTimer.current);
            try {
                wsRef.current && wsRef.current.close();
            } catch { }
        };
    }, [userId]);

    useEffect(() => {
        const t = setInterval(() => {
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping" }));
            }
        }, 30000);
        return () => clearInterval(t);
    }, []);

    const onTradeSuccess = () => {
        setRefreshKey((k) => k + 1);
        loadWallet();
        loadPrice();
    };

    return (
        <div className="bg-gray-50 min-h-screen">
            <Header isLoggedIn={isLoggedIn} username={username} wallet={wallet} />
            <div className="grid grid-cols-12 gap-3 p-3 items-stretch">
                <div className="col-span-3 h-full">
                    <OrderBook
                        wsMessage={wsMessage}
                        depthApi="/spot/world/depth"
                        levels={8}
                        currentPrice={Number(currentPrice || 0)}
                    />
                </div>
                <div className="col-span-6 h-full">
                    <ChartXAU />
                </div>
                <div className="col-span-3 h-full">
                    <TradeForm
                        wallet={wallet}
                        onWalletChange={setWallet}
                        currentPrice={Number(currentPrice || 0)}
                        onTradeSuccess={onTradeSuccess}
                        wsMessage={wsMessage}
                    />
                </div>
                <div className="col-span-12">
                    {/* key=refreshKey -> mỗi lần khớp lệnh component bị remount và tự load lại */}
                    <TradeHistory
                        onRefresh={refreshKey}
                        wsMessage={wsMessage}
                    />
                </div>
            </div>
        </div>
    );
}
