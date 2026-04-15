import React, { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { FiCalendar } from "react-icons/fi";
import { HelpCircle } from "lucide-react";
import Header from "../../../layouts/Header";
import api from "../../../api/axios";
import TradeForm from "./TradeForm";
import TradeHistory from "./TradeHistory";

export default function DomesticGold() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [giaHomNay, setGiaHomNay] = useState([]);
    const [giaHomQua, setGiaHomQua] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState("");
    const [viewDate, setViewDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [usdToVndRate, setUsdToVndRate] = useState(0);
    const [totalVolumes, setTotalVolumes] = useState({});
    const [todayPrices, setTodayPrices] = useState([]);
    const [showGuide, setShowGuide] = useState(false);

    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const wsRef = useRef(null);
    const pingTimerRef = useRef(null);
    const wspRef = useRef(null);
    const wspPingRef = useRef(null);

    const fmtDate = (d) => {
        const x = new Date(d);
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
            x.getDate()
        ).padStart(2, "0")}`;
    };
    const getFormattedDate = fmtDate;
    const getDisplayDate = (d) => {
        const x = new Date(d);
        return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(
            2,
            "0"
        )}/${x.getFullYear()}`;
    };

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        const uname = localStorage.getItem("username");
        setIsLoggedIn(!!token);
        if (uname) setUsername(uname);
    }, []);

    async function loadPrices(dateStr) {
        const res = await api.get("/domestic-gold/gold-price", { params: { d: dateStr } });
        return (res.data || []).map((x) => ({
            instrument_id: x.instrument_id,
            thuong_hieu: x.brand,
            mua_vao: x.buy_price,
            ban_ra: x.sell_price,
            as_of: x.as_of,
        }));
    }
    async function loadHistorySeries(brand, endDate, days = 30) {
        const res = await api.get("/domestic-gold/history", { params: { brand, end: endDate, days } });
        return res.data || [];
    }

    // Load bảng giá theo ngày, KHÔNG reset totals về 0
    useEffect(() => {
        (async () => {
            const dayPrices = await loadPrices(getFormattedDate(viewDate));
            setGiaHomNay(dayPrices);
            if (dayPrices.length && !selectedBrand) setSelectedBrand(dayPrices[0].thuong_hieu);

            // Bổ sung key nếu thiếu, không ghi đè số đang có
            setTotalVolumes((prev) => {
                const next = { ...prev };
                dayPrices.forEach((r) => {
                    if (!next[r.thuong_hieu]) next[r.thuong_hieu] = { buy: 0, sell: 0 };
                });
                return next;
            });

            const y = new Date(viewDate);
            y.setDate(y.getDate() - 1);
            const yesterday = await loadPrices(getFormattedDate(y));
            setGiaHomQua(yesterday);
        })().catch(() => { });
    }, [viewDate]);

    // Lấy giá hôm nay để lấy market price + instrumentId
    useEffect(() => {
        (async () => {
            const realTodayStr = getFormattedDate(new Date());
            const realTodayPrices = await loadPrices(realTodayStr);
            setTodayPrices(realTodayPrices);
        })().catch(() => { });
    }, []);

    // Vẽ chart 30 ngày
    const drawChart = async (brand, endDate) => {
        if (!chartRef.current || !brand) return;
        const hist = await loadHistorySeries(brand, endDate, 30);
        const labels = hist.map((p) => {
            const d = new Date(p.as_of);
            return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        });
        const mua = hist.map((p) => p.buy_price ?? null);
        const ban = hist.map((p) => p.sell_price ?? null);
        chartInstance.current?.destroy();
        chartInstance.current = new Chart(chartRef.current.getContext("2d"), {
            type: "line",
            data: {
                labels,
                datasets: [
                    { label: "Mua vào", data: mua, borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)", fill: false, tension: 0.3, pointRadius: 2 },
                    { label: "Bán ra", data: ban, borderColor: "#10B981", backgroundColor: "rgba(16,185,129,0.1)", fill: false, tension: 0.3, pointRadius: 2 },
                ],
            },
            options: { responsive: true, maintainAspectRatio: false },
        });
    };
    useEffect(() => {
        if (selectedBrand) drawChart(selectedBrand, getFormattedDate(viewDate));
    }, [selectedBrand, viewDate]);
    useEffect(() => () => chartInstance.current?.destroy(), []);

    const getPriceChange = (todayPrice, yesterdayPrice) => {
        if (yesterdayPrice == null) return { change: 0, symbol: "", color: "" };
        const diff = todayPrice - yesterdayPrice;
        return {
            change: diff,
            symbol: diff > 0 ? "▲" : diff < 0 ? "▼" : "",
            color: diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "",
        };
    };

    const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";
    const buildWsUrl = () => {
        const token = localStorage.getItem("access_token");
        return token ? `${WS_BASE}/ws/prices?token=${encodeURIComponent(token)}` : `${WS_BASE}/ws/prices`;
    };
    const buildWsPublicUrl = () => `${WS_BASE}/ws/public`;

    // WS giá: khi có tick giá thì refresh bảng giá; giữ nguyên totals hiện có
    useEffect(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
        const url = buildWsUrl();
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
            pingTimerRef.current = setInterval(() => {
                try {
                    ws.send("ping");
                } catch { }
            }, 30000);
        };
        ws.onmessage = async (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg?.type !== "gold_price") return;

                const dayPrices = await loadPrices(getFormattedDate(viewDate));
                setGiaHomNay(dayPrices);

                // bổ sung key brand nếu thiếu
                setTotalVolumes((prev) => {
                    const next = { ...prev };
                    dayPrices.forEach((r) => {
                        if (!next[r.thuong_hieu]) next[r.thuong_hieu] = { buy: 0, sell: 0 };
                    });
                    return next;
                });

                const y = new Date(viewDate);
                y.setDate(y.getDate() - 1);
                setGiaHomQua(await loadPrices(getFormattedDate(y)));

                const realTodayStr = getFormattedDate(new Date());
                setTodayPrices(await loadPrices(realTodayStr));

                if (dayPrices.length && !dayPrices.some((r) => r.thuong_hieu === selectedBrand)) {
                    setSelectedBrand(dayPrices[0].thuong_hieu);
                }
                if (selectedBrand) drawChart(selectedBrand, getFormattedDate(viewDate));
            } catch { }
        };
        ws.onclose = () => {
            if (pingTimerRef.current) clearInterval(pingTimerRef.current);
            wsRef.current = null;
        };
        return () => {
            if (pingTimerRef.current) clearInterval(pingTimerRef.current);
            try {
                ws.close();
            } catch { }
            wsRef.current = null;
        };
    }, [viewDate, selectedBrand]);

    // Lấy tỷ giá
    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/deposit/usd-vnd");
                const r = Number(data?.usd_vnd || 0);
                if (r > 0) setUsdToVndRate(r);
            } catch { }
        })();
    }, []);

    // Lấy totals ban đầu
    useEffect(() => {
        (async () => {
            try {
                const arr = await api.get("/domestic-gold/spot/daily-totals").then((r) => r.data || []);
                const map = {};
                arr.forEach((r) => {
                    if (r.brand) map[r.brand] = { buy: r.buy || 0, sell: r.sell || 0 };
                });
                setTotalVolumes((prev) => ({ ...prev, ...map })); // server ghi đè
            } catch { }
        })();
    }, []);

    // POLLING fallback mỗi 5s để mọi user luôn thấy tổng mới
    useEffect(() => {
        const t = setInterval(async () => {
            try {
                const arr = await api.get("/domestic-gold/spot/daily-totals").then((r) => r.data || []);
                const map = {};
                arr.forEach((r) => {
                    if (r.brand) map[r.brand] = { buy: r.buy || 0, sell: r.sell || 0 };
                });
                setTotalVolumes((prev) => ({ ...prev, ...map })); // server ghi đè
            } catch { }
        }, 5000);
        return () => clearInterval(t);
    }, []);

    // WS công cộng: merge totals theo dữ liệu server
    useEffect(() => {
        const url = buildWsPublicUrl();
        const wsp = new WebSocket(url);
        wspRef.current = wsp;
        wsp.onopen = () => {
            wspPingRef.current = setInterval(() => {
                try {
                    wsp.send("ping");
                } catch { }
            }, 30000);
        };
        wsp.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.type === "spot_totals_update" && Array.isArray(msg.data)) {
                    const map = {};
                    msg.data.forEach((r) => {
                        if (r.brand) map[r.brand] = { buy: r.buy || 0, sell: r.sell || 0 };
                    });
                    setTotalVolumes((prev) => ({ ...prev, ...map })); // server ghi đè
                }
            } catch { }
        };
        wsp.onclose = () => {
            if (wspPingRef.current) clearInterval(wspPingRef.current);
            wspRef.current = null;
        };
        return () => {
            if (wspPingRef.current) clearInterval(wspPingRef.current);
            try {
                wsp.close();
            } catch { }
            wspRef.current = null;
        };
    }, []);

    const rowClass = (brand) =>
        `text-center transition-colors duration-200 cursor-pointer ${brand === selectedBrand ? "bg-yellow-100" : "hover:bg-yellow-50"
        }`;
    const handleRowClick = (brand) => setSelectedBrand(brand);

    const todayRow = todayPrices.find((x) => x.thuong_hieu === selectedBrand);
    const marketBuyPriceForSelected = todayRow ? todayRow.mua_vao : 0;
    const marketSellPriceForSelected = todayRow ? todayRow.ban_ra : 0;
    const instrumentIdForSelected = todayRow ? todayRow.instrument_id : null;

    return (
        <div className="min-h-screen bg-gray-50">
            <Header
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                username={username}
                setUsername={setUsername}
            />
            <main className="w-full mx-auto px-2 sm:px-4 lg:px-6 py-10">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-bold text-gray-800">Giá Vàng Trong Nước</h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                    <section className="lg:col-span-7">
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <div className="flex items.center justify-between mb-4">
                                <h2 className="text-2xl font-bold text-gray-800">Giá Vàng</h2>
                                <div className="relative">
                                    <button
                                        type="button"
                                        className="p-2 rounded-lg hover:bg-gray-100"
                                        onClick={() => setShowDatePicker((v) => !v)}
                                        title="Chọn ngày"
                                    >
                                        <FiCalendar className="w-5 h-5 text-gray-700" />
                                    </button>
                                    {showDatePicker && (
                                        <input
                                            type="date"
                                            value={getFormattedDate(viewDate)}
                                            onChange={(e) => setViewDate(new Date(e.target.value))}
                                            max={new Date().toISOString().split("T")[0]}
                                            className="absolute right-0 mt-2 border rounded-md px-2 py-1 text-sm shadow bg-white"
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white">
                                            <th className="px-4 py-2 text-left text-xs font-semibold">Thương hiệu</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold">
                                                Giá mua ({getDisplayDate(viewDate)})
                                            </th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold">
                                                Giá bán ({getDisplayDate(viewDate)})
                                            </th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold">Mua hôm qua</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold">Bán hôm qua</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {giaHomNay.map((item, idx) => {
                                            const y = giaHomQua.find((g) => g.thuong_hieu === item.thuong_hieu) || {};
                                            const mua = getPriceChange(item.mua_vao, y.mua_vao);
                                            const ban = getPriceChange(item.ban_ra, y.ban_ra);
                                            return (
                                                <tr
                                                    key={idx}
                                                    className={rowClass(item.thuong_hieu)}
                                                    onClick={() => handleRowClick(item.thuong_hieu)}
                                                >
                                                    <td className="px-4 py-2 text-left text-gray-700 text-sm font-medium">
                                                        {item.thuong_hieu}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <span className="text-gray-800 text-sm font-medium">
                                                            {item.mua_vao?.toLocaleString() || "N/A"} VND
                                                        </span>
                                                        {mua.symbol && (
                                                            <span className={`${mua.color} text-xs ml-2`}>
                                                                {mua.symbol} {Math.abs(mua.change).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <span className="text-gray-800 text-sm font-medium">
                                                            {item.ban_ra?.toLocaleString() || "N/A"} VND
                                                        </span>
                                                        {ban.symbol && (
                                                            <span className={`${ban.color} text-xs ml-2`}>
                                                                {ban.symbol} {Math.abs(ban.change).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-right text-gray-600 text-sm">
                                                        {y.mua_vao?.toLocaleString() || "N/A"} VND
                                                    </td>
                                                    <td className="px-4 py-2 text-right text-gray-600 text-sm">
                                                        {y.ban_ra?.toLocaleString() || "N/A"} VND
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 text-xs text-gray-500">
                                <span className="text-green-600">▲</span> Tăng ·{" "}
                                <span className="text-red-600">▼</span> Giảm
                            </div>
                        </div>
                    </section>

                    <aside className="lg:col-span-5">
                        <div className="bg-white rounded-xl shadow-lg p-6 h-full flex flex-col">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Biểu Đồ 30 ngày</h2>
                            <div className="flex-1">
                                <canvas ref={chartRef} style={{ maxHeight: "400px", width: "100%" }} />
                            </div>
                            <p className="text-sm text-gray-500 mt-4">
                                Đến: <span className="font-medium">{getDisplayDate(viewDate)}</span> —{" "}
                                <span className="font-medium">{selectedBrand}</span>
                            </p>
                        </div>
                    </aside>

                    <section className="lg:col-span-7">
                        <div className="bg-white rounded-xl shadow-lg p-6 h-full flex flex-col">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Tổng Khối Lượng Giao Dịch Trong Ngày ({getDisplayDate(new Date())})
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white">
                                            <th className="px-4 py-2 text-left text-xs font-semibold">Thương hiệu</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold">Tổng Mua</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold">Tổng Bán</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(totalVolumes).map(([brand, { buy, sell }]) => (
                                            <tr key={brand} className="hover:bg-yellow-50">
                                                <td className="px-4 py-2 text-left text-gray-700 text-sm font-medium">{brand}</td>
                                                <td className="px-4 py-2 text-right text-green-600 text-sm font-medium">
                                                    {Number(buy || 0).toFixed(6)}
                                                </td>
                                                <td className="px-4 py-2 text-right text-red-600 text-sm font-medium">
                                                    {Number(sell || 0).toFixed(6)}
                                                </td>
                                            </tr>
                                        ))}
                                        {Object.keys(totalVolumes).length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                                                    Không có dữ liệu
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>

                    <aside className="lg:col-span-5">
                        <div className="bg-white rounded-xl shadow-lg p-6 h-full flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-gray-800">Giao dịch</h2>
                                <button
                                    type="button"
                                    onClick={() => setShowGuide(true)}
                                    className="p-1 rounded-full hover:bg-gray-100"
                                    aria-label="Hướng dẫn"
                                >
                                    <HelpCircle className="w-5 h-5 text-gray-500 cursor-pointer" />
                                </button>
                            </div>
                            <TradeForm
                                selectedBrand={selectedBrand}
                                instrumentId={
                                    todayPrices.find((x) => x.thuong_hieu === selectedBrand)?.instrument_id || null
                                }
                                marketBuyPrice={
                                    todayPrices.find((x) => x.thuong_hieu === selectedBrand)?.mua_vao || 0
                                }
                                marketSellPrice={
                                    todayPrices.find((x) => x.thuong_hieu === selectedBrand)?.ban_ra || 0
                                }
                                usdToVndRate={usdToVndRate}
                                showGuide={showGuide}
                                setShowGuide={setShowGuide}
                                onTraded={async () => {
                                    // refresh totals thủ công ngay sau giao dịch
                                    const arr = await api
                                        .get("/domestic-gold/spot/daily-totals")
                                        .then((r) => r.data || []);
                                    const map = {};
                                    arr.forEach((r) => {
                                        if (r.brand) map[r.brand] = { buy: r.buy || 0, sell: r.sell || 0 };
                                    });
                                    setTotalVolumes((prev) => ({ ...prev, ...map }));

                                    // refresh price list hôm nay
                                    const realTodayStr = getFormattedDate(new Date());
                                    const realTodayPrices = await loadPrices(realTodayStr);
                                    setTodayPrices(realTodayPrices);

                                    // đảm bảo key tồn tại
                                    const totals = {};
                                    realTodayPrices.forEach(
                                        (r) => (totals[r.thuong_hieu] = totals[r.thuong_hieu] || { buy: 0, sell: 0 })
                                    );
                                    setTotalVolumes((prev) => ({ ...totals, ...map }));
                                }}
                            />
                        </div>
                    </aside>

                    <section className="lg:col-span-12">
                        <section className="lg:col-span-12">
                            <TradeHistory defaultOpen={false} />
                        </section>
                    </section>
                </div>
            </main>
        </div>
    );
}
