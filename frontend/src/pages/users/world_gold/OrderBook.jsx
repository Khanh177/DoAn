// OrderBook.jsx — Sổ lệnh realtime, dùng WS chung từ WorldGold
import React, { useEffect, useMemo, useState, useRef } from "react";
import { TrendingUp } from "lucide-react";
import api from "../../../api/axios";

export default function OrderBook({
    wsMessage,
    depthApi = "/spot/world/depth",
    levels = 8,
    currentPrice = null,
}) {
    const [asks, setAsks] = useState([]);
    const [bids, setBids] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastPrice, setLastPrice] = useState(null);
    const loadingRef = useRef(false);

    const pad = (rows, side) => {
        const out = Array.isArray(rows) ? rows.slice(0, levels) : [];
        for (let i = out.length; i < levels; i++) {
            out.push({ _ph: true, side, price: null, qty: null });
        }
        return out;
    };

    const bestAsk = useMemo(
        () => asks.find((r) => !r?._ph && r?.price != null)?.price,
        [asks]
    );
    const bestBid = useMemo(
        () => bids.find((r) => !r?._ph && r?.price != null)?.price,
        [bids]
    );

    const displayPrice = useMemo(() => {
        const pParent = Number(currentPrice);
        if (Number.isFinite(pParent) && pParent > 0) return pParent;
        if (lastPrice != null) return Number(lastPrice);
        if (bestAsk != null && bestBid != null) {
            return (Number(bestAsk) + Number(bestBid)) / 2;
        }
        return null;
    }, [currentPrice, lastPrice, bestAsk, bestBid]);

    const maxQty = useMemo(() => {
        const nums = [...asks, ...bids]
            .filter((r) => !r?._ph && Number(r?.qty) > 0)
            .map((r) => Number(r.qty));
        return nums.length ? Math.max(...nums) : 1;
    }, [asks, bids]);

    const loadSnapshot = async (src = "manual") => {
        if (loadingRef.current) {
            console.log("[OB] skip load, busy, src =", src);
            return;
        }
        loadingRef.current = true;
        setLoading(true);
        try {
            console.log("[OB] loadSnapshot START, src =", src);
            const r = await api.get(depthApi, { params: { limit: levels } });
            const d = r.data || { asks: [], bids: [] };
            console.log("[OB] loadSnapshot DONE, src =", src, d);
            setAsks(pad(d.asks, "ask"));
            setBids(pad(d.bids, "bid"));
        } catch (e) {
            console.error("[OB] Load depth error, src =", src, e);
            setAsks(pad([], "ask"));
            setBids(pad([], "bid"));
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSnapshot("mount");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depthApi, levels]);

    useEffect(() => {
        const id = setInterval(() => loadSnapshot("interval"), 5000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depthApi, levels]);

    useEffect(() => {
        if (!wsMessage) return;

        console.log("[OB] wsMessage:", wsMessage);

        try {
            if (wsMessage.type === "orderbook" && wsMessage.data) {
                console.log("[OB] apply depth from WS");
                setAsks(pad(wsMessage.data.asks || [], "ask"));
                setBids(pad(wsMessage.data.bids || [], "bid"));
            }

            if (wsMessage.type === "spot_refresh") {
                console.log("[OB] spot_refresh -> reload snapshot");
                loadSnapshot("ws:spot_refresh");
            }

            if (wsMessage.type === "xau_price" && wsMessage.price != null) {
                const p = Number(wsMessage.price);
                if (Number.isFinite(p)) setLastPrice(p);
            }
        } catch (e) {
            console.error("OrderBook wsMessage error:", e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsMessage]);

    const Header = () => (
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 sticky top-0 bg-gray-50 border-b border-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
            <div>Giá (USD)</div>
            <div className="text-right">Số lượng (XAU)</div>
            <div className="text-right">Tổng</div>
        </div>
    );

    const Row = ({ r, color }) => {
        if (r?._ph) {
            return (
                <div className="grid grid-cols-3 gap-2 px-4 py-1 text-[11px] text-gray-300">
                    <div>—</div>
                    <div className="text-right">—</div>
                    <div className="text-right">—</div>
                </div>
            );
        }
        const qty = Number(r.qty || 0);
        const pct = Math.min(100, (qty / maxQty) * 100);
        const bar = color === "red" ? "bg-red-50" : "bg-green-50";
        const txt = color === "red" ? "text-red-600" : "text-green-600";
        return (
            <div className="relative group hover:bg-gray-50 transition-colors">
                <div
                    className={`absolute inset-y-0 right-0 ${bar} transition-all`}
                    style={{ width: `${pct}%` }}
                />
                <div className="relative grid grid-cols-3 gap-2 px-4 py-1 text-[11px]">
                    <div className={`${txt} font-semibold`}>
                        {Number(r.price || 0).toFixed(2)}
                    </div>
                    <div className="text-right text-gray-700">
                        {qty.toFixed(4)}
                    </div>
                    <div className="text-right text-gray-500">
                        {Math.round(Number(r.price || 0) * qty).toLocaleString("en-US")}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-white">
                <h3 className="text-sm font-semibold text-gray-900">Sổ lệnh</h3>
            </div>

            <Header />

            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="overflow-auto custom-scroll max-h-[40%]">
                    {pad(asks, "ask").map((r, i) => (
                        <Row key={`a${i}`} r={r} color="red" />
                    ))}
                </div>

                <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-y border-gray-100">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] text-gray-500 font-medium">
                            Giá hiện tại
                        </div>
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                            <div className="text-base font-bold text-green-600">
                                {displayPrice != null
                                    ? displayPrice.toFixed(2)
                                    : "—"}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-auto custom-scroll max-h-[40%]">
                    {pad(bids, "bid").map((r, i) => (
                        <Row key={`b${i}`} r={r} color="green" />
                    ))}
                </div>
            </div>

            <style>{`
                .custom-scroll::-webkit-scrollbar { width: 4px; }
                .custom-scroll::-webkit-scrollbar-track { background: #f9fafb; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
                .custom-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
            `}</style>
        </div>
    );
}
