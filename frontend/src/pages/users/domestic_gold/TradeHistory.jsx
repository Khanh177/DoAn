import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";
import api from "../../../api/axios";
import {
    FiChevronLeft,
    FiChevronRight,
    FiChevronsLeft,
    FiChevronsRight,
} from "react-icons/fi";

const brandName = {
    SJC: "SJC",
    DOJI_HN: "DOJI HN",
    DOJI_SG: "DOJI SG",
    BTMC_SJC: "BTMC SJC",
    PHU_QUY_SJC: "Phú Quý SJC",
    PNJ_HCM: "PNJ TP.HCM",
    PNJ_HN: "PNJ Hà Nội",
};

const fmtDT = (s) =>
    new Date(s).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

export default function TradeHistory({ instrumentId = null, defaultOpen = false }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [rows, setRows] = useState([]);
    const [cursor, setCursor] = useState(null);
    const [stack, setStack] = useState([null]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [loading, setLoading] = useState(false);

    async function loadByCursor(c) {
        setLoading(true);
        try {
            const params = { limit: pageSize };
            if (instrumentId) params.instrument_id = instrumentId;
            if (c) params.cursor = c;
            const { data } = await api.get("/domestic-gold/spot/history", { params });
            setRows(data?.items || []);
            setCursor(data?.next_cursor || null);
        } finally {
            setLoading(false);
        }
    }

    // reset khi đổi instrument
    useEffect(() => {
        setRows([]);
        setCursor(null);
        setStack([null]);
        setPage(1);
        if (isOpen) loadByCursor(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instrumentId]);

    // polling riêng tư: chỉ gọi REST của user, không dùng ws/public
    useEffect(() => {
        if (!isOpen) return;
        let alive = true;

        const pull = () => {
            if (!alive) return;
            if (page !== 1) return; // chỉ reload tự động khi đang ở trang 1
            loadByCursor(stack[0]); // stack[0] luôn là null
        };

        pull();
        const iv = setInterval(pull, 8000); // 8s
        return () => {
            alive = false;
            clearInterval(iv);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, page, pageSize, instrumentId]);

    const nextPage = async () => {
        if (!cursor) return;
        await loadByCursor(cursor);
        setStack((s) => [...s, cursor]);
        setPage((p) => p + 1);
    };
    const prevPage = async () => {
        if (page === 1) return;
        const prevCursor = stack[page - 2];
        await loadByCursor(prevCursor);
        setStack((s) => s.slice(0, -1));
        setPage((p) => p - 1);
    };
    const firstPage = async () => {
        if (page === 1) return;
        await loadByCursor(null);
        setStack([null]);
        setPage(1);
    };

    // đổi pageSize thì quay về trang 1
    useEffect(() => {
        setStack([null]);
        setPage(1);
        if (isOpen) loadByCursor(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize]);

    return (
        <div className="bg-white rounded-xl shadow-lg">
            <button
                type="button"
                onClick={() => {
                    const next = !isOpen;
                    setIsOpen(next);
                    if (next && rows.length === 0) loadByCursor(null);
                }}
                className="w-full flex items-center justify-between px-6 py-4"
            >
                <span className="text-xl font-semibold text-gray-800">Lịch sử giao dịch</span>
                {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key="hist"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-4 overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="px-3 py-2 text-left text-xs font-semibold">Thời gian</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold">Thương hiệu</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold">M/B</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold">Số lượng</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold">Giá bình quân</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold">Tổng tiền</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold">Phí</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold">Thực thu/chi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => {
                                        const isBuy = r.side === "buy";
                                        return (
                                            <tr key={r.id} className="hover:bg-gray-50 border-b last:border-0">
                                                <td className="px-3 py-2 text-sm text-gray-700">{fmtDT(r.ts)}</td>
                                                <td className="px-3 py-2 text-sm text-gray-700">
                                                    {brandName[r.brand] || r.symbol || "-"}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-xs ${isBuy ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                                            }`}
                                                    >
                                                        {isBuy ? "Mua" : "Bán"}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm">
                                                    {Number(r.qty_xau).toFixed(6)}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm">
                                                    {Number(r.price_used).toLocaleString("en-US")}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm">
                                                    {Number(r.gross_vnd).toLocaleString("en-US")}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm">
                                                    {Number(r.fee_vnd).toLocaleString("en-US")}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm">
                                                    {Number(r.net_vnd).toLocaleString("en-US")}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {rows.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                                                Không có giao dịch
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-1">
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <span>
                                        Trang <span className="font-semibold">{page}</span>
                                    </span>
                                    <div className="hidden sm:flex items-center gap-2">
                                        <span>Hiển thị</span>
                                        <select
                                            value={pageSize}
                                            onChange={(e) => setPageSize(Number(e.target.value))}
                                            className="border rounded-lg px-2 py-1 bg-white"
                                        >
                                            {[8, 12, 16, 24].map((n) => (
                                                <option key={n} value={n}>
                                                    {n}
                                                </option>
                                            ))}
                                        </select>
                                        <span>bản ghi</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={firstPage}
                                        disabled={page === 1 || loading}
                                        className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <FiChevronsLeft />
                                    </button>
                                    <button
                                        onClick={prevPage}
                                        disabled={page === 1 || loading}
                                        className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <FiChevronLeft />
                                    </button>
                                    <button
                                        disabled
                                        className="h-9 px-3 rounded-lg border bg-gray-900 text-white text-sm font-medium"
                                    >
                                        {page}
                                    </button>
                                    <button
                                        onClick={nextPage}
                                        disabled={!cursor || loading}
                                        className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <FiChevronRight />
                                    </button>
                                    <button
                                        onClick={nextPage}
                                        disabled={!cursor || loading}
                                        className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <FiChevronsRight />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
