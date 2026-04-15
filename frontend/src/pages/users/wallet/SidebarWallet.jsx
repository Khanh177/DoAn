import React, { useEffect, useState } from "react";
import api from "../../../api/axios";

export default function WalletSidebarContainer({
    title = "Tài sản",
    value,
    currentView,
    onChange,
    onLoaded,
    onOpenDepositHistory,
}) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { data } = await api.get("/wallet/wallet_type", { params: { skip: 0, limit: 1000 } });
                const list = data || [];
                if (!alive) return;
                setItems(list);
                onLoaded?.(list);
                if (!value && list[0]?.id) onChange?.(list[0].id);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    return (
        <aside className="w-64 bg-white rounded-lg shadow p-4 flex flex-col">
            <h2 className="text-xl font-semibold mb-3">{title}</h2>

            {loading ? (
                <p className="text-sm text-gray-500">Đang tải…</p>
            ) : items.length === 0 ? (
                <p className="text-sm text-gray-500">Chưa có loại ví</p>
            ) : (
                <>
                    <ul className="space-y-2">
                        {items.map((t) => (
                            <li key={t.id}>
                                <button
                                    onClick={() => onChange?.(t.id)}
                                    className={`w-full text-left px-3 py-2 rounded ${currentView === "assets" && value === t.id
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "hover:bg-gray-100"
                                        }`}
                                >
                                    {t.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <div className="my-4" />
            <h3 className="text-xl font-semibold mb-2">Lịch sử lệnh</h3>
            <ul className="space-y-2">
                <li>
                    <button
                        onClick={() => onOpenDepositHistory?.()}
                        className={`w-full text-left px-3 py-2 rounded ${currentView === "depositHistory"
                            ? "bg-yellow-100 text-yellow-700"
                            : "hover:bg-gray-100"
                            }`}
                    >
                        Lịch sử nạp tiền
                    </button>
                </li>
                <li>
                    <button
                        onClick={() => onChange?.("futuresHistory")}
                        className={`w-full text-left px-3 py-2 rounded ${currentView === "futuresHistory"
                            ? "bg-yellow-100 text-yellow-700"
                            : "hover:bg-gray-100"
                            }`}
                    >
                        Lịch sử futures
                    </button>
                </li>
                <li>
                    <button
                        onClick={() => onChange?.("spotdomHistory")}
                        className={`w-full text-left px-3 py-2 rounded ${currentView === "spotdomHistory"
                            ? "bg-yellow-100 text-yellow-700"
                            : "hover:bg-gray-100"
                            }`}
                    >
                        Lịch sử spot trong nước
                    </button>
                </li>
            </ul>
        </aside>
    );
}
