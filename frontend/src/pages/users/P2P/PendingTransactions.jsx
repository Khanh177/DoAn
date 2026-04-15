// src/components/p2p/PendingTransactions.jsx
import React, { useEffect, useState } from "react";
import { Eye, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";

const GOLD_TYPE_LABELS = {
    gold_world_balance: "XAU",
};

const translateStatus = (status) => {
    const map = {
        pending: { label: "Chờ xử lý", color: "text-yellow-500" },
        waiting_payment: { label: "Chờ thanh toán", color: "text-yellow-500" },
        paid: { label: "Đã thanh toán", color: "text-blue-500" },
        confirmed: { label: "Đã xác nhận", color: "text-green-500" },
        completed: { label: "Hoàn thành", color: "text-emerald-600" },
        cancelled: { label: "Đã hủy", color: "text-red-600" },
        disputed: { label: "Tranh chấp", color: "text-orange-500" },
    };
    return map[status] || { label: status, color: "text-gray-600" };
};

const FEE_RATE = 0.005;

export default function PendingTransactions({
    pendingTransactions,
    userId,
    onAction,
    onViewDetail,
}) {
    const [now, setNow] = useState(Date.now());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [pendingTransactions?.length]);

    if (!pendingTransactions || pendingTransactions.length === 0) {
        return <p className="text-gray-500 text-center mt-4">Không có giao dịch chờ xử lý.</p>;
    }

    const totalPages = Math.ceil(pendingTransactions.length / itemsPerPage);
    const pageData = pendingTransactions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const formatCountdown = (tx) => {
        if (tx.trang_thai !== "paid") return "-";
        const baseTime = tx.thoi_gian_thanh_toan || tx.paid_at;
        if (!baseTime) return "-";

        const deadline = new Date(baseTime).getTime() + 10 * 60 * 1000;
        const diff = deadline - now;
        if (diff <= 0) return "Hết hạn";

        const totalSeconds = Math.floor(diff / 1000);
        const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
        const s = String(totalSeconds % 60).padStart(2, "0");
        return `${m}:${s}`;
    };

    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, pendingTransactions.length);

    return (
        <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Giao dịch chờ xử lý
            </h2>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Mã</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Loại</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Vàng</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Số lượng</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Tổng tiền</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Phí</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Đếm ngược</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pageData.map((tx) => {
                            const isBuyer = tx.nguoi_mua_id === userId || tx.buyer_id === userId;
                            const isSeller = tx.nguoi_ban_id === userId || tx.seller_id === userId;
                            const typeLabel = isBuyer ? "Mua" : "Bán";
                            const typeColor = isBuyer ? "text-green-600" : "text-red-600";
                            const feeGold = Number(tx.so_luong || 0) * FEE_RATE;

                            return (
                                <tr key={tx.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                                        {tx.ma_giao_dich || tx.trade_code || tx.id}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={`font-medium ${typeColor}`}>{typeLabel}</span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {GOLD_TYPE_LABELS[tx.loai_vang] || tx.loai_vang}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">{Number(tx.so_luong || 0).toFixed(5)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={isBuyer ? "text-green-600" : "text-red-600"}>
                                            {Number(tx.tong_tien || 0).toLocaleString()} VNĐ
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">{feeGold.toFixed(5)} lượng</td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={`font-medium ${translateStatus(tx.trang_thai).color}`}>
                                            {translateStatus(tx.trang_thai).label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">{formatCountdown(tx)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {isBuyer && tx.trang_thai === "waiting_payment" && (
                                                <>
                                                    <button onClick={() => onAction(tx.id, "confirm")} className="p-1.5 rounded-full hover:bg-green-50 text-green-600" title="Đã chuyển tiền">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => onAction(tx.id, "cancel")} className="p-1.5 rounded-full hover:bg-red-50 text-red-600" title="Hủy lệnh">
                                                        <XCircle className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                            {isSeller && tx.trang_thai === "paid" && (
                                                <button onClick={() => onAction(tx.id, "confirm")} className="p-1.5 rounded-full hover:bg-green-50 text-green-600" title="Đã nhận tiền">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button onClick={() => onViewDetail(tx)} className="p-1.5 rounded-full hover:bg-blue-50 text-blue-600" title="Xem chi tiết">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
                <div className="text-gray-600">
                    Hiển thị {startIndex}-{endIndex} / {pendingTransactions.length} giao dịch
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`px-2 py-1 rounded-md border flex items-center ${currentPage === 1 ? "border-gray-200 text-gray-400 cursor-not-allowed" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2">{currentPage}/{totalPages}</span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={`px-2 py-1 rounded-md border flex items-center ${currentPage === totalPages ? "border-gray-200 text-gray-400 cursor-not-allowed" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}