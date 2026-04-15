import React, { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../../api/axios";

function pageRange(page, totalPages, delta = 1){
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);
    const range = [1];
    if (left > 2) range.push("…");
    for (let i = left; i <= right; i++) range.push(i);
    if (right < totalPages - 1) range.push("…");
    range.push(totalPages);
    return range;
};

function PageBtn({ disabled, active, children, onClick, rounded }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={[
                "h-8 min-w-8 px-2 inline-flex items-center justify-center text-xs border",
                active
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                disabled && "opacity-40 cursor-not-allowed",
                rounded === "l" && "rounded-l-lg",
                rounded === "r" && "rounded-r-lg",
                !rounded && "rounded-lg",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function ConfirmCancelModal({ open, order, onConfirm, onClose }) {
    if (!open || !order) return null;
    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
                <h2 className="text-base font-semibold mb-2">Xác nhận hủy lệnh</h2>
                <p className="text-sm text-gray-600 mb-4">
                    Bạn có chắc muốn hủy lệnh #{order.id} ({order.trade_type === "buy" ? "Mua" : "Bán"} tại giá{" "}
                    {order.limit_price})?
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                    >
                        Không
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600"
                    >
                        Hủy lệnh
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function TradeHistory({ onRefresh, wsMessage }) {
    const [tab, setTab] = useState("open");
    const [openOrders, setOpenOrders] = useState([]);
    const [history, setHistory] = useState([]);
    const [ordersAll, setOrdersAll] = useState([]);
    const [loading, setLoading] = useState(false);
    const loadingRef = useRef(false);

    const [page, setPage] = useState(1);
    const [size, setSize] = useState(10);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [cancelTarget, setCancelTarget] = useState(null);

    const loadData = async (src = "manual") => {
        if (loadingRef.current) {
            console.log("[TH] skip load, busy, src =", src);
            return;
        }
        loadingRef.current = true;
        setLoading(true);
        try {
            console.log("[TH] loadData START, src =", src);
            const [ordersPendingRes, execRes, ordersAllRes] = await Promise.all([
                api.get("/spot/world/orders?status=PENDING"),
                api.get("/spot/world/executions?limit=200"),
                api.get("/spot/world/orders?limit=500"),
            ]);

            const open = ordersPendingRes.data || [];
            const execs = execRes.data || [];
            const all = ordersAllRes.data || [];

            console.log("[TH] loadData DONE, src =", src, {
                openCount: open.length,
                execCount: execs.length,
                allCount: all.length,
            });

            setOpenOrders(open);
            setHistory(execs);
            setOrdersAll(all);
        } catch (err) {
            console.error("[TH] loadData ERROR, src =" + src, err);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData("mount/onRefresh");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRefresh]);

    useEffect(() => {
        const id = setInterval(() => loadData("interval"), 5000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!wsMessage) return;
        console.log("[TH] wsMessage received:", wsMessage);

        const t = wsMessage.type;
        if (
            t === "spot_exec" ||
            t === "spot_order" ||
            t === "spot_refresh" ||
            t === "spot_limit_filled" ||
            t === "wallet_update" ||
            t === "orderbook"
        ) {
            loadData("ws:" + t);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsMessage]);


    useEffect(() => {
        setPage(1);
    }, [history.length]);

    const askCancel = (order) => {
        setCancelTarget(order);
        setConfirmOpen(true);
    };

    const doCancel = async () => {
        if (!cancelTarget) return;
        setConfirmOpen(false);
        try {
            await api.delete(`/spot/world/order/${cancelTarget.id}`);
            loadData("cancel");
        } catch (e) {
            console.error("[TH] cancel error", e);
        } finally {
            setCancelTarget(null);
        }
    };

    const orderTypeById = useMemo(() => {
        const m = new Map();
        for (const o of ordersAll) {
            if (o?.id != null) m.set(o.id, String(o.order_type || "").toLowerCase());
        }
        return m;
    }, [ordersAll]);

    const asUTC = (iso) => {
        if (!iso) return null;
        const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
        return new Date(hasTZ ? iso : iso + "Z");
    };

    const sortKey = (exec) => {
        const ot = orderTypeById.get(exec.order_id);
        if (ot === "market") {
            const d = asUTC(exec.executed_at);
            return d ? d.getTime() : 0;
        }
        try {
            return exec.executed_at ? new Date(exec.executed_at).getTime() : 0;
        } catch {
            return 0;
        }
    };

    const fmtVN = (iso) => {
        const d = asUTC(iso);
        return d ? d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "-";
    };

    const fmtExecTime = (exec) => {
        const ot = orderTypeById.get(exec.order_id);
        if (ot === "market") return fmtVN(exec.executed_at);
        try {
            return exec.executed_at ? new Date(exec.executed_at).toLocaleString() : "-";
        } catch {
            return exec.executed_at || "-";
        }
    };

    const avgMap = useMemo(() => {
        const arr = [...history].sort((a, b) => sortKey(a) - sortKey(b));
        let qty = 0,
            avg = 0;
        const map = new Map();
        for (const e of arr) {
            const q = Number(e.qty_xau || 0);
            const p = Number(e.price || 0);
            if (e.trade_type === "buy") {
                const total = qty * avg + q * p;
                qty += q;
                avg = qty > 0 ? total / qty : 0;
            } else {
                qty -= q;
                if (qty <= 1e-9) {
                    qty = 0;
                    avg = 0;
                }
            }
            map.set(e.id, avg);
        }
        return map;
    }, [history, orderTypeById]);

    const sortedHistory = useMemo(() => {
        return [...history].sort((a, b) => {
            const kb = sortKey(b);
            const ka = sortKey(a);
            if (kb !== ka) return kb - ka;
            return (b.id || 0) - (a.id || 0);
        });
    }, [history, orderTypeById]);

    const totalHistory = sortedHistory.length;
    const totalPages = Math.max(1, Math.ceil(totalHistory / size));
    const safePage = Math.min(page, totalPages);
    if (safePage !== page) {
        // tránh lệch trang khi dữ liệu ít lại
        setPage(safePage);
    }
    const pagedHistory = useMemo(() => {
        const start = (safePage - 1) * size;
        return sortedHistory.slice(start, start + size);
    }, [sortedHistory, safePage, size]);

    const num = (v, d = 2) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(d) : "-";
    };

    return (
        <div className="relative bg-white rounded-lg shadow-sm overflow-hidden">
            <ConfirmCancelModal
                open={confirmOpen}
                order={cancelTarget}
                onConfirm={doCancel}
                onClose={() => {
                    setConfirmOpen(false);
                    setCancelTarget(null);
                }}
            />

            <div className="flex items-center gap-6 px-4 pt-3">
                <button
                    onClick={() => setTab("open")}
                    className={`pb-2 text-sm font-semibold ${tab === "open"
                        ? "text-gray-900 border-b-2 border-yellow-400"
                        : "text-gray-500"
                        }`}
                >
                    Lệnh chờ ({openOrders.length})
                </button>
                <button
                    onClick={() => setTab("history")}
                    className={`pb-2 text-sm font-semibold ${tab === "history"
                        ? "text-gray-900 border-b-2 border-yellow-400"
                        : "text-gray-500"
                        }`}
                >
                    Lịch sử
                </button>
            </div>

            <AnimatePresence mode="wait">
                {tab === "open" ? (
                    <motion.div
                        key="open"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="overflow-x-auto"
                    >
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold">
                                        Thời gian
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold">
                                        Loại
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold">
                                        Lệnh
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        Giá
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        Số lượng
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold">
                                        Thao tác
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {openOrders.map((o) => (
                                    <tr key={o.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-sm">
                                            {o.created_at
                                                ? new Date(o.created_at).toLocaleString()
                                                : "-"}
                                        </td>
                                        <td className="px-4 py-2 text-sm">{o.order_type}</td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${o.trade_type === "buy"
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                                    }`}
                                            >
                                                {o.trade_type === "buy" ? "Mua" : "Bán"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right text-sm">
                                            ${num(o.limit_price, 2)}
                                        </td>
                                        <td className="px-4 py-2 text-right text-sm">
                                            {num(o.qty_xau, 5)}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                onClick={() => askCancel(o)}
                                                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-100 hover:bg-gray-200"
                                            >
                                                Hủy
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {openOrders.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-4 py-6 text-center text-sm text-gray-500"
                                        >
                                            Không có lệnh chờ
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </motion.div>
                ) : (
                    <motion.div
                        key="history"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="overflow-x-auto"
                    >
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold">
                                        Thời gian
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold">
                                        Lệnh
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        Giá
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        Giá mua TB
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        Số lượng
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        Tổng USD
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        Phí
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold">
                                        PnL
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedHistory.map((h) => {
                                    const avg = avgMap.get(h.id);
                                    const isBuy = h.trade_type === "buy";
                                    return (
                                        <tr key={h.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-sm">
                                                {fmtExecTime(h)}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span
                                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isBuy
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-red-100 text-red-700"
                                                        }`}
                                                >
                                                    {isBuy ? "Mua" : "Bán"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-right text-sm">
                                                ${num(h.price, 2)}
                                            </td>
                                            <td className="px-4 py-2 text-right text-sm">
                                                {isBuy ? `$${num(avg, 2)}` : "-"}
                                            </td>
                                            <td className="px-4 py-2 text-right text-sm">
                                                {num(h.qty_xau, 5)}
                                            </td>
                                            <td className="px-4 py-2 text-right text-sm">
                                                ${num(h.gross_usd, 2)}
                                            </td>
                                            <td className="px-4 py-2 text-right text-sm">
                                                ${num(h.fee_usd, 2)}
                                            </td>
                                            <td
                                                className={`px-4 py-2 text-right text-sm font-semibold ${Number(h.pnl_realized_usd || 0) >= 0
                                                    ? "text-green-600"
                                                    : "text-red-600"
                                                    }`}
                                            >
                                                {isBuy
                                                    ? "-"
                                                    : `$${num(h.pnl_realized_usd, 2)}`}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {totalHistory === 0 && (
                                    <tr>
                                        <td
                                            colSpan={8}
                                            className="px-4 py-6 text-center text-sm text-gray-500"
                                        >
                                            Chưa có lịch sử
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {totalHistory > 0 && (
                            <div className="px-4 py-3 border-t border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 hidden sm:inline">
                                        Hiển thị
                                    </span>
                                    <select
                                        value={size}
                                        onChange={(e) => {
                                            setPage(1);
                                            setSize(Number(e.target.value));
                                        }}
                                        className="h-8 rounded-lg border-gray-300 bg-white text-xs"
                                    >
                                        {[10, 20, 30, 50].map((v) => (
                                            <option key={v} value={v}>
                                                {v} dòng
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-1">
                                    <PageBtn
                                        rounded="l"
                                        disabled={safePage === 1}
                                        onClick={() => setPage(1)}
                                    >
                                        «
                                    </PageBtn>
                                    <PageBtn
                                        disabled={safePage === 1}
                                        onClick={() =>
                                            setPage((p) => Math.max(1, p - 1))
                                        }
                                    >
                                        ‹
                                    </PageBtn>

                                    {pageRange(safePage, totalPages, 1).map((p, i) =>
                                        p === "…" ? (
                                            <span
                                                key={`dots-${i}`}
                                                className="px-2 text-gray-500 text-xs"
                                            >
                                                …
                                            </span>
                                        ) : (
                                            <PageBtn
                                                key={p}
                                                active={p === safePage}
                                                onClick={() => setPage(p)}
                                            >
                                                {p}
                                            </PageBtn>
                                        )
                                    )}

                                    <PageBtn
                                        disabled={safePage === totalPages}
                                        onClick={() =>
                                            setPage((p) =>
                                                Math.min(totalPages, p + 1)
                                            )
                                        }
                                    >
                                        ›
                                    </PageBtn>
                                    <PageBtn
                                        rounded="r"
                                        disabled={safePage === totalPages}
                                        onClick={() => setPage(totalPages)}
                                    >
                                        »
                                    </PageBtn>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {loading && (
                <div className="p-2 text-xs text-gray-500">Đang tải...</div>
            )}
        </div>
    );
}
