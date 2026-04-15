// src/pages/users/P2P/AddPostModal.jsx
import React from "react";
import { X } from "lucide-react";

export default function AddPostModal({
    open,
    onClose,
    modalAction,
    setModalAction,
    wallet,
    form,
    setForm,
    onSubmit,
}) {
    if (!open) return null;

    const availableGold = Number(wallet?.gold_world ?? 0);

    const formatNumber = (value) => {
        if (!value && value !== 0) return "";
        const digits = String(value).replace(/\D/g, "");
        if (!digits) return "";
        return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const handleMoneyChange = (field) => (e) => {
        const raw = e.target.value.replace(/,/g, "").replace(/\D/g, "");
        setForm((prev) => ({ ...prev, [field]: raw }));
    };

    const handleMax = () => {
        setForm((prev) => ({
            ...prev,
            quantity: availableGold ? availableGold.toString() : "",
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[80vh] overflow-y-auto p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100"
                >
                    <X className="w-5 h-5 text-gray-500" />
                </button>

                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                    Đăng bài P2P
                </h2>

                <div className="space-y-4 text-sm">
                    {/* Loại giao dịch */}
                    <div>
                        <p className="text-gray-600 mb-1">Loại giao dịch</p>
                        <div className="inline-flex rounded-full bg-gray-100 p-1">
                            <button
                                type="button"
                                onClick={() => setModalAction("Mua")}
                                className={`px-4 py-1 rounded-full text-xs font-medium ${modalAction === "Mua"
                                        ? "bg-green-500 text-white"
                                        : "text-gray-700"
                                    }`}
                            >
                                Mua
                            </button>
                            <button
                                type="button"
                                onClick={() => setModalAction("Bán")}
                                className={`px-4 py-1 rounded-full text-xs font-medium ${modalAction === "Bán"
                                        ? "bg-red-500 text-white"
                                        : "text-gray-700"
                                    }`}
                            >
                                Bán
                            </button>
                        </div>
                    </div>

                    {/* Loại vàng */}
                    <div>
                        <p className="text-gray-600 mb-1">Loại vàng</p>
                        <input
                            value="XAU (gold_world)"
                            readOnly
                            className="w-full px-3 py-2 border rounded-md bg-gray-100 text-gray-500"
                        />
                    </div>

                    {/* Số lượng vàng đăng bán */}
                    <div>
                        <p className="text-gray-600 mb-1">
                            Số vàng muốn đăng bán (XAU)
                        </p>
                        <div className="relative">
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={form.quantity ?? ""}
                                onChange={(e) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        quantity: e.target.value,
                                    }))
                                }
                                className="w-full pr-16 px-3 py-2 border rounded-md"
                                placeholder="Nhập số vàng"
                            />
                            <button
                                type="button"
                                onClick={handleMax}
                                className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-yellow-500 hover:underline"
                            >
                                TỐI ĐA
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Khả dụng tối đa: {availableGold} XAU
                        </p>
                    </div>

                    {/* Giới hạn số tiền mỗi lệnh */}
                    <div>
                        <p className="text-gray-600 mb-1">
                            Giới hạn số tiền mỗi lệnh (VNĐ)
                        </p>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                placeholder="Tối thiểu"
                                value={formatNumber(form.minPrice)}
                                onChange={handleMoneyChange("minPrice")}
                                className="w-1/2 px-3 py-2 border rounded-md"
                            />
                            <input
                                type="text"
                                placeholder="Tối đa"
                                value={formatNumber(form.maxPrice)}
                                onChange={handleMoneyChange("maxPrice")}
                                className="w-1/2 px-3 py-2 border rounded-md"
                            />
                        </div>
                    </div>

                    {/* Giá niêm yết */}
                    <div>
                        <p className="text-gray-600 mb-1">
                            Giá niêm yết (VNĐ/lượng)
                        </p>
                        <input
                            type="text"
                            value={formatNumber(form.price)}
                            onChange={handleMoneyChange("price")}
                            className="w-full px-3 py-2 border rounded-md"
                            placeholder="Nhập giá, vd: 1,000,000"
                        />
                    </div>

                    {/* Ngân hàng */}
                    <div>
                        <p className="text-gray-600 mb-1">Tên ngân hàng</p>
                        <input
                            value={form.bankName}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    bankName: e.target.value,
                                }))
                            }
                            className="w-full px-3 py-2 border rounded-md"
                            placeholder="VD: Vietcombank"
                        />
                    </div>

                    <div>
                        <p className="text-gray-600 mb-1">Số tài khoản</p>
                        <input
                            value={form.accountNumber}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    accountNumber: e.target.value,
                                }))
                            }
                            className="w-full px-3 py-2 border rounded-md"
                            placeholder="Nhập số tài khoản"
                        />
                    </div>

                    <div>
                        <p className="text-gray-600 mb-1">Tên chủ tài khoản</p>
                        <input
                            value={form.accountName}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    accountName: e.target.value,
                                }))
                            }
                            className="w-full px-3 py-2 border rounded-md"
                            placeholder="Nhập họ tên"
                        />
                    </div>

                    <div>
                        <p className="text-xs text-gray-400">
                            Nội dung chuyển khoản sẽ được hệ thống tự sinh riêng
                            cho từng giao dịch P2P.
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3 text-sm">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                    >
                        Hủy
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        className="px-4 py-2 rounded-md bg-yellow-500 text-white hover:bg-yellow-600"
                    >
                        Đăng bài
                    </button>
                </div>
            </div>
        </div>
    );
}
