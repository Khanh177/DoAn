import React, { useEffect, useState } from "react";

export default function RejectModal({ open, onClose, onSubmit, loading }) {
    const [reason, setReason] = useState("");
    useEffect(() => { if (!open) setReason(""); }, [open]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
                <div className="px-6 pt-6">
                    <h3 className="text-lg font-semibold">Hủy giao dịch nạp</h3>
                    <p className="text-gray-600 mt-1">Nhập lý do hủy</p>
                    <textarea
                        rows={4}
                        className="mt-3 w-full border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-red-200"
                        placeholder="Ví dụ: Không khớp sao kê / Sai mã nạp / Số tiền không đúng…"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </div>
                <div className="px-6 py-4 flex justify-end gap-3 bg-gray-50">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Đóng
                    </button>
                    <button
                        onClick={() => onSubmit(reason)}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        {loading ? "Đang hủy..." : "Xác nhận hủy"}
                    </button>
                </div>
            </div>
        </div>
    );
}
