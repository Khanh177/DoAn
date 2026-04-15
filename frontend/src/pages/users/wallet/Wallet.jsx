import React, { useState, useEffect, useMemo, useRef } from "react";
import Header from "../../../layouts/Header";
import api from "../../../api/axios";
import Deposit from "./Deposit";
import Transfer from "./Transfer";
import WalletSidebarContainer from "./SidebarWallet";
import DepositHistoryPanel from "./DepositHistoryPanel";
import FuturesTradeHistoryPanel from "./FuturesTradeHistoryPanel";
import SuccessModal from "../../../layouts/SuccessModal";
import DomesticSpotHistoryPanel from "./DomesticSpotHistoryPanel";

const fmt = (n, locale = "vi-VN") => Number(n || 0).toLocaleString(locale);
const usd = (n) =>
    `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 })} USD`;
const vnd = (n) =>
    `${Number(n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} VNĐ`;
const fmt6 = (n) => Number(n || 0).toFixed(6);
const alignClass = (a) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

export default function Wallet() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [userId, setUserId] = useState(null);
    const [usdToVndRate, setUsdToVndRate] = useState(0);
    const [pnl, setPnl] = useState(0);

    const [walletTypes, setWalletTypes] = useState([]);
    const [activeTypeId, setActiveTypeId] = useState(null);
    const [loadingTypes, setLoadingTypes] = useState(true);

    const [wb, setWb] = useState(null);
    const [loadingWb, setLoadingWb] = useState(false);

    const [depositOpen, setDepositOpen] = useState(false);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [assetsByType, setAssetsByType] = useState({});

    const [view, setView] = useState("assets"); // 'assets' | 'depositHistory'

    // Realtime notify
    const [notiOpen, setNotiOpen] = useState(false);
    const [notiMsg, setNotiMsg] = useState("");
    const wsRef = useRef(null);

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        const uname = localStorage.getItem("username");
        const uid = localStorage.getItem("user_id");
        setIsLoggedIn(!!token);
        if (uname) setUsername(uname);
        if (uid) setUserId(Number(uid));
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/deposit/usd-vnd");
                const r = Number(data?.usd_vnd || 0);
                if (r > 0) setUsdToVndRate(r);
            } catch { }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/wallet/wallet_type", { params: { skip: 0, limit: 1000 } });
                setWalletTypes(data || []);
                setActiveTypeId(data?.[0]?.id ?? null);
            } catch { }
            setLoadingTypes(false);
        })();
    }, []);

    const refetchBalance = async (typeId) => {
        if (!userId || !typeId) return;
        try {
            setLoadingWb(true);
            const { data } = await api.get(`/wallet/${userId}/${typeId}/balance`);
            setWb(data);
        } catch {
            setWb(null);
        } finally {
            setLoadingWb(false);
        }
    };

    useEffect(() => {
        if (!activeTypeId || !userId) return;
        refetchBalance(activeTypeId);
    }, [activeTypeId, userId]);

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (!token || !userId) return;
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return; // đã có kết nối

        const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";
        const url = `${WS_BASE}/ws/user?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        let pingTimer = null;

        ws.onopen = () => {
            // giữ kết nối
            pingTimer = setInterval(() => {
                try { ws.send("ping"); } catch { }
            }, 30000);
            // console.log("WS open");
        };

        ws.onmessage = async (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === "deposit_credited") {
                    const amount = Number(msg.usdt_amount || 0);
                    const wtId = Number(msg.wallet_type_id ?? activeTypeId); // cần backend gửi wallet_type_id

                    setNotiMsg(`Bạn vừa nhận +${amount.toFixed(6)} USD vào ví Funding.`);
                    setNotiOpen(true);

                    // Cập nhật lạc quan số dư đang hiển thị nếu đúng ví đang mở
                    if (wtId === activeTypeId) {
                        setWb((prev) =>
                            prev ? { ...prev, balance: Number(prev.balance || 0) + amount } : prev
                        );
                    }

                    // Đồng bộ cứng nền
                    await refetchBalance(wtId);
                }
            } catch { }
        };

        ws.onclose = () => {
            if (pingTimer) clearInterval(pingTimer);
            wsRef.current = null;
        };
        ws.onerror = () => { /* optional: retry strategy */ };

        return () => {
            if (pingTimer) clearInterval(pingTimer);
            try { ws.close(); } catch { }
            wsRef.current = null;
        };
    }, [userId]); // <- KHÔNG đưa activeTypeId vào đây

    const buildAssets = (b) => ([
        { key: "usd_cash", name: "USD", qty: b.balance, logo: "https://www.svgrepo.com/show/367256/usdt.svg" },
        { key: "vang_the_gioi", name: "Vàng", qty: b.gold_world_balance, logo: "https://s3-symbol-logo.tradingview.com/metal/gold--600.png" },
        { key: "vang_sjc", name: "Vàng SJC", qty: b.gold_sjc_balance, logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6K0BZVvz93geE3_wiXyWzZV8JPRIP8iSwsA&s" },
        { key: "vang_doji_hn", name: "Vàng Doji Hà Nội", qty: b.gold_doji_hn_balance, logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSNaESA0YP2LU3g65xEnO5AyG8uB6_P3vS4gw&s" },
        { key: "vang_doji_sg", name: "Vàng Doji Sài Gòn", qty: b.gold_doji_sg_balance, logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSNaESA0YP2LU3g65xEnO5AyG8uB6_P3vS4gw&s" },
        { key: "vang_btmc_sjc", name: "Vàng BTMC SJC", qty: b.gold_btmc_sjc_balance, logo: "https://btmc.vn/UserFiles/image/Logo-BTMC.png" },
        { key: "vang_phu_quy_sjc", name: "Vàng Phú Quý SJC", qty: b.gold_phu_quy_sjc_balance, logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQkMzbTnVyJ-tHxQG3RACC6eIwk2vvN6DDDUA&s" },
        { key: "vang_pnj_hcm", name: "Vàng PNJ HCM", qty: b.gold_pnj_hcm_balance, logo: "https://ibrand.vn/wp-content/uploads/2024/09/pnj.png" },
        { key: "vang_pnj_hn", name: "Vàng PNJ HN", qty: b.gold_pnj_hn_balance, logo: "https://ibrand.vn/wp-content/uploads/2024/09/pnj.png" },
    ]);

    useEffect(() => {
        if (!transferModalOpen || !userId || walletTypes.length === 0) return;
        let cancelled = false;
        (async () => {
            try {
                const results = await Promise.all(
                    walletTypes.map(async (t) => {
                        const { data } = await api.get(`/wallet/${userId}/${t.id}/balance`);
                        return [t.id, buildAssets(data)];
                    })
                );
                if (!cancelled) setAssetsByType(Object.fromEntries(results));
            } catch {
                if (!cancelled) setAssetsByType({});
            }
        })();
        return () => { cancelled = true; };
    }, [transferModalOpen, userId, walletTypes]);

    const activeType = useMemo(
        () => walletTypes.find((t) => t.id === activeTypeId) || null,
        [walletTypes, activeTypeId]
    );

    const columnsByKind = {
        funding: [
            { key: "coinName", label: "Coin", align: "left" },
            { key: "qty", label: "Số lượng", align: "right" },
            { key: "available", label: "Khả dụng", align: "right" },
            { key: "frozen", label: "Đã đóng băng", align: "right" },
            { key: "actionsFunding", label: "Hành động", align: "right" },
        ],
        fiatspot: [
            { key: "coinName", label: "Coin", align: "left" },
            { key: "qty", label: "Số lượng", align: "right" },
            { key: "available", label: "Khả dụng", align: "right" },
            { key: "actionsFiatSpot", label: "Hành động", align: "right" },
        ],
        futures: [
            { key: "coinName", label: "Coin", align: "left" },
            { key: "balance", label: "Số dư ví", align: "right" },
            { key: "pnl", label: "PNL chưa ghi nhận", align: "right" },
            { key: "transferable", label: "Có thể chuyển được", align: "right" },
            { key: "actionsTransfer", label: "Hành động", align: "right" },
        ],
    };

    const normalizeKind = (name) => {
        const s = (name || "").toLowerCase();
        if (s.includes("future")) return "futures";
        if (s.includes("funding")) return "funding";
        if (s.includes("fiat") || s.includes("spot")) return "fiatspot";
        return "fiatspot";
    };
    const kind = normalizeKind(activeType?.name);
    const cols = columnsByKind[kind];

    const assets = useMemo(() => (wb ? buildAssets(wb) : []), [wb]);

    const rows = useMemo(
        () =>
            assets.map((a) => ({
                ...a,
                available: a.qty,
                frozen: 0,
                balance: a.qty,
                pnl,
                transferable: a.qty,
            })),
        [assets, pnl]
    );

    const handleTransferConfirm = async (payload) => {
        try {
            await api.post(`/wallet/${userId}/transfer`, payload);
            const refetch = async (typeId) => {
                const { data } = await api.get(`/wallet/${userId}/${typeId}/balance`);
                setAssetsByType((prev) => ({ ...prev, [typeId]: buildAssets(data) }));
                if (activeTypeId === typeId) setWb(data);
            };
            await Promise.all([refetch(payload.from_wallet_type_id), refetch(payload.to_wallet_type_id)]);
            setTransferModalOpen(false);
        } catch (err) {
            alert(err?.response?.data?.detail || "Chuyển tiền thất bại");
        }
    };

    return (
        <div className="bg-white text-black min-h-screen">
            <Header isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} username={username} setUsername={setUsername} />
            <div className="flex p-6 gap-6 bg-gray-100 min-h-screen items-stretch">
                <WalletSidebarContainer
                    title="Tài sản"
                    value={activeTypeId}
                    currentView={view}
                    onChange={(v) => {
                        // nếu là số => chọn ví
                        if (typeof v === "number") {
                            setActiveTypeId(v);
                            setView("assets");
                        } else {
                            // nếu là chuỗi => đổi view
                            setView(v);
                        }
                    }}
                    onLoaded={(types) => setWalletTypes(types)}
                    onOpenDepositHistory={() => setView("depositHistory")}
                />

                <main className="flex-1 flex flex-col space-y-6">
                    {view === "assets" && (
                        <>
                            <div className="bg-white rounded-lg shadow p-6">
                                <h2 className="text-lg font-semibold mb-2">Tổng số dư</h2>
                                <div className="flex gap-4">
                                    <p className="text-2xl font-bold text-green-600">{usd(Number(wb?.balance || 0))}</p>
                                </div>
                                <p className="text-l text-gray-600">≈ {vnd(Number(wb?.balance || 0) * usdToVndRate)}</p>
                                <div className="mt-4 flex justify-end gap-4">
                                    <button
                                        className="bg-[#e5e6e9] text-black px-4 py-2 rounded hover:bg-gray-300 cursor-pointer"
                                        onClick={() => setDepositOpen(true)}
                                    >Nạp</button>
                                    <button
                                        className="bg-[#e5e6e9] text-black px-4 py-2 rounded hover:bg-gray-300 cursor-pointer"
                                        onClick={() => setTransferModalOpen(true)}
                                    >Chuyển</button>
                                </div>
                            </div>

                            <div className="bg-white text-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200">
                                <div className="flex items-center justify-between px-5 py-4 border-gray-200">
                                    <h2 className="text-xl font-semibold">Tài sản của tôi{activeType ? ` • ${activeType.name}` : ""}</h2>
                                    {loadingWb && <span className="text-sm text-gray-500">Đang tải số dư…</span>}
                                </div>

                                <div className="overflow-auto">
                                    <table className="min-w-full table-auto">
                                        <thead className="sticky top-0 z-10 bg-white border-b border-gray-200">
                                            <tr>
                                                {cols.map((c) => (
                                                    <th key={c.key} className={`px-5 py-3 ${alignClass(c.align)} text-[11px] uppercase tracking-wider text-gray-600 font-semibold`}>{c.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-100">
                                            {rows.length === 0 ? (
                                                <tr><td colSpan={cols.length} className="px-5 py-8 text-center text-gray-500">Chưa có tài sản</td></tr>
                                            ) : (
                                                rows.map((r) => (
                                                    <tr key={r.key} className="hover:bg-gray-50 transition-colors">
                                                        {cols.map((c) => {
                                                            if (c.key === "coinName")
                                                                return (
                                                                    <td key={c.key} className="px-5 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                            <img src={r.logo} alt={r.name} className="h-7 w-7 rounded-full ring-1 ring-gray-200" />
                                                                            <div className="flex flex-col">
                                                                                <span className="font-medium text-gray-900">{r.name}</span>
                                                                                {r.currency && <span className="text-xs text-gray-500">{r.currency}</span>}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                );
                                                            if (c.key === "qty") return <td key={c.key} className="px-5 py-3 text-right tabular-nums font-semibold">{fmt6(r.qty)}</td>;
                                                            if (c.key === "available") return <td key={c.key} className="px-5 py-3 text-right tabular-nums font-semibold">{fmt6(r.available)}</td>;
                                                            if (c.key === "frozen") return <td key={c.key} className="px-5 py-3 text-right tabular-nums font-semibold">{fmt6(r.frozen)}</td>;
                                                            if (c.key === "balance") return <td key={c.key} className="px-5 py-3 text-right tabular-nums font-semibold">{fmt6(r.balance)}</td>;
                                                            if (c.key === "pnl")
                                                                return (
                                                                    <td key={c.key} className="px-5 py-3 text-right tabular-nums font-semibold">
                                                                        <span className={r.pnl >= 0 ? "text-green-600" : "text-red-600"}>{r.pnl >= 0 ? `+${fmt6(r.pnl)}` : fmt6(r.pnl)}</span>
                                                                    </td>
                                                                );
                                                            if (c.key === "transferable") return <td key={c.key} className="px-5 py-3 text-right tabular-nums font-semibold">{fmt6(r.transferable)}</td>;
                                                            if (c.key === "actionsFunding")
                                                                return (
                                                                    <td key={c.key} className="px-5 py-3 text-right space-x-5">
                                                                        <button
                                                                            type="button"
                                                                            className="underline text-[#F0B90B] hover:text-[#F8D12F] font-medium"
                                                                            onClick={() => setDepositOpen(true)}
                                                                        >
                                                                            Nạp
                                                                        </button>
                                                                    </td>
                                                                );
                                                            if (c.key === "actionsFiatSpot")
                                                                return (
                                                                    <td key={c.key} className="px-5 py-3 text-right space-x-5">
                                                                        <button type="button" className="underline text-[#F0B90B] hover:text-[#F8D12F] font-medium">Giao dịch</button>
                                                                    </td>
                                                                );
                                                            if (c.key === "actionsTransfer")
                                                                return (
                                                                    <td key={c.key} className="px-5 py-3 text-right">
                                                                        <button
                                                                            type="button"
                                                                            className="underline text-[#F0B90B] hover:text-[#F8D12F] font-medium"
                                                                            onClick={() => setTransferModalOpen(true)}
                                                                        >
                                                                            Chuyển
                                                                        </button>
                                                                    </td>
                                                                );
                                                            return <td key={c.key} className="px-5 py-3" />;
                                                        })}
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {view === "depositHistory" && (
                        <DepositHistoryPanel className="flex-1" />
                    )}
                    {view === "futuresHistory" && (
                        <FuturesTradeHistoryPanel className="flex-1" />
                    )}
                    {view === "spotdomHistory" && (
                        <DomesticSpotHistoryPanel className="flex-1" />
                    )}

                </main>

                <Deposit
                    open={depositOpen}
                    onClose={() => {
                        setDepositOpen(false);
                        refetchBalance(activeTypeId);
                    }}
                    usdToVndRate={usdToVndRate}
                />

                <Transfer
                    open={transferModalOpen}
                    onClose={() => setTransferModalOpen(false)}
                    walletTypes={walletTypes}
                    assetsByType={assetsByType}
                    defaultFromTypeId={activeTypeId}
                    defaultCoinKey="usd_cash"
                    onConfirm={handleTransferConfirm}
                />
            </div>

            <SuccessModal
                open={notiOpen}
                message={notiMsg}
                onOk={() => {
                    setNotiOpen(false);
                    if (activeTypeId) refetchBalance(activeTypeId); // đảm bảo đã cập nhật xong
                }}
            />
        </div>
    );
}
