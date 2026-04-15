// src/components/p2p/PostRow.jsx
import React from "react";
import { Trash2, Edit, Eye, EyeOff } from "lucide-react";

export const GOLD_TYPE_LABELS = {
    gold_world_balance: "XAU",
};

export default function PostRow({
    post,
    type,           // "Mua" hoặc "Bán" – từ tab hiện tại
    userId,
    onDelete,
    onEdit,
    onToggleStatus,
    onOpen,
}) {
    const goldLabel = GOLD_TYPE_LABELS[post.loai_vang] || post.loai_vang;
    const isOwner = post.user_id === userId;
    const isActive = post.trang_thai === "active";

    // Đảm bảo hiển thị đúng 5 chữ số, không bị lỗi NaN
    const availableDisplay = post.kha_dung != null
        ? Number(post.kha_dung).toFixed(5).replace(/\.?0+$/, "")
        : "0";

    return (
        <div
            className={`grid grid-cols-5 items-center px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition ${!isActive ? "bg-gray-50 opacity-70" : ""
                }`}
        >
            {/* Cột 1: Người quảng cáo */}
            <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm">
                    {post.ho_ten ? post.ho_ten.charAt(0).toUpperCase() : "U"}
                </div>
                <div>
                    <div className="flex items-center space-x-2">
                        <p className="font-semibold text-gray-800">
                            {post.ho_ten || `User #${post.user_id}`}
                        </p>
                        {!isActive && (
                            <span className="text-xs px-2 py-0.5 bg-gray-300 text-gray-600 rounded-full">
                                Đã ẩn
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">
                        {type === "Mua" ? "Thương hiệu" : "Loại vàng"}: {goldLabel}
                    </p>
                </div>
            </div>

            {/* Cột 2: Giá */}
            <div className="text-right">
                <span
                    className={`text-2xl font-bold ${type === "Mua" ? "text-green-600" : "text-red-600"
                        }`}
                >
                    {Number(post.gia_tien).toLocaleString()} VNĐ
                </span>
            </div>

            {/* Cột 3: Khả dụng / Giới hạn */}
            <div className="text-center text-xs text-gray-600 space-y-1">
                <div>
                    Khả dụng:{" "}
                    <span className="font-bold text-green-600 text-sm">
                        {availableDisplay} lượng
                    </span>
                </div>
                <div className="text-gray-500">
                    Giới hạn: {Number(post.gia_toi_thieu).toLocaleString()} -{" "}
                    {Number(post.gia_toi_da).toLocaleString()} VNĐ
                </div>
            </div>

            {/* Cột 4: Thanh toán */}
            <div className="text-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {post.ten_ngan_hang || "Ngân hàng"}
                </span>
            </div>

            {/* Cột 5: Giao dịch / Quản lý */}
            <div className="flex justify-end items-center space-x-3">
                {isOwner ? (
                    <>
                        <button
                            onClick={() => onEdit(post)}
                            className="p-2.5 rounded-full hover:bg-blue-100 text-blue-600 transition"
                            title="Chỉnh sửa"
                        >
                            <Edit className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => onToggleStatus(post)}
                            className={`p-2.5 rounded-full transition ${isActive
                                    ? "hover:bg-orange-100 text-orange-600"
                                    : "hover:bg-green-100 text-green-600"
                                }`}
                            title={isActive ? "Ẩn bài" : "Hiện bài"}
                        >
                            {isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>

                        <button
                            onClick={() => onDelete(post)}
                            className="p-2.5 rounded-full hover:bg-red-100 text-red-600 transition"
                            title="Xóa bài"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => onOpen(post)}
                        disabled={!isActive}
                        className={`px-6 py-3 rounded-xl font-bold text-white shadow-md transition transform hover:scale-105 ${!isActive
                                ? "bg-gray-400 cursor-not-allowed"
                                : type === "Mua"
                                    ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                                    : "bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700"
                            }`}
                    >
                        {type === "Mua" ? "MUA VÀNG" : "BÁN VÀNG"}
                    </button>
                )}
            </div>
        </div>
    );
}