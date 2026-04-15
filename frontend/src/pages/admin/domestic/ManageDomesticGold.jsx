// src/pages/admin/domestic/ManageDomesticGold.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../../../api/axios";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import {
    FiEdit2,
    FiTrash2,
    FiPlus,
    FiChevronLeft,
    FiChevronRight,
    FiChevronsLeft,
    FiChevronsRight,
} from "react-icons/fi";
import BulkPriceForm from "./BulkPriceForm";
import PriceAddEditForm from "./PriceAddEditForm";
import SuccessModal from "../../admin/components/SuccessModal";
import ErrorModal from "../../admin/components/ErrorModal";

const fmtVND = (n) => Number(n || 0).toLocaleString("vi-VN");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("vi-VN", { hour12: false }) : "-");

export default function ManageDomesticGold() {
    const [rows, setRows] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [sortField, setSortField] = useState("as_of");
    const [sortOrder, setSortOrder] = useState("desc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [filterInstrumentId, setFilterInstrumentId] = useState("");
    const [filterDate, setFilterDate] = useState("");

    const [showBulk, setShowBulk] = useState(false);
    const [showSingle, setShowSingle] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    const [showSuccess, setShowSuccess] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [showErrModal, setShowErrModal] = useState(false);
    const [errMsg, setErrMsg] = useState("");

    const fetchInstruments = async () => {
        const { data } = await api.get("/domestic-gold/instruments");
        setInstruments(Array.isArray(data) ? data : []);
    };

    const fetchPrices = async () => {
        setLoading(true);
        setError("");
        try {
            const params = {};
            if (filterInstrumentId) params.instrument_id = Number(filterInstrumentId);
            if (filterDate) params.d = filterDate;
            const { data } = await api.get("/domestic-gold/prices", { params });
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || "Lỗi tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInstruments();
    }, []);
    useEffect(() => {
        fetchPrices();
    }, [filterInstrumentId, filterDate]);

    const toggleSort = (field) => {
        if (sortField === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        else {
            setSortField(field);
            setSortOrder("asc");
        }
        setPage(1);
    };
    const iconFor = (field) =>
        sortField !== field ? (
            <FaSort className="inline ml-1 text-gray-400" />
        ) : sortOrder === "asc" ? (
            <FaSortUp className="inline ml-1" />
        ) : (
            <FaSortDown className="inline ml-1" />
        );

    const sorted = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const av = a[sortField],
                bv = b[sortField];
            if (sortField === "as_of") {
                const ad = new Date(av || 0).getTime(),
                    bd = new Date(bv || 0).getTime();
                return sortOrder === "asc" ? ad - bd : bd - ad;
            }
            if (typeof av === "number" && typeof bv === "number")
                return sortOrder === "asc" ? av - bv : bv - av;
            const as = String(av ?? "").toLowerCase(),
                bs = String(bv ?? "").toLowerCase();
            if (as < bs) return sortOrder === "asc" ? -1 : 1;
            if (as > bs) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });
        return copy;
    }, [rows, sortField, sortOrder]);

    const totalPages = Math.ceil(sorted.length / pageSize) || 1;

    const currentItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [sorted, page, pageSize]);

    const pageRange = (current, total, delta = 1) => {
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        const left = Math.max(2, current - delta);
        const right = Math.min(total - 1, current + delta);
        const range = [1];
        if (left > 2) range.push("…");
        for (let i = left; i <= right; i++) range.push(i);
        if (right < total - 1) range.push("…");
        range.push(total);
        return range;
    };

    const onDelete = async (id) => {
        try {
            if (!window.confirm("Xóa bản ghi giá này?")) return;
            await api.delete(`/domestic-gold/prices/${id}`);
            setSuccessMsg("Đã xóa bản ghi");
            setShowSuccess(true);
            fetchPrices();
        } catch (e) {
            setErrMsg(e?.response?.data?.detail || e.message || "Xóa thất bại");
            setShowErrModal(true);
        }
    };

    const openEditSingle = (r) => {
        setEditingItem(r);
        setShowSingle(true);
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Quản lý giá vàng trong nước</h1>
                        <p className="text-gray-500 text-sm">Quản lý và cập nhật giá vàng trong nước</p>
                    </div>
                    <button
                        onClick={() => setShowBulk(true)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2 rounded-lg shadow-md inline-flex items-center gap-2"
                    >
                        <FiPlus /> Cập nhật giá vàng
                    </button>
                </div>

                <div className="bg-white mb-4 border border-gray-200 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Thương hiệu</span>
                        <select
                            value={filterInstrumentId}
                            onChange={(e) => {
                                setFilterInstrumentId(e.target.value);
                                setPage(1);
                            }}
                            className="border rounded-lg px-3 py-2 bg-white"
                        >
                            <option value="">Tất cả</option>
                            {instruments.map((it) => (
                                <option key={it.id} value={it.id}>
                                    {it.display_name} ({it.symbol})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Ngày</span>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => {
                                setFilterDate(e.target.value);
                                setPage(1);
                            }}
                            className="border rounded-lg px-3 py-2 bg-white"
                        />
                        {filterDate && (
                            <button onClick={() => setFilterDate("")} className="text-sm text-gray-600 underline">
                                Xóa
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-gray-800">
                            <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b text-xs uppercase text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 text-left w-24">
                                        <button onClick={() => toggleSort("id")} className="inline-flex items-center gap-1 font-semibold">
                                            ID {iconFor("id")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left">Thương hiệu</th>
                                    <th className="px-6 py-3 text-left w-40">
                                        <button
                                            onClick={() => toggleSort("buy_price")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            Mua {iconFor("buy_price")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left w-40">
                                        <button
                                            onClick={() => toggleSort("sell_price")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            Bán {iconFor("sell_price")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left w-56">
                                        <button
                                            onClick={() => toggleSort("as_of")}
                                            className="inline-flex items-center gap-1 font-semibold"
                                        >
                                            Thời điểm {iconFor("as_of")}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-right w-40">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-gray-500">
                                            Đang tải…
                                        </td>
                                    </tr>
                                ) : error ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-red-600">
                                            {error}
                                        </td>
                                    </tr>
                                ) : currentItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-gray-400">
                                            Không có dữ liệu
                                        </td>
                                    </tr>
                                ) : (
                                    currentItems.map((r) => {
                                        const inst = instruments.find((i) => i.id === r.instrument_id);
                                        return (
                                            <tr key={r.id} className="border-b hover:bg-gray-50/60">
                                                <td className="px-6 py-3 font-semibold text-gray-700 tabular-nums">#{r.id}</td>
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-gray-900">
                                                        {inst ? inst.display_name : `#${r.instrument_id}`}
                                                    </div>
                                                    <div className="text-xs text-gray-500">{inst?.brand}</div>
                                                </td>
                                                <td className="px-6 py-3 text-gray-800">{fmtVND(r.buy_price)}</td>
                                                <td className="px-6 py-3 text-gray-800">{fmtVND(r.sell_price)}</td>
                                                <td className="px-6 py-3 text-gray-800">{fmtDT(r.as_of)}</td>
                                                <td className="px-6 py-3">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => openEditSingle(r)}
                                                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition"
                                                            aria-label="Sửa dòng này"
                                                        >
                                                            <FiEdit2 className="text-[18px]" />
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete(r.id)}
                                                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition"
                                                            aria-label="Xóa"
                                                        >
                                                            <FiTrash2 className="text-[18px]" />
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

                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-4 py-4 border-t bg-gray-50">
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <span>
                                    Trang <span className="font-semibold">{page}</span> / {totalPages}
                                </span>
                                <div className="hidden sm:flex items-center gap-2">
                                    <span>Hiển thị</span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setPage(1);
                                        }}
                                        className="border rounded-lg px-2 py-1 bg-white"
                                    >
                                        {[8, 12, 16, 24, 40].map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                    <span>hàng/trang</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage(1)}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                >
                                    <FiChevronsLeft />
                                </button>
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
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
                                            className={`h-9 px-3 rounded-lg border text-sm font-medium transition ${page === p
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
                                    className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                >
                                    <FiChevronRight />
                                </button>
                                <button
                                    onClick={() => setPage(totalPages)}
                                    disabled={page === totalPages}
                                    className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                >
                                    <FiChevronsRight />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <BulkPriceForm
                open={showBulk}
                onClose={() => setShowBulk(false)}
                onSaved={() => {
                    setShowBulk(false);
                    setSuccessMsg("Đã lưu 7 loại");
                    setShowSuccess(true);
                    fetchPrices();
                }}
            />

            <PriceAddEditForm
                open={showSingle}
                onClose={() => setShowSingle(false)}
                onSaved={() => {
                    setShowSingle(false);
                    setSuccessMsg("Đã cập nhật");
                    setShowSuccess(true);
                    fetchPrices();
                }}
                item={editingItem}
            />

            <SuccessModal open={showSuccess} message={successMsg} onOk={() => setShowSuccess(false)} />
            <ErrorModal open={showErrModal} message={errMsg} onClose={() => setShowErrModal(false)} />
        </div>
    );
}
