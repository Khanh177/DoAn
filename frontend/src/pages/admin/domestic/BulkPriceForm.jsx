import React, { useEffect, useMemo, useState } from "react";
import api from "../../../api/axios";

const pad = (n) => String(n).padStart(2, "0");
const nowLocal = () => {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
};

export default function BulkPriceForm({ open, onClose, onSaved }) {
    const [instruments, setInstruments] = useState([]);
    const [rows, setRows] = useState([]);
    const [asOf, setAsOf] = useState(nowLocal());
    const [dateFilter, setDateFilter] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const loadBase = async () => {
        const { data } = await api.get("/domestic-gold/instruments");
        setInstruments(data);
        return data;
    };

    const loadSnapshot = async (insts) => {
        const params = {};
        if (dateFilter) params.d = dateFilter;
        const { data } = await api.get("/domestic-gold/prices/snapshot", { params });
        const map = new Map(data.map(p => [p.instrument_id, p]));
        const merged = insts.map(it => ({
            instrument_id: it.id,
            symbol: it.symbol,
            display_name: it.display_name,
            buy_price: map.get(it.id)?.buy_price ?? "",
            sell_price: map.get(it.id)?.sell_price ?? "",
        }));
        setRows(merged);
    };

    useEffect(() => {
        if (!open) return;
        setErr("");
        setAsOf(nowLocal());
        setLoading(true);
        loadBase().then((insts) => loadSnapshot(insts)).finally(() => setLoading(false));
    }, [open]);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        loadBase().then((insts) => loadSnapshot(insts)).finally(() => setLoading(false));
    }, [dateFilter]);

    const onChangeCell = (idx, field, value) =>
        setRows((s) => s.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

    const payload = useMemo(() => ({
        items: rows
            .filter(r => r.buy_price && r.sell_price)
            .map(r => ({
                instrument_id: r.instrument_id,
                buy_price: Number(r.buy_price),
                sell_price: Number(r.sell_price),
                as_of: new Date(asOf).toISOString(),
            })),
    }), [rows, asOf]);

    const submit = async () => {
        try {
            setErr("");
            if (!payload.items.length) { setErr("Nhập ít nhất 1 dòng có đủ giá"); return; }
            await api.post("/domestic-gold/prices/bulk", payload);
            onSaved?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message || "Lỗi lưu");
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-3xl mx-4">
                <h2 className="text-2xl font-bold text-center mb-4 text-gray-800">Cập nhật 7 loại vàng cùng lúc</h2>

                <div className="bg-gray-50 border rounded-xl p-3 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <label className="block mb-1 text-gray-700 font-medium">Thời điểm áp dụng</label>
                        <input
                            type="datetime-local"
                            value={asOf}
                            onChange={(e) => setAsOf(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500"
                        />
                    </div>
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Lấy giá gợi ý theo ngày</label>
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md bg-white"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto border rounded-xl">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-100 text-gray-700">
                            <tr>
                                <th className="px-4 py-2 text-left">Instrument</th>
                                <th className="px-4 py-2 text-left w-48">Giá mua (VND)</th>
                                <th className="px-4 py-2 text-left w-48">Giá bán (VND)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">Đang tải…</td></tr>
                            ) : rows.map((r, idx) => (
                                <tr key={r.instrument_id} className="border-t">
                                    <td className="px-4 py-2">
                                        <div className="font-medium">{r.display_name}</div>
                                        <div className="text-xs text-gray-500">{r.symbol}</div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="number" min="1" step="1"
                                            value={r.buy_price}
                                            onChange={(e) => onChangeCell(idx, "buy_price", e.target.value)}
                                            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500"
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="number" min="1" step="1"
                                            value={r.sell_price}
                                            onChange={(e) => onChangeCell(idx, "sell_price", e.target.value)}
                                            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

                <div className="flex justify-end gap-3 mt-5">
                    <button onClick={onClose} className="px-5 py-2 rounded-md bg-gray-300 text-gray-800 hover:bg-gray-400">Hủy</button>
                    <button onClick={submit} className="px-5 py-2 rounded-md bg-yellow-500 hover:bg-yellow-600 text-white font-semibold">Lưu tất cả</button>
                </div>
            </div>
        </div>
    );
}
