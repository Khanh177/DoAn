import React, { useEffect, useState } from "react";
import api from "../../../api/axios";

const fmtNum6 = (n) => Number(n || 0).toFixed(6);
const fmtDate = (d) => {
    if (!d) return "-";
    const dt = new Date(d);
    const vn = new Date(dt.getTime() + 7 * 60 * 60 * 1000);
    return vn.toLocaleString("vi-VN", { hour12: false });
};

const STATUS_META = {
    open: { label: "Đang mở", cls: "bg-blue-50 text-blue-700" },
    closed: { label: "Đã đóng", cls: "bg-gray-100 text-gray-700" },
    liquidated: { label: "Đã thanh lý", cls: "bg-orange-50 text-orange-700" },
};

const pageRange = (page, totalPages, delta = 1) => {
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
                "h-9 min-w-9 px-3 inline-flex items-center justify-center text-sm border",
                active ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
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

export default function FuturesTradeHistoryPanel({ className = "" }) {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(10);
    const [loading, setLoading] = useState(false);

    const totalPages = Math.max(1, Math.ceil(total / size));

    const load = async (p, s) => {
        setLoading(true);
        try {
            const { data } = await api.get("/futures/trades/history", { params: { page: p, size: s } });
            setItems(data?.items || []);
            setTotal(data?.total || 0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(page, size);
    }, [page, size]);

    return (
        <section className={`h-full flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h1 className="text-[28px] font-semibold leading-tight">Lịch sử trade futures</h1>
            </div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="animate-pulse h-10 bg-gray-50 rounded mb-2" />
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <span className="text-gray-400">ⓘ</span>
                        </div>
                        <p className="text-gray-500">Không có dữ liệu</p>
                    </div>
                ) : (
                    <table className="min-w-full table-fixed text-sm">
                        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                            <tr className="text-[11px] uppercase tracking-wider text-gray-600">
                                <th className="px-6 py-3 text-left w-28">ID</th>
                                <th className="px-6 py-3 text-left w-40">Thời gian</th>
                                <th className="px-6 py-3 text-left w-36">Cặp tiền tệ</th>
                                <th className="px-6 py-3 text-center w-28">Lệnh</th>
                                <th className="px-6 py-3 text-right w-32">Khối lượng</th>
                                <th className="px-6 py-3 text-right w-32">Giá mở lệnh</th>
                                <th className="px-6 py-3 text-right w-28">Phí</th>
                                <th className="px-6 py-3 text-center w-32">Trạng thái</th>
                                <th className="px-6 py-3 text-right w-36">PnL đã chốt</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((it, idx) => {
                                const meta = STATUS_META[it.position_status] || { label: "-", cls: "bg-gray-50 text-gray-600" };
                                const showPnl = it.position_status === "closed" || it.position_status === "liquidated";
                                const pnl = showPnl ? Number(it.pnl_realized ?? 0) : 0;
                                const pnlCls = !showPnl
                                    ? "text-gray-400"
                                    : pnl > 0
                                        ? "text-green-700"
                                        : pnl < 0
                                            ? "text-red-700"
                                            : "text-gray-600";

                                return (
                                    <tr key={it.id} className={idx % 2 ? "bg-white" : "bg-gray-50/40"}>
                                        <td className="px-6 py-3 whitespace-nowrap font-mono font-semibold text-gray-900">#{it.id}</td>
                                        <td className="px-6 py-3 whitespace-nowrap">{fmtDate(it.created_at)}</td>
                                        <td className="px-6 py-3 whitespace-nowrap">{it.instrument_symbol || it.instrument_id || "-"}</td>
                                        <td className="px-6 py-3 text-center">
                                            <span
                                                className={
                                                    it.side === "long"
                                                        ? "px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs"
                                                        : "px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs"
                                                }
                                            >
                                                {it.side}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-right tabular-nums">{fmtNum6(it.qty)}</td>
                                        <td className="px-6 py-3 text-right tabular-nums">{fmtNum6(it.price)}</td>
                                        <td className="px-6 py-3 text-right tabular-nums">{fmtNum6(it.fee)}</td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${meta.cls}`}>{meta.label}</span>
                                        </td>
                                        <td className={`px-6 py-3 text-right tabular-nums font-semibold ${pnlCls}`}>
                                            {showPnl ? fmtNum6(pnl) : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {total > 0 && (
                <div className="px-4 py-3 border-t border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 hidden sm:inline">Hiển thị</span>
                        <select
                            value={size}
                            onChange={(e) => {
                                setPage(1);
                                setSize(Number(e.target.value));
                            }}
                            className="h-9 rounded-lg border-gray-300 bg-white text-sm"
                        >
                            {[10, 20, 30, 50].map((v) => (
                                <option key={v} value={v}>
                                    {v} dòng
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <PageBtn rounded="l" disabled={page === 1} onClick={() => setPage(1)}>
                            «
                        </PageBtn>
                        <PageBtn disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            ‹
                        </PageBtn>

                        {pageRange(page, totalPages, 1).map((p, i) =>
                            p === "…" ? (
                                <span key={`dots-${i}`} className="px-2 text-gray-500">
                                    …
                                </span>
                            ) : (
                                <PageBtn key={p} active={p === page} onClick={() => setPage(p)}>
                                    {p}
                                </PageBtn>
                            )
                        )}

                        <PageBtn disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                            ›
                        </PageBtn>
                        <PageBtn rounded="r" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                            »
                        </PageBtn>
                    </div>
                </div>
            )}
        </section>
    );
}
