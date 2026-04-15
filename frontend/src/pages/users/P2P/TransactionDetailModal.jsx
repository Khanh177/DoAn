import React from "react";
import { X } from "lucide-react";

const GOLD_TYPE_LABELS = {
    gold_world: "XAU",
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

export default function TransactionDetailModal({ open, transaction, onClose, userId }) {
    if (!open || !transaction) return null;

    const bankInfo = transaction.bank_info || {};
    const transferNote =
        bankInfo.transfer_note ||
        transaction.transfer_note ||
        transaction.ma_giao_dich ||
        transaction.trade_code ||
        "";

    const isBuyer =
        userId &&
        (transaction.nguoi_mua_id === userId ||
            transaction.buyer_id === userId);

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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full relative">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100"
                >
                    <X className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="text-xl font-semibold mb-4 text-gray-800">
                    Chi tiết giao dịch
                </h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-gray-500">ID giao dịch</p>
                        <p className="font-medium">{transaction.id}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Trạng thái</p>
                        <p
                            className={`font-medium ${translateStatus(transaction.trang_thai).color
                                }`}
                        >
                            {translateStatus(transaction.trang_thai).label}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-500">Loại vàng</p>
                        <p className="font-medium">
                            {GOLD_TYPE_LABELS[transaction.loai_vang] ||
                                transaction.loai_vang}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-500">Số lượng</p>
                        <p className="font-medium">
                            {transaction.so_luong.toFixed(5)} lượng
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-500">Giá thỏa thuận</p>
                        <p className="font-medium">
                            {transaction.gia_thoa_thuan.toLocaleString()} VNĐ
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-500">Tổng tiền</p>
                        <p className="font-medium">
                            {transaction.tong_tien.toLocaleString()} VNĐ
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-500">Phí giao dịch</p>
                        <p className="font-medium">
                            {transaction.phi_giao_dich.toLocaleString()} VNĐ
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-500">Thời gian tạo</p>
                        <p className="font-medium">
                            {formatVNTime(transaction.thoi_gian_tao)}
                        </p>
                    </div>

                    {/* Chỉ hiện thông tin ngân hàng nếu là người MUA
                        (Loại = "Mua"). Nếu là "Bán" thì block này ẩn */}
                    {/* Chỉ hiện thông tin ngân hàng nếu là người MUA (Loại = "Mua") */}
                    {isBuyer && (
                        <div className="col-span-2">
                            <p className="text-gray-500 mb-1">Thông tin ngân hàng</p>
                            <p className="font-medium">
                                Ngân hàng: {bankInfo.ten_ngan_hang || "N/A"}
                                <br />
                                Chủ tài khoản: {bankInfo.ten_chu_tai_khoan || "N/A"}
                                <br />
                                Số tài khoản: {bankInfo.so_tai_khoan || "N/A"}
                            </p>
                        </div>
                    )}

                    {/* Mã giao dịch / Nội dung chuyển khoản – tách riêng, ai cũng xem được */}
                    {transferNote && (
                        <div className="col-span-2">
                            <p className="text-gray-500 mb-1">
                                Nội dung chuyển khoản
                            </p>
                            <p className="font-semibold">
                                {transferNote}
                            </p>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
}
