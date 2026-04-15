// src/pages/admin/P2P/AdminP2PDisputes.jsx
import React, { useEffect, useRef, useState } from "react";
import api from "../../../api/axios";
import {
    FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight,
    FiSearch, FiCheckCircle, FiXCircle
} from "react-icons/fi";
import { FaSort, FaSortDown, FaSortUp } from "react-icons/fa";
import SuccessModal from "../../admin/components/SuccessModal";
import ErrorModal from "../../admin/components/ErrorModal";

const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

const fmtVND = (n) => Number(n || 0).toLocaleString("vi-VN");
const fmt6 = (n) => (n == null ? "-" : Number(n).toFixed(5));
const formatVNTime = (val) => {
    if (!val) return "-";
    const s = String(val);
    const dt = /Z$|[+\-]\d{2}:\d{2}$/.test(s) ? new Date(s) : new Date(s + "Z");
    return dt.toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
};

const statusMeta = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "waiting_payment") return { label: "Chờ thanh toán", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    if (v === "paid") return { label: "Đã thanh toán", cls: "bg-sky-50 text-sky-700 border-sky-200" };
    if (v === "confirmed") return { label: "Đã xác nhận", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    if (v === "disputed") return { label: "Tranh chấp", cls: "bg-red-50 text-red-700 border-red-200" };
    if (v === "completed") return { label: "Hoàn tất", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (v === "cancelled") return { label: "Đã hủy", cls: "bg-gray-100 text-gray-600 border-gray-200" };
    return { label: v || "Không rõ", cls: "bg-gray-50 text-gray-600 border-gray-200" };
};

export default function AdminP2PDisputes() {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const totalPages = Math.max(1, Math.ceil(total / size));

    const [status, setStatus] = useState("");
    const [q, setQ] = useState("");

    const [sortField, setSortField] = useState("created_at");
    const [sortOrder, setSortOrder] = useState("desc");

    const [successOpen, setSuccessOpen] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorOpen, setErrorOpen] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const showSuccess = (m) => { setSuccessMsg(m); setSuccessOpen(true); };
    const showError = (m) => { setErrorMsg(m); setErrorOpen(true); };

    const fetchList = async (p = page, s = size) => {
        setLoading(true);
        setErr("");
        try {
            const params = { page: p, size: s, sort_field: sortField, sort_order: sortOrder };
            if (status) params.status = status;
            if (q?.trim()) params.q = q.trim();

            const { data } = await api.get("/p2p/admin/trades", { params });
            setRows(Array.isArray(data?.items) ? data.items : []);
            setTotal(Number(data?.total || 0));
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Không tải được danh sách giao dịch.");
            setRows([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { setPage(1); }, [status, size, q, sortField, sortOrder]);
    useEffect(() => { fetchList(1, size); }, [status, size, q, sortField, sortOrder]);
    useEffect(() => { fetchList(page, size); }, [page]);

    const toggleSort = (f) => {
        if (sortField === f) setSortOrder(o => o === "asc" ? "desc" : "asc");
        else { setSortField(f); setSortOrder("asc"); }
    };
    const iconFor = (f) =>
        sortField !== f ? <FaSort className="inline ml-1 text-gray-400" /> :
            sortOrder === "asc" ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />;

    const pageRange = (cur, totalNum, d = 1) => {
        if (totalNum <= 7) return Array.from({ length: totalNum }, (_, i) => i + 1);
        const L = Math.max(2, cur - d), R = Math.min(totalNum - 1, cur + d);
        const arr = [1];
        if (L > 2) arr.push("…");
        for (let i = L; i <= R; i++) arr.push(i);
        if (R < totalNum - 1) arr.push("…");
        arr.push(totalNum);
        return arr;
    };

    const actForceComplete = async (id) => {
        try {
            await api.post(`/p2p/admin/trades/${id}/force-complete`);
            showSuccess(`Đã duyệt hoàn tất giao dịch #${id} (cộng vàng cho buyer).`);
            await fetchList();
        } catch (e) {
            showError(e?.response?.data?.detail || e?.message || "Không duyệt được.");
        }
    };

    const actForceCancel = async (id) => {
        try {
            await api.post(`/p2p/admin/trades/${id}/force-cancel`);
            showSuccess(`Đã hủy giao dịch #${id} (trả về seller).`);
            await fetchList();
        } catch (e) {
            showError(e?.response?.data?.detail || e?.message || "Không hủy được.");
        }
    };

    const wsRef = useRef(null);
    const retryRef = useRef(null);
    const pingRef = useRef(null);

    const upsert = (t) => {
        setRows(prev => {
            const a = Array.isArray(prev) ? [...prev] : [];
            const i = a.findIndex(x => x.id === t.id);
            if (i === -1) a.unshift(t);
            else {
                a[i] = {
                    ...a[i],
                    ...t,
                    transfer_note: t.transfer_note ?? a[i].transfer_note,
                    bank_info: t.bank_info ?? a[i].bank_info,
                };
            }
            return a;
        });
    };
    const removeIf = (id) => {
        setRows(prev => (Array.isArray(prev) ? prev.filter(x => x.id !== id) : prev));
    };

    useEffect(() => {
        let stopped = false;
        const open = () => {
            if (stopped) return;
            const token = encodeURIComponent(localStorage.getItem("access_token") || "");
            const url = `${WS_BASE}/ws/p2p/admin?token=${token}`;

            try {
                const cur = wsRef.current;
                if (cur && (cur.readyState === WebSocket.OPEN || cur.readyState === WebSocket.CONNECTING)) cur.close();
            } catch { }

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
                if (pingRef.current) clearInterval(pingRef.current);
                pingRef.current = setInterval(() => {
                    try {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: "ping" }));
                        }
                    } catch { }
                }, 30000);
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (!msg?.type) return;
                    const t = msg.trade;
                    if (!t) return;

                    if (status && t.status !== status) {
                        removeIf(t.id);
                        return;
                    }
                    upsert(t);
                } catch (e) {
                    console.error("Admin disputes WS parse:", e);
                }
            };

            ws.onclose = () => {
                if (stopped) return;
                if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
                retryRef.current = setTimeout(open, 1500);
            };
            ws.onerror = () => {
                try { ws.close(); } catch { }
            };
        };

        open();
        return () => {
            stopped = true;
            if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
            if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
            try {
                const cur = wsRef.current;
                if (cur && (cur.readyState === WebSocket.OPEN || cur.readyState === WebSocket.CONNECTING)) cur.close();
            } catch { }
        };
    }, [status]);

    const statusTabs = [
        ["", "Tất cả"],
        ["waiting_payment", "Chờ thanh toán"],
        ["paid", "Đã thanh toán"],
        ["disputed", "Tranh chấp"],
        ["completed", "Hoàn tất"],
        ["cancelled", "Đã hủy"],
    ];

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Xử lý tranh chấp P2P</h1>
                        <p className="text-sm text-slate-500">
                            Kiểm tra nội dung chuyển khoản, quyết định duyệt hoàn tất (cộng vàng cho buyer) hoặc hủy (trả về seller).
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-full bg-slate-100 p-1">
                            {statusTabs.map(([v, label]) => (
                                <button
                                    key={`st-${v || "all"}`}
                                    onClick={() => setStatus(v)}
                                    className={
                                        "px-3 h-8 rounded-full text-xs font-medium transition " +
                                        (status === v
                                            ? "bg-slate-900 text-white shadow-sm"
                                            : "text-slate-700 hover:bg-white")
                                    }
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="relative w-64">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Tìm trade_code / buyer_id / seller_id / nội dung CK"
                                className="h-9 w-full pl-9 pr-3 rounded-full border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-slate-800">
                            <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur border-b text-xs uppercase text-slate-600">
                                <tr>
                                    <th className="px-6 py-3 text-left">Trade</th>
                                    <th className="px-6 py-3 text-left">Buyer / Seller</th>
                                    <th className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => toggleSort("total_amount_vnd")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            Tổng tiền {iconFor("total_amount_vnd")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-center w-44">Số lượng / Phí</th>
                                    <th className="px-6 py-3 text-left w-40">
                                        <button
                                            onClick={() => toggleSort("created_at")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            Ngày tạo {iconFor("created_at")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left w-56">Nội dung giao dịch</th>
                                    <th className="px-6 py-3 text-right w-56">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="p-10 text-center text-slate-500">
                                            Đang tải…
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-12 text-center text-slate-400">
                                            Không có giao dịch
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map(r => {
const noteText = r?.bank_info?.transfer_note || r?.transfer_note || r?.complaint || r?.trade_code || "-";

                                        const canAct = !["completed", "cancelled"].includes(
                                            String(r.status || "").toLowerCase()
                                        );

                                        const sm = statusMeta(r.status);
                                        const isDisputed = String(r.status || "").toLowerCase() === "disputed";

                                        return (
                                            <tr
                                                key={r.id}
                                                className={
                                                    "border-b last:border-0 transition-colors " +
                                                    (isDisputed
                                                        ? "bg-red-50/40 hover:bg-red-50/80"
                                                        : "hover:bg-slate-50/70")
                                                }
                                            >
                                                <td className="px-6 py-3 align-top">
                                                    <div className="font-semibold text-slate-900">{r.trade_code}</div>
                                                    <div className="text-xs text-slate-500">Post #{r.post_id}</div>
                                                    <span
                                                        className={
                                                            "inline-flex items-center mt-2 px-2 py-0.5 rounded-full border text-[11px] font-medium " +
                                                            sm.cls
                                                        }
                                                    >
                                                        {sm.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 align-top">
                                                    <div className="text-slate-800">
                                                        <span className="font-medium">Buyer:</span>{" "}
                                                        {r.buyer_name || r.buyer_id}
                                                    </div>
                                                    <div className="text-slate-800">
                                                        <span className="font-medium">Seller:</span>{" "}
                                                        {r.seller_name || r.seller_id}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-right tabular-nums align-top">
                                                    <div className="font-semibold">
                                                        {fmtVND(r.total_amount_vnd)} VND
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-center align-top">
                                                    <div className="tabular-nums font-medium">
                                                        {fmt6(r.quantity)} XAU
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        Phí: {fmtVND(r.fee_vnd)} VND
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 whitespace-nowrap align-top">
                                                    {formatVNTime(r.created_at)}
                                                </td>
                                                <td className="px-6 py-3 text-sm text-slate-700 align-top">
                                                    <div className="max-w-[40ch] line-clamp-3">
                                                        {noteText}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 align-top">
                                                    {canAct ? (
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => actForceComplete(r.id)}
                                                                className="inline-flex items-center gap-1 px-3 h-9 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                                                                title="Duyệt hoàn tất (cộng vàng cho buyer)"
                                                            >
                                                                <FiCheckCircle className="text-sm" />
                                                                Duyệt buyer
                                                            </button>
                                                            <button
                                                                onClick={() => actForceCancel(r.id)}
                                                                className="inline-flex items-center gap-1 px-3 h-9 rounded-lg border border-red-300 text-red-700 text-xs font-semibold bg-white hover:bg-red-50"
                                                                title="Hủy giao dịch (trả về seller)"
                                                            >
                                                                <FiXCircle className="text-sm" />
                                                                Hủy giao dịch
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-right text-xs text-slate-500 italic">
                                                            Đã {String(r.status).toLowerCase()}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-4 py-4 border-t bg-slate-50">
                            <div className="flex items-center gap-3 text-sm text-slate-600">
                                <span>
                                    Trang <span className="font-semibold">{page}</span> / {totalPages}
                                </span>
                                <div className="hidden sm:flex items-center gap-2">
                                    <span>Hiển thị</span>
                                    <select
                                        value={size}
                                        onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
                                        className="border rounded-lg px-2 py-1 bg-white text-sm"
                                    >
                                        {[10, 20, 30, 50].map(n => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                    <span>bản ghi/trang</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage(1)}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-40"
                                >
                                    <FiChevronsLeft />
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-40"
                                >
                                    <FiChevronLeft />
                                </button>
                                {pageRange(page, totalPages, 1).map((p, i) =>
                                    p === "…" ? (
                                        <span key={`dots-${i}`} className="px-2 text-slate-500">
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p)}
                                            className={
                                                "h-9 px-3 rounded-lg border text-sm font-medium transition " +
                                                (page === p
                                                    ? "bg-slate-900 text-white border-slate-900"
                                                    : "bg-white text-slate-700 hover:bg-slate-100")
                                            }
                                        >
                                            {p}
                                        </button>
                                    )
                                )}
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-40"
                                >
                                    <FiChevronRight />
                                </button>
                                <button
                                    onClick={() => setPage(totalPages)}
                                    disabled={page === totalPages}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-40"
                                >
                                    <FiChevronsRight />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {err && (
                    <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                        {err}
                    </div>
                )}
            </div>

            <SuccessModal open={successOpen} message={successMsg} onOk={() => setSuccessOpen(false)} />
            <ErrorModal open={errorOpen} message={errorMsg} onClose={() => setErrorOpen(false)} />
        </div>
    );
}
