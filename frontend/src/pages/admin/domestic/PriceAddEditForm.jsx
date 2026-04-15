// src/pages/admin/domestic/PriceAddEditForm.jsx
import React, { useEffect, useState } from "react";
import api from "../../../api/axios";

export default function PriceAddEditForm({ open, onClose, onSaved, item }) {
    const [buy, setBuy] = useState("");
    const [sell, setSell] = useState("");
    const [asOf, setAsOf] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!open) return;
        setErr("");
        if (item) {
            setBuy(item.buy_price);
            setSell(item.sell_price);
            // giữ nguyên as_of hiện tại để tránh tạo bản ghi mới
            const d = new Date(item.as_of);
            const pad = (n) => String(n).padStart(2, "0");
            const loc = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            setAsOf(loc);
        }
    }, [open, item]);

    const submit = async () => {
        try {
            setSubmitting(true); setErr("");
            await api.put(`/domestic-gold/prices/${item.id}`, {
                buy_price: Number(buy),
                sell_price: Number(sell),
                as_of: new Date(asOf).toISOString(), // nếu đổi as_of vẫn cập nhật theo id, KHÔNG bulk
            });
            onSaved?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message || "Lỗi lưu");
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4">
                <h2 className="text-2xl font-bold text-center mb-4 text-gray-800">Sửa giá</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Giá mua (VND)</label>
                        <input type="number" min="1" step="1" value={buy} onChange={(e) => setBuy(e.target.value)} className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500" />
                    </div>
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Giá bán (VND)</label>
                        <input type="number" min="1" step="1" value={sell} onChange={(e) => setSell(e.target.value)} className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500" />
                    </div>
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Thời điểm</label>
                        <input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500" />
                    </div>
                    {err && <p className="text-sm text-red-600">{err}</p>}
                </div>
                <div className="flex justify-end gap-3 mt-5">
                    <button onClick={onClose} disabled={submitting} className="px-5 py-2 rounded-md bg-gray-300 text-gray-800 hover:bg-gray-400">Hủy</button>
                    <button onClick={submit} disabled={submitting} className="px-5 py-2 rounded-md bg-yellow-500 hover:bg-yellow-600 text-white font-semibold">Lưu</button>
                </div>
            </div>
        </div>
    );
}
