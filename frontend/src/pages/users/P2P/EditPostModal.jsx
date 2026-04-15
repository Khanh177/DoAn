import React from "react";
import { X } from "lucide-react";

export default function EditPostModal({ open, onClose, post, form, setForm, onSubmit }) {
    if (!open || !post) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100"
                >
                    <X className="w-5 h-5 text-gray-500" />
                </button>

                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                    Chỉnh sửa bài đăng #{post.id}
                </h2>

                <div className="space-y-4">
                    {/* Số lượng vàng */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Số lượng vàng (lượng)
                        </label>
                        <input
                            type="number"
                            value={form.quantity}
                            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md"
                            placeholder="Nhập số lượng"
                        />
                    </div>

                    {/* Giá */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Giá (VNĐ/lượng)
                        </label>
                        <input
                            type="number"
                            value={form.price}
                            onChange={(e) => setForm({ ...form, price: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md"
                            placeholder="Nhập giá"
                        />
                    </div>

                    {/* Giới hạn */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tối thiểu (VNĐ)
                            </label>
                            <input
                                type="number"
                                value={form.minPrice}
                                onChange={(e) => setForm({ ...form, minPrice: e.target.value })}
                                className="w-full px-3 py-2 border rounded-md"
                                placeholder="Giá tối thiểu"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tối đa (VNĐ)
                            </label>
                            <input
                                type="number"
                                value={form.maxPrice}
                                onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
                                className="w-full px-3 py-2 border rounded-md"
                                placeholder="Giá tối đa"
                            />
                        </div>
                    </div>

                    {/* Thông tin ngân hàng */}
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">
                            Thông tin ngân hàng
                        </h3>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">
                                    Tên ngân hàng
                                </label>
                                <input
                                    type="text"
                                    value={form.bankName}
                                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md text-sm"
                                    placeholder="VD: Vietcombank"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-600 mb-1">
                                    Số tài khoản
                                </label>
                                <input
                                    type="text"
                                    value={form.accountNumber}
                                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md text-sm"
                                    placeholder="VD: 1234567890"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-600 mb-1">
                                    Tên chủ tài khoản
                                </label>
                                <input
                                    type="text"
                                    value={form.accountName}
                                    onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md text-sm"
                                    placeholder="VD: NGUYEN VAN A"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onSubmit}
                        className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm"
                    >
                        Cập nhật
                    </button>
                </div>
            </div>
        </div>
    );
}