// src/components/p2p/TransactionHistory.jsx
import React, { useEffect, useState } from "react";

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

// giống TradeHistory
function pageRange(page, totalPages, delta = 1) {
    if (totalPages <= 7)
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);
    const range = [1];
    if (left > 2) range.push("…");
    for (let i = left; i <= right; i++) range.push(i);
    if (right < totalPages - 1) range.push("…");
    range.push(totalPages);
    return range;
}

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
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {children}
        </button>
    );
}

export default function TransactionHistory({
    transactions,
    userId,
    currentPage,
    itemsPerPage,
    setCurrentPage,
}) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    if (transactions.length === 0) {
        return (
            <p className="text-gray-500 text-center mt-4">
                Chưa có giao dịch nào trong lịch sử.
            </p>
        );
    }

    const totalPages = Math.ceil(transactions.length / itemsPerPage);
    const safePage = Math.min(Math.max(currentPage, 1), totalPages);

    const pageData = transactions.slice(
        (safePage - 1) * itemsPerPage,
        safePage * itemsPerPage
    );

    const formatCountdown = (tx) => {
        if (tx.trang_thai !== "paid") return "-";
        const baseTime = tx.thoi_gian_thanh_toan;
        if (!baseTime) return "-";

        const deadline =
            new Date(baseTime).getTime() + 10 * 60 * 1000;
        const diff = deadline - now;
        if (diff <= 0) return "Hết hạn";

        const totalSeconds = Math.floor(diff / 1000);
        const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
        const s = String(totalSeconds % 60).padStart(2, "0");
        return `${m}:${s}`;
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

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-800">
                    Lịch sử giao dịch
                </h2>
            </div>
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Mã giao dịch
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Loại
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Loại vàng
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Số lượng
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Tổng tiền
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Phí
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Trạng thái
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Đếm ngược
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Thời gian
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pageData.map((tx) => {
                            const isBuyer = tx.nguoi_mua_id === userId;
                            const feeGold = Number(tx.so_luong || 0) * FEE_RATE;
                            const typeLabel = isBuyer ? "Mua" : "Bán";
                            const tradeCode =
                                tx.ma_giao_dich || tx.trade_code || `#${tx.id}`;

                            return (
                                <tr key={tx.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                                        {tradeCode}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span
                                            className={
                                                typeLabel === "Mua"
                                                    ? "text-green-600"
                                                    : "text-red-600"
                                            }
                                        >
                                            {typeLabel}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {GOLD_TYPE_LABELS[tx.loai_vang] ||
                                            tx.loai_vang}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {tx.so_luong.toFixed(5)}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span
                                            className={
                                                isBuyer
                                                    ? "text-green-600"
                                                    : "text-red-600"
                                            }
                                        >
                                            {tx.tong_tien.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {feeGold.toFixed(5)} lượng
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span
                                            className={`font-medium ${translateStatus(tx.trang_thai)
                                                .color
                                                }`}
                                        >
                                            {translateStatus(tx.trang_thai).label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {formatCountdown(tx)}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {formatVNTime(tx.thoi_gian_tao)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Phân trang */}
                <div className="px-4 py-3 border-t border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
                    <div className="text-gray-600">
                        Hiển thị{" "}
                        {(safePage - 1) * itemsPerPage + 1}-
                        {Math.min(
                            safePage * itemsPerPage,
                            transactions.length
                        )}{" "}
                        / {transactions.length} giao dịch
                    </div>

                    <div className="flex items-center gap-1">
                        <PageBtn
                            rounded="l"
                            disabled={safePage === 1}
                            onClick={() => setCurrentPage(1)}
                        >
                            «
                        </PageBtn>
                        <PageBtn
                            disabled={safePage === 1}
                            onClick={() =>
                                setCurrentPage((p) => Math.max(1, p - 1))
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
                                    onClick={() => setCurrentPage(p)}
                                >
                                    {p}
                                </PageBtn>
                            )
                        )}

                        <PageBtn
                            disabled={safePage === totalPages}
                            onClick={() =>
                                setCurrentPage((p) =>
                                    Math.min(totalPages, p + 1)
                                )
                            }
                        >
                            ›
                        </PageBtn>
                        <PageBtn
                            rounded="r"
                            disabled={safePage === totalPages}
                            onClick={() => setCurrentPage(totalPages)}
                        >
                            »
                        </PageBtn>
                    </div>
                </div>
            </div>
        </div>
    );
}
