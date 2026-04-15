import React, { useEffect, useMemo, useState } from "react";
import api from "../../../api/axios";
import {
    FiChevronLeft,
    FiChevronRight,
    FiChevronsLeft,
    FiChevronsRight,
    FiCheckCircle,
    FiXCircle,
    FiAlertTriangle,
} from "react-icons/fi";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import SuccessModal from "../../admin/components/SuccessModal";
import RejectModal from "./RejectModal";

const fmtVND = (n) => Number(n || 0).toLocaleString("vi-VN");
const fmt6 = (n) => (n == null ? "-" : Number(n).toFixed(6));
const fmtDT = (d) => (d ? new Date(d).toLocaleString("vi-VN", { hour12: false }) : "-");

const StatusBadge = ({ status }) => {
    const map = { pending: "Chờ xử lý", approved: "Đã duyệt", credited: "Đã ghi có", rejected: "Từ chối" };
    const cls =
        status === "approved" || status === "credited"
            ? "bg-green-50 text-green-700 ring-1 ring-green-200"
            : status === "rejected"
                ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                : "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{map[status] || status}</span>;
};

const pageRange = (cur, total, d = 1) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const L = Math.max(2, cur - d),
        R = Math.min(total - 1, cur + d);
    const arr = [1];
    if (L > 2) arr.push("…");
    for (let i = L; i <= R; i++) arr.push(i);
    if (R < total - 1) arr.push("…");
    arr.push(total);
    return arr;
};

function ConfirmModal({ open, title = "Xác nhận duyệt nạp", message, onCancel, onConfirm, loading }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
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
                        {loading ? "Đang duyệt..." : "Xác nhận"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function DepositForm() {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [page, setPage] = useState(1);
    const [size, setSize] = useState(10);
    const totalPages = Math.max(1, Math.ceil(total / size));

    const [status, setStatus] = useState("");
    const [sortField, setSortField] = useState("created_at");
    const [sortOrder, setSortOrder] = useState("desc");

    // NEW: thanh tìm kiếm theo deposit_code
    const [searchCode, setSearchCode] = useState("");

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmId, setConfirmId] = useState(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectId, setRejectId] = useState(null);
    const [rejectLoading, setRejectLoading] = useState(false);

    const [showSuccess, setShowSuccess] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");

    const iconFor = (f) =>
        sortField !== f ? (
            <FaSort className="inline ml-1 text-gray-400" />
        ) : sortOrder === "asc" ? (
            <FaSortUp className="inline ml-1" />
        ) : (
            <FaSortDown className="inline ml-1" />
        );

    const toggleSort = (f) => {
        if (sortField === f) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        else {
            setSortField(f);
            setSortOrder("asc");
        }
        setPage(1);
    };

    const fetchList = async (p, s, st, code) => {
        setLoading(true);
        setErr("");
        try {
            const params = { page: p, size: s };
            if (st) params.status = st;
            if (code) params.deposit_code = code; // truyền mã nạp vào API
            const { data } = await api.get("/deposit/list", { params });
            setRows(data?.items || []);
            setTotal(Number(data?.total || 0));
        } catch (e) {
            setErr(e?.response?.data?.detail || "Không gọi được /deposit/list");
        } finally {
            setLoading(false);
        }
    };

    // đổi filter => về trang 1
    useEffect(() => {
        setPage(1);
    }, [status, size, searchCode]);

    // load data mỗi khi page/size/status/searchCode đổi
    useEffect(() => {
        fetchList(page, size, status, searchCode.trim());
    }, [page, size, status, searchCode]);

    const sorted = useMemo(() => {
        const a = [...rows];
        a.sort((x, y) => {
            const xv = x[sortField],
                yv = y[sortField];
            if (xv == null && yv == null) return 0;
            if (xv == null) return 1;
            if (yv == null) return -1;
            if (typeof xv === "number" && typeof yv === "number")
                return sortOrder === "asc" ? xv - yv : yv - xv;
            const xs = String(xv),
                ys = String(yv);
            return sortOrder === "asc" ? xs.localeCompare(ys) : ys.localeCompare(xs);
        });
        return a;
    }, [rows, sortField, sortOrder]);

    const onClickApprove = (id) => {
        setConfirmId(id);
        setConfirmOpen(true);
    };
    const onClickReject = (id) => {
        setRejectId(id);
        setRejectOpen(true);
    };

    const doApprove = async () => {
        if (!confirmId) return;
        setConfirmLoading(true);
        try {
            await api.post(`/deposit/${confirmId}/approve`);
            setConfirmOpen(false);
            setSuccessMsg("Duyệt thành công. USDT đã được ghi có vào ví Funding.");
            setShowSuccess(true);
            await fetchList(page, size, status, searchCode.trim());
        } catch (e) {
            setConfirmOpen(false);
            setErr(e?.response?.data?.detail || "Duyệt thất bại");
        } finally {
            setConfirmLoading(false);
        }
    };

    const doReject = async (reason) => {
        if (!rejectId) return;
        setRejectLoading(true);
        try {
            await api.post(`/deposit/${rejectId}/reject`, {
                rejected_reason: reason?.trim() || null,
            });
            setRejectOpen(false);
            setSuccessMsg("Hủy giao dịch thành công.");
            setShowSuccess(true);
            await fetchList(page, size, status, searchCode.trim());
        } catch (e) {
            setRejectOpen(false);
            setErr(e?.response?.data?.detail || "Hủy thất bại");
        } finally {
            setRejectLoading(false);
        }
    };

    const handleSuccessOk = () => setShowSuccess(false);

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Quản lý nạp tiền</h1>
                        <p className="text-sm text-gray-500">Quản lý danh sách nạp tiền người dùng</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* ô tìm kiếm mã nạp */}
                        <input
                            value={searchCode}
                            onChange={(e) => setSearchCode(e.target.value)}
                            placeholder="Tìm theo mã nạp..."
                            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm"
                        />
                        {[
                            ["", "Tất cả"],
                            ["pending", "Chờ xử lý"],
                            ["approved", "Đã duyệt"],
                            ["credited", "Đã ghi có"],
                            ["rejected", "Từ chối"],
                        ].map(([v, label]) => (
                            <button
                                key={v || "all"}
                                onClick={() => setStatus(v)}
                                className={`h-9 px-3 rounded-lg text-sm border ${status === v
                                        ? "bg-gray-900 text-white border-gray-900"
                                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-gray-800">
                            <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b text-xs uppercase text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 text-left">
                                        <button
                                            onClick={() => toggleSort("deposit_code")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            Mã nạp {iconFor("deposit_code")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left">Người duyệt</th>
                                    <th className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => toggleSort("amount_money")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            VND {iconFor("amount_money")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-right">USDT</th>
                                    <th className="px-6 py-3 text-left">
                                        <button
                                            onClick={() => toggleSort("created_at")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            Ngày tạo {iconFor("created_at")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left">Ngày duyệt</th>
                                    <th className="px-6 py-3 text-left">Lý do hủy</th>
                                    <th className="px-6 py-3 text-center">Trạng thái</th>
                                    <th className="px-6 py-3 text-center w-40">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={11} className="p-8 text-center text-gray-500">
                                            Đang tải…
                                        </td>
                                    </tr>
                                ) : sorted.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="p-12 text-center text-gray-400">
                                            Không có dữ liệu
                                        </td>
                                    </tr>
                                ) : (
                                    sorted.map((d) => {
                                        const canApprove = d.status === "pending";
                                        const canReject = d.status === "pending";
                                        return (
                                            <tr key={d.id} className="border-b hover:bg-gray-50/60">
                                                <td className="px-6 py-3 font-mono">{d.deposit_code || d.code}</td>
                                                <td className="px-6 py-3">
                                                    {d.approved_by_name || (d.approved_by ? `${d.approved_by}` : "-")}
                                                </td>
                                                <td className="px-6 py-3 text-right tabular-nums">{fmtVND(d.amount_money)}</td>
                                                <td className="px-6 py-3 text-right tabular-nums">{fmt6(d.usdt_amount)}</td>
                                                <td className="px-6 py-3 whitespace-nowrap">{fmtDT(d.created_at)}</td>
                                                <td className="px-6 py-3 whitespace-nowrap">
                                                    {d.status === "pending" ? "-" : fmtDT(d.updated_at)}
                                                </td>
                                                <td className="px-6 py-3">{d.rejected_reason || "-"}</td>
                                                <td className="px-6 py-3 text-center">
                                                    <StatusBadge status={d.status} />
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            title="Duyệt"
                                                            onClick={() => onClickApprove(d.id)}
                                                            disabled={!canApprove}
                                                            className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border transition ${canApprove
                                                                    ? "border-green-300 text-green-700 hover:bg-green-50"
                                                                    : "border-gray-200 text-gray-300 cursor-not-allowed"
                                                                }`}
                                                        >
                                                            <FiCheckCircle className="text-[18px]" />
                                                        </button>
                                                        <button
                                                            title="Hủy"
                                                            onClick={() => onClickReject(d.id)}
                                                            disabled={!canReject}
                                                            className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border transition ${canReject
                                                                    ? "border-red-300 text-red-600 hover:bg-red-50"
                                                                    : "border-gray-200 text-gray-300 cursor-not-allowed"
                                                                }`}
                                                        >
                                                            <FiXCircle className="text-[18px]" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {total > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-4 py-4 bg-gray-50 border-t">
                            <select
                                value={size}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setSize(v);
                                    setPage(1);
                                }}
                                className="h-9 rounded-lg border border-gray-300 bg-white text-sm px-2"
                            >
                                {[10, 20, 30, 50].map((n) => (
                                    <option key={n} value={n}>
                                        {n}/trang
                                    </option>
                                ))}
                            </select>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage(1)}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
                                >
                                    <FiChevronsLeft />
                                </button>
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
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
                                            className={`h-9 px-3 rounded-lg border text-sm font-medium ${page === p
                                                    ? "bg-gray-900 text-white border-gray-900"
                                                    : "bg-white text-gray-700 hover:bg-gray-100"
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}
                                <button
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
                                >
                                    <FiChevronRight />
                                </button>
                                <button
                                    onClick={() => setPage(totalPages)}
                                    disabled={page === totalPages}
                                    className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-40"
                                >
                                    <FiChevronsRight />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <SuccessModal open={showSuccess} message={successMsg} onOk={handleSuccessOk} />

                <ConfirmModal
                    open={confirmOpen}
                    title="Xác nhận duyệt nạp"
                    message="Bạn có chắc muốn duyệt yêu cầu này? Kiểm tra mã giao dịch và số tiền trước khi xác nhận."
                    onCancel={() => setConfirmOpen(false)}
                    onConfirm={doApprove}
                    loading={confirmLoading}
                />

                <RejectModal
                    open={rejectOpen}
                    onClose={() => setRejectOpen(false)}
                    onSubmit={doReject}
                    loading={rejectLoading}
                />

                {err && <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700">{err}</div>}
            </div>
        </div>
    );
}
