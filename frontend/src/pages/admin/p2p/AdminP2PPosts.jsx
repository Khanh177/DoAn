// src/pages/admin/P2P/AdminP2PPosts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/axios";
import {
    FiChevronLeft,
    FiChevronRight,
    FiChevronsLeft,
    FiChevronsRight,
    FiEdit2,
    FiTrash2,
    FiEyeOff,
    FiEye,
    FiSearch,
    FiAlertTriangle,
} from "react-icons/fi";
import { FaSort, FaSortDown, FaSortUp } from "react-icons/fa";
import SuccessModal from "../../admin/components/SuccessModal";
import ErrorModal from "../../admin/components/ErrorModal";

// =================== Small inline confirm modal ===================
function ConfirmModal({ open, title, message, onCancel, onConfirm, loading }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[100] bg-black/40 grid place-items-center p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
                <div className="px-6 pt-6 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-yellow-100 text-yellow-600 grid place-items-center mb-3">
                        <FiAlertTriangle className="text-xl" />
                    </div>
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className="text-gray-600 mt-1">{message}</p>
                </div>
                <div className="px-6 py-4 flex justify-end gap-3 bg-gray-50">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
                    >
                        {loading ? "Đang xử lý..." : "Xác nhận"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =================== Main page ===================
const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

export default function AdminP2PPosts() {
    // Data + paging/sort/filter
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const totalPages = Math.max(1, Math.ceil(total / size));

    const [tradeType, setTradeType] = useState(""); // "", "buy", "sell"
    const [status, setStatus] = useState(""); // "", "active", "inactive", "completed"
    const [q, setQ] = useState("");

    const [sortField, setSortField] = useState("created_at");
    const [sortOrder, setSortOrder] = useState("desc"); // asc | desc

    // Actions state
    const [successOpen, setSuccessOpen] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorOpen, setErrorOpen] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [confirmCfg, setConfirmCfg] = useState({ type: null, id: null, nextStatus: null });

    // ------------- helpers -------------
    const showSuccess = (m) => {
        setSuccessMsg(m);
        setSuccessOpen(true);
    };
    const showError = (m) => {
        setErrorMsg(m);
        setErrorOpen(true);
    };
    const extractErrorMessage = (err, fallback = "Có lỗi xảy ra.") => {
        const detail = err?.response?.data?.detail ?? err?.detail;
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
        if (detail && typeof detail === "object") {
            try { return JSON.stringify(detail); } catch { return fallback; }
        }
        return err?.message || fallback;
    };

    const formatVNTime = (utcString) => {
        if (!utcString) return "-";

        // Bước 1: Tạo Date từ chuỗi (server trả về là giờ UTC)
        const utcDate = new Date(utcString);

        // Bước 2: CỘNG THÊM 7 TIẾNG = GIỜ VIỆT NAM (GMT+7)
        const vnDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);

        // Bước 3: Format đẹp kiểu Việt Nam
        return vnDate.toLocaleString("vi-VN", {
            hour12: false,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    // ------------- fetch list -------------
    const fetchList = async (p = page, s = size, tt = tradeType, st = status, query = q, sf = sortField, so = sortOrder) => {
        setLoading(true);
        setErr("");
        try {
            const params = { page: p, size: s };
            if (tt) params.trade_type = tt;
            if (st) params.status = st;
            if (query?.trim()) params.q = query.trim();
            if (sf) params.sort_field = sf;
            if (so) params.sort_order = so;

            const { data } = await api.get("/p2p/admin/posts", { params });
            setRows(Array.isArray(data?.items) ? data.items : []);
            setTotal(Number(data?.total || 0));
        } catch (e) {
            setErr(extractErrorMessage(e, "Không tải được danh sách bài P2P."));
            setRows([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    // đổi filter → về trang 1, sau đó load
    useEffect(() => {
        setPage(1);
    }, [tradeType, status, size, q, sortField, sortOrder]);

    useEffect(() => {
        fetchList(1, size, tradeType, status, q, sortField, sortOrder);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tradeType, status, size, q, sortField, sortOrder]);

    useEffect(() => {
        fetchList(page, size, tradeType, status, q, sortField, sortOrder);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    // ------------- sorting -------------
    const toggleSort = (f) => {
        if (sortField === f) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        else {
            setSortField(f);
            setSortOrder("asc");
        }
    };
    const iconFor = (f) =>
        sortField !== f ? (
            <FaSort className="inline ml-1 text-gray-400" />
        ) : sortOrder === "asc" ? (
            <FaSortUp className="inline ml-1" />
        ) : (
            <FaSortDown className="inline ml-1" />
        );

    // ------------- pager ui like NewsForm -------------
    const pageRange = (cur, totalNum, d = 1) => {
        if (totalNum <= 7) return Array.from({ length: totalNum }, (_, i) => i + 1);
        const L = Math.max(2, cur - d);
        const R = Math.min(totalNum - 1, cur + d);
        const arr = [1];
        if (L > 2) arr.push("…");
        for (let i = L; i <= R; i++) arr.push(i);
        if (R < totalNum - 1) arr.push("…");
        arr.push(totalNum);
        return arr;
    };

    // ------------- actions -------------
    const askToggleStatus = (row) => {
        const next = row.status === "active" ? "inactive" : "active";
        setConfirmCfg({
            type: "toggle",
            id: row.id,
            nextStatus: next,
        });
        setConfirmOpen(true);
    };

    const askDelete = (row) => {
        setConfirmCfg({ type: "delete", id: row.id, nextStatus: null });
        setConfirmOpen(true);
    };

    // AdminP2PPosts.jsx
    const doConfirm = async () => {
        const { type, id, nextStatus } = confirmCfg;
        if (!type || !id) return;
        setConfirmLoading(true);
        try {
            if (type === "toggle") {
                if (nextStatus === "inactive") {
                    await api.patch(`/p2p/admin/posts/${id}/block`);
                    showSuccess("Đã chặn bài đăng.");
                } else {
                    await api.patch(`/p2p/admin/posts/${id}/unblock`);
                    showSuccess("Đã mở chặn bài đăng.");
                }
            } else if (type === "delete") {
                await api.delete(`/p2p/admin/posts/${id}`);
                showSuccess(`Đã xóa bài #${id}.`);
            }
            await fetchList();
        } catch (e) {
            showError(extractErrorMessage(e, "Xử lý thất bại."));
        } finally {
            setConfirmLoading(false);
            setConfirmOpen(false);
        }
    };

    // ------------- realtime WS (public) -------------
    const wsRef = useRef(null);
    const retryTimerRef = useRef(null);
    const pingTimerRef = useRef(null);

    function upsertPostToRows(next) {
        // Nếu không khớp filter hiện tại: loại bỏ/không thêm
        const notMatchTradeType = tradeType && next.trade_type !== tradeType;
        const notMatchStatus = status && next.status !== status;
        if (notMatchTradeType || notMatchStatus) {
            setRows((prev) => prev.filter((x) => x.id !== next.id));
            return;
        }
        setRows((prev) => {
            const arr = Array.isArray(prev) ? prev : [];
            const idx = arr.findIndex((r) => r.id === next.id);
            if (idx === -1) return [next, ...arr];
            const cp = [...arr];
            cp[idx] = { ...cp[idx], ...next };
            return cp;
        });
    }
    function removePostFromRows(id) {
        setRows((prev) => (Array.isArray(prev) ? prev.filter((r) => r.id !== id) : prev));
    }

    useEffect(() => {
        let stopped = false;

        const openWS = () => {
            if (stopped) return;
            const token = encodeURIComponent(localStorage.getItem("access_token") || "");
            const url = `${WS_BASE}/ws/p2p/public?token=${token}`;

            try {
                const cur = wsRef.current;
                if (cur && (cur.readyState === WebSocket.OPEN || cur.readyState === WebSocket.CONNECTING)) {
                    cur.close();
                }
            } catch { }

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (retryTimerRef.current) {
                    clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = null;
                }
                if (pingTimerRef.current) clearInterval(pingTimerRef.current);
                pingTimerRef.current = setInterval(() => {
                    try {
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
                    } catch { }
                }, 30000);
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === "p2p_post_updated" && msg.post) {
                        const p = msg.post;
                        const mapped = {
                            id: p.id,
                            user_id: p.user_id,
                            trade_type: p.trade_type,
                            gold_type: p.gold_type,
                            price_vnd: Number(p.price_vnd ?? 0),
                            min_amount_vnd: Number(p.min_amount_vnd ?? 0),
                            max_amount_vnd: Number(p.max_amount_vnd ?? 0),
                            total_quantity: Number(p.total_quantity ?? 0),
                            remaining_quantity: Number(p.remaining_quantity ?? p.total_quantity ?? 0),
                            allow_partial_fill: p.allow_partial_fill,
                            bank_name: p.bank_name,
                            bank_account_number: p.bank_account_number,
                            bank_account_name: p.bank_account_name,
                            transfer_note_template: p.transfer_note_template,
                            status: p.status,
                            created_at: p.created_at,
                            updated_at: p.updated_at,
                            full_name: p.full_name,
                            available_gold: p.available_gold,
                        };
                        upsertPostToRows(mapped);
                    }
                    if (msg.type === "p2p_post_deleted" && msg.id) {
                        removePostFromRows(msg.id);
                    }
                } catch (e) {
                    console.error("Admin P2P WS parse error:", e);
                }
            };

            ws.onclose = () => {
                if (stopped) return;
                if (pingTimerRef.current) {
                    clearInterval(pingTimerRef.current);
                    pingTimerRef.current = null;
                }
                retryTimerRef.current = setTimeout(openWS, 1500);
            };

            ws.onerror = () => {
                try { ws.close(); } catch { }
            };
        };

        openWS();

        return () => {
            stopped = true;
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            if (pingTimerRef.current) {
                clearInterval(pingTimerRef.current);
                pingTimerRef.current = null;
            }
            try {
                const cur = wsRef.current;
                if (cur && (cur.readyState === WebSocket.OPEN || cur.readyState === WebSocket.CONNECTING)) {
                    cur.close();
                }
            } catch { }
        };
    }, [tradeType, status]); // khi đổi filter, vẫn giữ WS nhưng logic upsert sẽ lọc theo filter hiện tại

    // ------------- render -------------
    const fmtVND = (n) => Number(n || 0).toLocaleString("vi-VN");
    const fmt6 = (n) => (n == null ? "-" : Number(n).toFixed(5));
    const fmtDT = (d) => (d ? new Date(d).toLocaleString("vi-VN", { hour12: false }) : "-");

    const TradeTypeBadge = ({ t }) => {
        const isBuy = t === "buy";
        const cls = isBuy ? "bg-green-50 text-green-700 ring-green-200" : "bg-red-50 text-red-700 ring-red-200";
        return <span className={`px-2 py-0.5 rounded-full text-xs ring-1 ${cls}`}>{isBuy ? "Mua" : "Bán"}</span>;
    };

    const StatusBadge = ({ s }) => {
        const map = {
            active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
            inactive: "bg-gray-100 text-gray-600 ring-gray-300",
            completed: "bg-blue-50 text-blue-700 ring-blue-200",
        };
        const label = s === "active" ? "Đang hiển thị" : s === "inactive" ? "Đang ẩn" : "Hoàn tất";
        return <span className={`px-2 py-0.5 rounded-full text-xs ring-1 ${map[s] || "bg-gray-50 text-gray-600 ring-gray-200"}`}>{label}</span>;
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Quản lý bài P2P</h1>
                        <p className="text-sm text-gray-500">Xem, chặn/mở chặn, và xóa bài đăng P2P của người dùng</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* trade type */}
                        {[
                            ["", "Tất cả"],
                            ["buy", "Mua"],
                            ["sell", "Bán"],
                        ].map(([v, label]) => (
                            <button
                                key={`tt-${v || "all"}`}
                                onClick={() => setTradeType(v)}
                                className={`h-9 px-3 rounded-lg text-sm border ${tradeType === v
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                        {/* status */}
                        {[
                            ["", "Trạng thái: Tất cả"],
                            ["active", "Đang hiển thị"],
                            ["inactive", "Đang ẩn"],
                            ["completed", "Hoàn tất"],
                        ].map(([v, label]) => (
                            <button
                                key={`st-${v || "all"}`}
                                onClick={() => setStatus(v)}
                                className={`h-9 px-3 rounded-lg text-sm border ${status === v
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                        {/* search */}
                        <div className="relative">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Tìm ID, tên người đăng, STK..."
                                className="h-9 pl-9 pr-3 rounded-lg border border-gray-300 bg-white text-sm"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-gray-800">
                            <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b text-xs uppercase text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 text-left w-20">
                                        <button onClick={() => toggleSort("id")} className="inline-flex items-center gap-1 font-semibold">
                                            ID {iconFor("id")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left">Người đăng</th>
                                    <th className="px-6 py-3 text-center w-24">Loại</th>
                                    <th className="px-6 py-3 text-right">
                                        <button onClick={() => toggleSort("price_vnd")} className="inline-flex items-center gap-1 font-semibold">
                                            Giá (VND) {iconFor("price_vnd")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-center w-44">Khả dụng / Giới hạn</th>
                                    <th className="px-6 py-3 text-left w-36">
                                        <button onClick={() => toggleSort("created_at")} className="inline-flex items-center gap-1 font-semibold">
                                            Ngày tạo {iconFor("created_at")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-center w-32">Trạng thái</th>
                                    <th className="px-6 py-3 text-right w-44">Hành động</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-gray-500">
                                            Đang tải…
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-12 text-center text-gray-400">
                                            Không có dữ liệu
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={r.id} className="border-b hover:bg-gray-50/60">
                                            <td className="px-6 py-3 font-semibold text-gray-700 tabular-nums">#{r.id}</td>
                                            <td className="px-6 py-3">
                                                <div className="font-medium">{r.full_name || "-"}</div>
                                                <div className="text-xs text-gray-500">UID: {r.user_id}</div>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <TradeTypeBadge t={r.trade_type} />
                                            </td>
                                            <td className="px-6 py-3 text-right tabular-nums">{fmtVND(r.price_vnd)}</td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="tabular-nums">{fmt6(r.remaining_quantity ?? r.total_quantity)} / {fmt6(r.total_quantity)} XAU</div>
                                                <div className="text-xs text-gray-500">
                                                    {fmtVND(r.min_amount_vnd)} – {fmtVND(r.max_amount_vnd)} VND
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap">
                                                {formatVNTime(r.created_at)}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <StatusBadge s={r.status} />
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="flex justify-end gap-2">
                                                    {/* Toggle status */}
                                                    <button
                                                        onClick={() => askToggleStatus(r)}
                                                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-600 hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-700 transition"
                                                        title={r.status === "active" ? "Chặn bài" : "Mở chặn"}
                                                    >
                                                        {r.status === "active" ? <FiEyeOff className="text-[18px]" /> : <FiEye className="text-[18px]" />}
                                                    </button>
                                                    {/* Xóa */}
                                                    <button
                                                        onClick={() => askDelete(r)}
                                                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition"
                                                        title="Xóa"
                                                    >
                                                        <FiTrash2 className="text-[18px]" />
                                                    </button>
                                                    {/* (Optional) Edit tại admin nếu cần
                          <button
                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition"
                            title="Sửa"
                          >
                            <FiEdit2 className="text-[18px]" />
                          </button>
                          */}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {total > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-4 py-4 bg-gray-50 border-t">
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <span>
                                    Trang <span className="font-semibold">{page}</span> / {totalPages}
                                </span>
                                <div className="hidden sm:flex items-center gap-2">
                                    <span>Hiển thị</span>
                                    <select
                                        value={size}
                                        onChange={(e) => {
                                            setSize(Number(e.target.value));
                                            setPage(1);
                                        }}
                                        className="border rounded-lg px-2 py-1 bg-white"
                                    >
                                        {[10, 20, 30, 50].map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                    <span>bài/trang</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage(1)}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
                                    aria-label="Trang đầu"
                                >
                                    <FiChevronsLeft />
                                </button>
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
                                    aria-label="Trang trước"
                                >
                                    <FiChevronLeft />
                                </button>

                                {pageRange(page, totalPages, 1).map((p, i) =>
                                    p === "…" ? (
                                        <span key={`dots-${i}`} className="px-2 text-gray-500">
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p)}
                                            className={`h-9 px-3 rounded-lg border text-sm font-medium transition ${page === p ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 hover:bg-gray-100"
                                                }`}
                                            aria-current={page === p ? "page" : undefined}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}

                                <button
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
                                    aria-label="Trang sau"
                                >
                                    <FiChevronRight />
                                </button>
                                <button
                                    onClick={() => setPage(totalPages)}
                                    disabled={page === totalPages}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
                                    aria-label="Trang cuối"
                                >
                                    <FiChevronsRight />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {err && <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700">{err}</div>}
            </div>

            <SuccessModal open={successOpen} message={successMsg} onOk={() => setSuccessOpen(false)} />
            <ErrorModal open={errorOpen} message={errorMsg} onClose={() => setErrorOpen(false)} />

            <ConfirmModal
                open={confirmOpen}
                title={confirmCfg.type === "delete" ? "Xóa bài P2P" : confirmCfg.nextStatus === "inactive" ? "Chặn bài P2P" : "Mở chặn bài P2P"}
                message={
                    confirmCfg.type === "delete"
                        ? `Bạn chắc chắn muốn xóa bài #${confirmCfg.id}?`
                        : confirmCfg.nextStatus === "inactive"
                            ? `Ẩn bài #${confirmCfg.id} khỏi danh sách công khai?`
                            : `Hiển thị lại bài #${confirmCfg.id} lên danh sách công khai?`
                }
                onCancel={() => setConfirmOpen(false)}
                onConfirm={doConfirm}
                loading={confirmLoading}
            />
        </div>
    );
}
