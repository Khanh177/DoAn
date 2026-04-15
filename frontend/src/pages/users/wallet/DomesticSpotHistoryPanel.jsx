import React, { useEffect, useState } from "react";
import api from "../../../api/axios";

const fmtDate = (d) => {
    if (!d) return "-";
    const dt = new Date(d);
    return dt.toLocaleString("vi-VN", { hour12: false });
};
const fmt6 = (n) => Number(n || 0).toFixed(6);
const fmtVND = (n) => Number(n || 0).toLocaleString("vi-VN");

function PageBtn({ disabled, active, children, onClick }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={[
                "h-9 min-w-9 px-3 inline-flex items-center justify-center text-sm border rounded-lg",
                active ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                disabled ? "opacity-40 cursor-not-allowed" : "",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

export default function DomesticSpotHistoryPanel({ className = "" }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const [side, setSide] = useState("");
    const [instrumentId, setInstrumentId] = useState("");
    const [instruments, setInstruments] = useState([]);

    // phân trang kiểu cursor
    const [page, setPage] = useState(1);
    const [cursors, setCursors] = useState([null]);
    const [hasMore, setHasMore] = useState(false);
    const [limit, setLimit] = useState(10); // <-- chọn hiển thị

    const loadPage = async (pageIdx, opts = {}) => {
        setLoading(true);
        try {
            const cursor = cursors[pageIdx - 1] || null;
            const params = {
                limit,
                ...(cursor ? { cursor } : {}),
                ...(opts.side ? { side: opts.side } : {}),
                ...(opts.instrument_id ? { instrument_id: opts.instrument_id } : {}),
            };
            const { data } = await api.get("/domestic-gold/spot/history", { params });
            const rows = data?.items || [];
            const next = data?.next_cursor || null;

            setItems(rows);
            setHasMore(!!next);

            if (next && cursors.length === pageIdx) {
                setCursors((prev) => [...prev, next]);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/domestic-gold/spot/daily-totals");
                setInstruments(data || []);
            } catch {
                setInstruments([]);
            }
        })();
    }, []);

    // đổi filter hoặc đổi limit -> reset về trang 1
    useEffect(() => {
        setPage(1);
        setCursors([null]);
        loadPage(1, {
            side: side || undefined,
            instrument_id: instrumentId ? Number(instrumentId) : undefined,
        });
    }, [side, instrumentId, limit]);

    const goToPage = (p) => {
        setPage(p);
        loadPage(p, {
            side: side || undefined,
            instrument_id: instrumentId ? Number(instrumentId) : undefined,
        });
    };

    return (
        <section className={`h-full flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
            <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center justify-between">
                <h1 className="text-[28px] font-semibold leading-tight">Lịch sử mua/bán vàng trong nước</h1>
                <div className="flex gap-3 items-center">
                    <select
                        value={instrumentId}
                        onChange={(e) => setInstrumentId(e.target.value)}
                        className="h-9 border rounded-lg px-2 text-sm"
                    >
                        <option value="">Tất cả sản phẩm</option>
                        {instruments.map((ins) => (
                            <option key={ins.instrument_id} value={ins.instrument_id}>
                                {ins.brand}
                            </option>
                        ))}
                    </select>
                    <select
                        value={side}
                        onChange={(e) => setSide(e.target.value)}
                        className="h-9 border rounded-lg px-2 text-sm"
                    >
                        <option value="">Tất cả</option>
                        <option value="buy">Mua</option>
                        <option value="sell">Bán</option>
                    </select>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {loading && items.length === 0 ? (
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
                                <th className="px-6 py-3 text-left w-44">Sản phẩm</th>
                                <th className="px-6 py-3 text-center w-20">Side</th>
                                <th className="px-6 py-3 text-right w-28">Số lượng (XAU)</th>
                                <th className="px-6 py-3 text-right w-28">Giá/VND</th>
                                <th className="px-6 py-3 text-right w-28">Tổng/VND</th>
                                <th className="px-6 py-3 text-right w-24">Phí</th>
                                <th className="px-6 py-3 text-right w-28">Thực nhận</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((it, idx) => (
                                <tr key={it.id} className={idx % 2 ? "bg-white" : "bg-gray-50/40"}>
                                    <td className="px-6 py-3 whitespace-nowrap font-mono font-semibold text-gray-900">
                                        #{it.id}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap">{fmtDate(it.ts)}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        {it.brand}
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                        <span
                                            className={
                                                it.side === "buy"
                                                    ? "px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs"
                                                    : "px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs"
                                            }
                                        >
                                            {it.side}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right tabular-nums">{fmt6(it.qty_xau)}</td>
                                    <td className="px-6 py-3 text-right tabular-nums">{fmtVND(it.price_used)}</td>
                                    <td className="px-6 py-3 text-right tabular-nums">{fmtVND(it.gross_vnd)}</td>
                                    <td className="px-6 py-3 text-right tabular-nums">{fmtVND(it.fee_vnd)}</td>
                                    <td className="px-6 py-3 text-right tabular-nums">{fmtVND(it.net_vnd)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 hidden sm:inline">Hiển thị</span>
                    <select
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className="h-9 rounded-lg border-gray-300 bg-white text-sm"
                    >
                        {[10, 20, 30, 50].map((v) => (
                            <option key={v} value={v}>
                                {v} dòng
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex gap-1 self-end sm:self-auto">
                    <PageBtn disabled={page === 1} onClick={() => goToPage(1)}>
                        «
                    </PageBtn>
                    <PageBtn disabled={page === 1} onClick={() => goToPage(page - 1)}>
                        ‹
                    </PageBtn>
                    <PageBtn active>{page}</PageBtn>
                    <PageBtn disabled={!hasMore} onClick={() => goToPage(page + 1)}>
                        ›
                    </PageBtn>
                </div>
            </div>
        </section>
    );
}
