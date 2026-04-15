import React, { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, X, HelpCircle } from "lucide-react";
import Header from "../../../layouts/Header";
import api from "../../../api/axios";

const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

export default function ForexTrading() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [userId, setUserId] = useState(null);

    const [positions, setPositions] = useState([]);
    const [baseBalance, setBaseBalance] = useState(0);
    const [balance, setBalance] = useState(0);
    const [equity, setEquity] = useState(0);
    const [margin, setMargin] = useState(0);
    const [freeMargin, setFreeMargin] = useState(0);
    const [marginLevel, setMarginLevel] = useState(0);
    const [currentPrice, setCurrentPrice] = useState(null);

    const [lotSize, setLotSize] = useState("0.01");
    const [leverage, setLeverage] = useState("100");
    const [errorMsg, setErrorMsg] = useState("");
    const [showGuide, setShowGuide] = useState(false);

    const wsRef = useRef(null);
    const tvLoadedRef = useRef(false);
    const wsStartedRef = useRef(false);

    // auth info
    useEffect(() => {
        const token = localStorage.getItem("access_token");
        const uname = localStorage.getItem("username");
        const uid = localStorage.getItem("user_id");
        setIsLoggedIn(!!token);
        if (uname) setUsername(uname);
        if (uid) setUserId(Number(uid));
    }, []);

    // initial wallet
    useEffect(() => {
        if (!isLoggedIn) return;
        api
            .get("/wallet/futures")
            .then((res) => setBaseBalance(Number(res.data?.balance || 0)))
            .catch(() => setBaseBalance(0));
    }, [isLoggedIn]);

    // load open positions
    useEffect(() => {
        if (!isLoggedIn) return;
        api
            .get("/futures/positions", { params: { status: "open" } })
            .then((res) => {
                const seen = new Set();
                const data = (res.data || []).filter((p) => {
                    const id = Number(p.id);
                    if (seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
                setPositions(
                    data.map((p) => ({
                        id: Number(p.id),
                        user_id: Number(p.user_id),
                        instrument_id: Number(p.instrument_id),
                        side: p.side,
                        qty: Number(p.qty),
                        entry_price: Number(p.entry_price),
                        leverage: Number(p.leverage),
                        margin_used: Number(p.margin_used),
                        status: p.status,
                        opened_at: p.opened_at,
                        closed_at: p.closed_at,
                        pnl_realized: p.pnl_realized,
                        symbol: "XAUUSD",
                        current_price: null,
                        commission: 0,
                        swap: 0,
                        liq_price: p.liq_price != null ? Number(p.liq_price) : null,
                    }))
                );
            })
            .catch((err) => {
                console.error("Failed to fetch positions:", err);
                console.error("Error details:", err?.response?.data);
            });
    }, [isLoggedIn]);

    // TradingView widget
    useEffect(() => {
        if (tvLoadedRef.current) return;
        tvLoadedRef.current = true;
        const s = document.createElement("script");
        s.src = "https://s3.tradingview.com/tv.js";
        s.async = true;
        s.onload = () => {
            if (window.TradingView) {
                new window.TradingView.widget({
                    container_id: "tradingview_chart",
                    autosize: true,
                    symbol: "OANDA:XAUUSD",
                    interval: "15",
                    timezone: "Asia/Ho_Chi_Minh",
                    theme: "light",
                    style: "1",
                    locale: "en",
                    enable_publishing: false,
                    hide_top_toolbar: false,
                });
            }
        };
        document.body.appendChild(s);
    }, []);

    // WebSocket realtime (không phụ thuộc currentPrice)
    useEffect(() => {
        if (!userId) return;
        if (wsStartedRef.current) return;
        wsStartedRef.current = true;

        let stopped = false;
        let ws = null;
        let timer = null;

        const openWS = () => {
            if (stopped) return;
            const token = localStorage.getItem("access_token") || "";
            ws = new WebSocket(
                `${WS_BASE}/ws_futures/ws?uid=${userId}&token=${encodeURIComponent(token)}`
            );
            wsRef.current = ws;

            ws.onopen = () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === "connected") return;

                    if (msg.type === "xau_price" && typeof msg.price === "number") {
                        const p = Number(msg.price);
                        setCurrentPrice(p);
                        setPositions((prev) => prev.map((x) => ({ ...x, current_price: p })));
                        return;
                    }

                    if (msg.type === "futures_open") {
                        const pid = Number(msg.position_id);
                        setPositions((prev) => {
                            if (prev.some((x) => x.id === pid)) return prev;
                            return [
                                ...prev,
                                {
                                    id: pid,
                                    instrument_id: Number(msg.instrument_id),
                                    side: msg.side,
                                    qty: Number(msg.qty),
                                    entry_price: Number(msg.entry_price),
                                    leverage: Number(msg.leverage),
                                    margin_used: Number(msg.margin_used),
                                    status: "open",
                                    opened_at: msg.opened_at || new Date().toISOString(),
                                    symbol: "XAUUSD",
                                    current_price: currentPrice,
                                    commission: 0,
                                    swap: 0,
                                    liq_price: msg.liq_price != null ? Number(msg.liq_price) : null,
                                },
                            ];
                        });
                        return;
                    }

                    if (msg.type === "futures_close") {
                        setPositions((prev) =>
                            prev.filter((x) => x.id !== Number(msg.position_id))
                        );
                        return;
                    }

                    if (msg.type === "wallet_update") {
                        if (typeof msg.balance === "number")
                            setBaseBalance(Number(msg.balance));
                        return;
                    }

                    if (msg.type === "liquidation") {
                        setPositions((prev) =>
                            prev.filter((x) => x.id !== Number(msg.position_id))
                        );
                        setErrorMsg(`Lệnh #${msg.position_id} bị thanh lý`);
                        return;
                    }

                    if (msg.type === "error") {
                        setErrorMsg(msg.detail || "WS error");
                        return;
                    }
                } catch (e) {
                    console.error(e);
                }
            };

            ws.onclose = () => {
                if (stopped) return;
                timer = setTimeout(openWS, 1500);
            };
        };

        openWS();

        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            try {
                ws && ws.close();
            } catch { }
        };
    }, [userId]);

    // keepalive ping
    useEffect(() => {
        if (!userId) return;
        const t = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "ping" }));
            }
        }, 30000);
        return () => clearInterval(t);
    }, [userId]);

    // Polling 10s fallback cho giá
    useEffect(() => {
        let alive = true;
        const pull = () => {
            api
                .get("/price/xauusd")
                .then((r) => {
                    const p = Number(r.data?.price);
                    if (!Number.isNaN(p) && p > 0 && alive) {
                        setCurrentPrice(p);
                        setPositions((prev) => prev.map((x) => ({ ...x, current_price: p })));
                    }
                })
                .catch(() => { });
        };
        pull();
        const iv = setInterval(pull, 10000);
        return () => {
            alive = false;
            clearInterval(iv);
        };
    }, []);

    // recalc account metrics
    useEffect(() => {
        recalcAccount(positions, baseBalance, currentPrice);
    }, [positions, baseBalance, currentPrice]);

    const calcPnL = (pos, price) => {
        if (!pos || price == null) return 0;
        return pos.side === "long"
            ? (price - Number(pos.entry_price)) * Number(pos.qty)
            : (Number(pos.entry_price) - price) * Number(pos.qty);
    };

    const recalcAccount = (list, walletBalance, priceNow) => {
        const totalMargin = list.reduce((s, p) => s + Number(p.margin_used || 0), 0);
        const totalPnL = list.reduce(
            (s, p) => s + calcPnL(p, p.current_price ?? priceNow),
            0
        );
        const bal = walletBalance;
        const eq = bal + totalPnL;
        const fm = eq - totalMargin;
        const ml = totalMargin > 0 ? (eq / totalMargin) * 100 : 0;
        setBalance(bal);
        setEquity(eq);
        setMargin(totalMargin);
        setFreeMargin(fm);
        setMarginLevel(ml);
    };

    const handlePlaceOrder = async (side) => {
        if (!isLoggedIn || currentPrice == null) return;
        const qty = parseFloat(lotSize);
        const lev = parseInt(leverage, 10);
        if (!(qty > 0) || !(lev > 0)) return;
        try {
            const res = await api.post("/futures/open", {
                instrument_id: 1,
                side,
                qty,
                entry_price: currentPrice,
                leverage: lev,
            });
            const p = res.data;

            setPositions((prev) => {
                const id = Number(p.id);
                if (prev.some((x) => x.id === id)) return prev;
                return [
                    ...prev,
                    {
                        id,
                        user_id: Number(p.user_id),
                        instrument_id: Number(p.instrument_id),
                        side: p.side,
                        qty: Number(p.qty),
                        entry_price: Number(p.entry_price),
                        leverage: Number(p.leverage),
                        margin_used: Number(p.margin_used),
                        status: p.status,
                        opened_at: p.opened_at,
                        closed_at: p.closed_at,
                        pnl_realized: p.pnl_realized,
                        symbol: "XAUUSD",
                        current_price: currentPrice,
                        liq_price: p.liq_price != null ? Number(p.liq_price) : null,
                    },
                ];
            });

            if (typeof p.wallet_balance === "number") setBaseBalance(p.wallet_balance);
            setErrorMsg("");
        } catch (e) {
            const msg = e?.response?.data?.detail || "Không mở được lệnh";
            setErrorMsg(msg);
        }
    };

    const handleClosePosition = async (positionId) => {
        if (!isLoggedIn || currentPrice == null) return;
        const pos = positions.find((p) => p.id === positionId);
        if (!pos) return;
        try {
            const res = await api.post("/futures/close", {
                position_id: pos.id,
                exit_price: currentPrice,
            });
            const data = res.data;
            setPositions((prev) => prev.filter((x) => x.id !== pos.id));
            if (typeof data.wallet_balance === "number")
                setBaseBalance(data.wallet_balance);
        } catch (e) {
            const msg = e?.response?.data?.detail || "Không đóng được lệnh";
            setErrorMsg(msg);
        }
    };

    const totalPnL = positions.reduce(
        (s, p) => s + calcPnL(p, p.current_price ?? currentPrice),
        0
    );

    const liqWarnClass = (pnow, pliq) => {
        if (pnow == null || pliq == null) return "";
        const gap = Math.abs((pnow - pliq) / pliq);
        return gap <= 0.01
            ? "text-red-600 font-semibold"
            : gap <= 0.03
                ? "text-orange-500 font-semibold"
                : "text-gray-700";
    };

    return (
        <div className="bg-gray-50 text-gray-900 min-h-screen flex flex-col">
            <Header
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                username={username}
                setUsername={setUsername}
            />

            <div className="bg-white px-4 py-2 border-b border-gray-200 flex items-center gap-6 text-sm">
                <div>
                    <span className="text-gray-500">Số dư:</span>
                    <span className="ml-2 font-semibold text-green-600">
                        ${balance.toFixed(2)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500">Vốn thực (Equity):</span>
                    <span className="ml-2 font-semibold">${equity.toFixed(2)}</span>
                </div>
                <div>
                    <span className="text-gray-500">Ký quỹ đã dùng:</span>
                    <span className="ml-2 font-semibold text-orange-500">
                        {margin.toFixed(2)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500">Ký quỹ khả dụng:</span>
                    <span className="ml-2 font-semibold text-blue-500">
                        ${freeMargin.toFixed(2)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500">Mức ký quỹ:</span>
                    <span className="ml-2 font-semibold text-green-500">
                        {marginLevel.toFixed(2)}%
                    </span>
                </div>
                <div>
                    <span className="text-gray-500">Tổng P/L:</span>
                    <span
                        className={`ml-2 font-semibold ${totalPnL >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                    >
                        ${totalPnL.toFixed(2)}
                    </span>
                </div>
                {errorMsg ? (
                    <div className="ml-auto text-red-500 font-semibold">{errorMsg}</div>
                ) : null}
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col">
                    <div id="tradingview_chart" className="flex-1" />

                    <div className="bg-white border-t border-gray-200" style={{ height: 260 }}>
                        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="text-sm font-semibold">Lệnh đang mở ({positions.length})</h3>
                        </div>
                        <div className="overflow-auto h-[212px]">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr className="text-gray-500 border-b border-gray-200">
                                        <th className="px-3 py-2 text-left">ID</th>
                                        <th className="px-3 py-2 text-left">Thời gian mở</th>
                                        <th className="px-3 py-2 text-left">Side</th>
                                        <th className="px-3 py-2 text-right">Khối lượng</th>
                                        <th className="px-3 py-2 text-left">Mã</th>
                                        <th className="px-3 py-2 text-right">Giá vào</th>
                                        <th className="px-3 py-2 text-right">Giá hiện tại</th>
                                        <th className="px-3 py-2 text-right">Leverage</th>
                                        <th className="px-3 py-2 text-right">Ký quỹ</th>
                                        <th className="px-3 py-2 text-right">Liq</th>
                                        <th className="px-3 py-2 text-right">P/L</th>
                                        <th className="px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {positions.map((pos) => {
                                        const pnow = pos.current_price ?? currentPrice;
                                        const pl = calcPnL(pos, pnow);
                                        return (
                                            <tr key={pos.id} className="border-b border-gray-100">
                                                <td className="px-3 py-2 flex items-center gap-1">
                                                    {pos.side === "long" ? (
                                                        <TrendingUp className="w-4 h-4 text-blue-500" />
                                                    ) : (
                                                        <TrendingDown className="w-4 h-4 text-red-500" />
                                                    )}
                                                    {pos.id}
                                                </td>
                                                <td className="px-3 py-2 text-gray-500">
                                                    {pos.opened_at
                                                        ? new Date(pos.opened_at).toLocaleString("vi-VN")
                                                        : "-"}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span
                                                        className={`font-semibold uppercase ${pos.side === "long" ? "text-blue-500" : "text-red-500"
                                                            }`}
                                                    >
                                                        {pos.side}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {Number(pos.qty).toFixed(2)}
                                                </td>
                                                <td className="px-3 py-2 text-yellow-600 font-semibold">
                                                    {pos.symbol}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {Number(pos.entry_price).toFixed(3)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold">
                                                    {pnow != null ? Number(pnow).toFixed(3) : "-"}
                                                </td>
                                                <td className="px-3 py-2 text-right text-purple-500 font-semibold">
                                                    {pos.leverage}x
                                                </td>
                                                <td className="px-3 py-2 text-right text-orange-500">
                                                    ${Number(pos.margin_used || 0).toFixed(2)}
                                                </td>
                                                <td className={`px-3 py-2 text-right ${liqWarnClass(pnow, pos.liq_price)}`}>
                                                    {pos.liq_price != null ? Number(pos.liq_price).toFixed(3) : "-"}
                                                </td>
                                                <td
                                                    className={`px-3 py-2 text-right font-bold ${pl >= 0 ? "text-green-500" : "text-red-500"
                                                        }`}
                                                >
                                                    {pl >= 0 ? "+" : ""}
                                                    {pl.toFixed(2)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <button
                                                        onClick={() => handleClosePosition(pos.id)}
                                                        className="text-red-500 hover:text-red-400"
                                                        title="Đóng lệnh"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {positions.length === 0 && (
                                        <tr>
                                            <td className="px-3 py-6 text-center text-gray-400" colSpan={12}>
                                                Không có lệnh
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                        <h2 className="font-semibold text-base">Đặt lệnh</h2>
                        <button
                            type="button"
                            onClick={() => setShowGuide(true)}
                            className="p-1 rounded-full hover:bg-gray-100"
                            aria-label="Hướng dẫn"
                            title="Hướng dẫn trade"
                        >
                            <HelpCircle className="w-5 h-5 text-gray-500 cursor-pointer" />
                        </button>
                    </div>

                    <div className="flex-1 p-4 space-y-4 overflow-auto">
                        <div>
                            <label className="block text-sm text-gray-500 mb-2">Mã</label>
                            <input
                                value="XAUUSD"
                                readOnly
                                className="w-full bg-gray-100 border border-gray-200 px-3 py-2 rounded text-yellow-600 font-semibold"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-500 mb-2">Khối lượng (oz)</label>
                            <input
                                type="number"
                                value={lotSize}
                                onChange={(e) => setLotSize(e.target.value)}
                                step="0.01"
                                min="0.01"
                                className="w-full bg-white border border-gray-200 px-3 py-2 rounded focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-500 mb-2">Đòn bẩy (leverage)</label>
                            <select
                                value={leverage}
                                onChange={(e) => setLeverage(e.target.value)}
                                className="w-full bg-white border border-gray-200 px-3 py-2 rounded focus:outline-none focus:border-blue-500"
                            >
                                <option value="10">10x</option>
                                <option value="20">20x</option>
                                <option value="50">50x</option>
                                <option value="100">100x</option>
                            </select>
                        </div>

                        <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Giá hiện tại</span>
                                <span className="font-semibold">
                                    {currentPrice != null ? currentPrice.toFixed(3) : "-"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Ký quỹ cần</span>
                                <span className="font-semibold text-orange-500">
                                    $
                                    {(
                                        (parseFloat(lotSize || "0") * (currentPrice || 0)) /
                                        parseFloat(leverage || "1")
                                    ).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Giá trị vị thế</span>
                                <span className="font-semibold">
                                    ${(parseFloat(lotSize || "0") * (currentPrice || 0)).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => handlePlaceOrder("short")}
                                disabled={currentPrice == null}
                                className={`${currentPrice == null ? "bg-red-300 cursor-not-allowed" : "bg-red-500 hover:bg-red-600"
                                    } text-white font-semibold py-3 rounded`}
                            >
                                SHORT
                            </button>
                            <button
                                onClick={() => handlePlaceOrder("long")}
                                disabled={currentPrice == null}
                                className={`${currentPrice == null ? "bg-blue-300 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"
                                    } text-white font-semibold py-3 rounded`}
                            >
                                LONG
                            </button>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {["0.01", "0.05", "0.1", "0.5"].map((lot) => (
                                <button
                                    key={lot}
                                    onClick={() => setLotSize(lot)}
                                    className={`px-3 py-2 rounded text-xs font-semibold ${lotSize === lot ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
                                        }`}
                                >
                                    {lot}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {showGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowGuide(false)} />
                    <div className="relative bg-white w-[680px] max-h-[80vh] rounded-lg shadow-xl p-5 overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold">Hướng dẫn trade vàng futures</h3>
                            <button
                                onClick={() => setShowGuide(false)}
                                className="p-1 rounded hover:bg-gray-100"
                                aria-label="Đóng"
                                title="Đóng"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="prose prose-sm max-w-none">
                            <p className="m-0">
                                Thuật ngữ: <b>long</b>, <b>short</b>, <b>PnL</b>, <b>margin</b>, <b>leverage</b>, <b>liq</b>.
                            </p>
                            <h4>1. Khái niệm nhanh</h4>
                            <ul>
                                <li><b>long</b>: cược giá lên.</li>
                                <li><b>short</b>: cược giá xuống.</li>
                                <li><b>qty</b>: khối lượng (oz).</li>
                                <li><b>leverage</b>: đòn bẩy.</li>
                                <li><b>margin</b>: ký quỹ.</li>
                                <li><b>PnL</b>: lãi/lỗ.</li>
                                <li><b>liq</b>: giá thanh lý.</li>
                            </ul>
                            <h4>2. Công thức</h4>
                            <p><b>value</b> = qty × giá</p>
                            <p><b>margin_required</b> = value ÷ leverage</p>
                            <ul>
                                <li>Long: PnL = (giá hiện tại – giá vào) × qty</li>
                                <li>Short: PnL = (giá vào – giá hiện tại) × qty</li>
                            </ul>
                            <ul>
                                <li>equity = số dư + tổng PnL</li>
                                <li>free_margin = equity – tổng margin</li>
                            </ul>
                            <h4>3. Liq</h4>
                            <p>Đặt khi mở dựa vào side, entry, leverage.</p>
                            <h4>4. Quy trình</h4>
                            <ol>
                                <li>Chọn qty và leverage.</li>
                                <li>Kiểm tra ký quỹ cần.</li>
                                <li>LONG hoặc SHORT.</li>
                                <li>Quan sát bảng lệnh.</li>
                                <li>Bấm X để đóng.</li>
                            </ol>
                            <h4>5. Lưu ý</h4>
                            <ul>
                                <li>Đòn bẩy cao thì liq gần, rủi ro cao.</li>
                                <li>Đã có chống âm ví khi đóng/thu hồi.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
