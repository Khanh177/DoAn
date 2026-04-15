import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, ArrowLeftRight } from "lucide-react";

export default function Transfer({
    open = true,
    onClose,
    walletTypes = [],
    assetsByType = {},
    defaultFromTypeId = null,
    defaultCoinKey = "",
    onConfirm,
}) {
    const [fromId, setFromId] = useState("");
    const [toId, setToId] = useState("");
    const [coinKey, setCoinKey] = useState("");
    const [amount, setAmount] = useState("");

    useEffect(() => {
        if (!open) return;
        const initFrom = defaultFromTypeId || walletTypes?.[0]?.id || "";
        const initTo = walletTypes.find((w) => w.id !== Number(initFrom))?.id || "";
        setFromId(initFrom);
        setToId(initTo);
        const aset = assetsByType[initFrom] || [];
        const initCoin = defaultCoinKey || aset?.[0]?.key || "";
        setCoinKey(initCoin);
        setAmount("");
    }, [open, walletTypes, assetsByType, defaultFromTypeId, defaultCoinKey]);

    const toOptions = useMemo(
        () => walletTypes.filter((w) => Number(w.id) !== Number(fromId)),
        [walletTypes, fromId]
    );

    useEffect(() => {
        if (!fromId) return;
        if (Number(toId) === Number(fromId)) setToId(toOptions[0]?.id || "");
    }, [fromId, toId, toOptions]);

    const fromAssets = useMemo(() => assetsByType[fromId] || [], [assetsByType, fromId]);

    useEffect(() => {
        if (!fromAssets.length) { setCoinKey(""); return; }
        if (!fromAssets.find((a) => a.key === coinKey)) setCoinKey(fromAssets[0].key);
    }, [fromAssets, coinKey]);

    const coin = useMemo(() => fromAssets.find((a) => a.key === coinKey), [fromAssets, coinKey]);
    const available = Number(coin?.qty || 0);
    const minAmount = 0.000001;

    const disabled =
        !fromId || !toId || fromId === toId || !coinKey || Number(amount) < minAmount || Number(amount) > available;

    const handleSwitch = () => {
        setFromId((prevFrom) => {
            const nextFrom = toId;
            setToId(prevFrom);
            const aset = assetsByType[nextFrom] || [];
            const nextCoin = aset.find((a) => a.key === coinKey) ? coinKey : (aset[0]?.key || "");
            setCoinKey(nextCoin);
            return nextFrom;
        });
    };

    const handleMax = () => setAmount(available ? String(available) : "");
    const confirm = () => {
        if (disabled) return;
        onConfirm?.({
            from_wallet_type_id: Number(fromId),
            to_wallet_type_id: Number(toId),
            asset_key: String(coinKey),
            amount: Number(amount),
        });
    };
    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-[420px] p-6 relative">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-gray-800">Chuyển tiền</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700 cursor-pointer" /></button>
                </div>

                {/* From / To */}
                <div className="relative mb-6">
                    <div className="border border-gray-300 rounded-xl px-4 py-3 bg-white">
                        <RowSelect label="Từ" items={walletTypes.map((w) => ({ id: w.id, label: w.name }))} selectedId={fromId} onSelect={setFromId} />
                        <div className="border-t border-gray-200 my-2" />
                        <RowSelect label="Đến" items={walletTypes.filter((w) => w.id !== Number(fromId)).map((w) => ({ id: w.id, label: w.name }))} selectedId={toId} onSelect={setToId} />
                    </div>

                    <button
                        onClick={handleSwitch}
                        className="absolute top-[42%] right-[14px] bg-yellow-400 hover:bg-yellow-500 p-1.5 rounded-full shadow transition-transform duration-150 active:scale-90"
                        title="Đổi chỗ"
                    >
                        <ArrowLeftRight className="w-4 h-4 text-white" />
                    </button>
                </div>

                {/* Coin */}
                <div className="mb-6">
                    <label className="text-gray-600 text-sm font-medium">Coin</label>
                    <CoinSelect
                        selected={coin}
                        items={(fromAssets || []).map(a => ({
                            id: a.key,
                            label: a.name,
                            subLabel: a.name,
                            logo: a.logo,
                            balance: a.qty,
                            approx: "",
                        }))}
                        onSelect={(id) => setCoinKey(id)}
                    />
                    {available === 0 && <p className="text-red-500 text-sm mt-1">Không có sẵn tiền để chuyển, vui lòng chọn đồng coin khác.</p>}
                </div>

                {/* Amount */}
                <div className="mb-6">
                    <label className="text-gray-600 text-sm font-medium">Số tiền</label>
                    <div className="flex items-center border border-gray-300 rounded-lg px-3 py-2 mt-1">
                        <input
                            type="number"
                            min={minAmount}
                            step={minAmount}
                            placeholder={`Tối thiểu ${minAmount}`}
                            className="flex-1 outline-none bg-transparent text-gray-800"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                        <span className="text-gray-800 font-medium">{coin?.name || ""}</span>
                        <button type="button" onClick={handleMax} className="text-yellow-500 ml-2 font-semibold hover:underline">TỐI ĐA</button>
                    </div>
                    <p className="text-gray-500 text-sm mt-1">Khả dụng: {available} {coin?.name || ""}</p>
                    {Number(amount) > available && <p className="text-red-500 text-sm mt-1">Số tiền vượt quá khả dụng</p>}
                    {Number(amount) > 0 && Number(amount) < minAmount && <p className="text-red-500 text-sm mt-1">Số tiền tối thiểu {minAmount}</p>}
                    {fromId === toId && fromId && <p className="text-red-500 text-sm mt-1">Ví nguồn và ví đích phải khác nhau</p>}
                </div>

                <button
                    disabled={disabled}
                    onClick={confirm}
                    className={`w-full py-2 rounded-lg font-semibold ${disabled ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-[#F0B90B] text-black hover:bg-[#F8D12F]"}`}
                >
                    Xác nhận
                </button>
            </div>
        </div>
    );
}

/* ---- Subcomponents ---- */

function RowSelect({ label, items, selectedId, onSelect }) {
    const selectedLabel = items.find((x) => String(x.id) === String(selectedId))?.label || "Quyền chọn";
    return (
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-500 font-medium">{label}</p>
                <p className="text-gray-800 font-semibold text-base">{selectedLabel}</p>
            </div>
            <SimpleDropdown items={items} selectedId={selectedId} onSelect={onSelect} />
        </div>
    );
}

function CoinSelect({ selected, items, onSelect }) {
    const selectedLabel = selected?.name || "Chọn coin";
    return (
        <div className="mt-1">
            <div className="flex items-center border border-gray-300 rounded-lg px-3 py-2">
                {selected?.logo && <img src={selected.logo} alt={selectedLabel} className="w-6 h-6 mr-2" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                <span className="text-gray-800 font-medium">{selectedLabel}</span>
                <div className="ml-auto">
                    <SimpleDropdown
                        items={items}
                        selectedId={selected?.key}
                        onSelect={onSelect}
                        align="left"
                        fullWidth
                        searchable
                        renderItem={(it, active) => (
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                    {it.logo && <img src={it.logo} alt={it.label} className="w-6 h-6" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                                    <div className="flex flex-col">
                                        <span className={`text-[15px] ${active ? "font-medium text-gray-900" : "text-gray-800"}`}>{it.label}</span>
                                        {it.subLabel && <span className="text-xs text-gray-500">{it.subLabel}</span>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-gray-900 tabular-nums">{Number(it.balance || 0).toFixed(4)}</div>
                                </div>
                            </div>
                        )}
                        showCheck
                    />
                </div>
            </div>
        </div>
    );
}

function SimpleDropdown({
    items = [], selectedId, onSelect,
    align = "left",
    fullWidth = true,
    searchable = false,
    showCheck = true,
    renderItem,
    theme = "light",
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const btnRef = useRef(null);
    const panelRef = useRef(null);
    const [w, setW] = useState(0);

    const isDark = theme === "dark";
    const panelBg = isDark ? "bg-[#0E1116] text-gray-200" : "bg-white text-gray-900";
    const border = isDark ? "border border-[#2A2F3A]" : "border border-gray-200";
    const hover = isDark ? "hover:bg-[#171C23]" : "hover:bg-gray-50";
    const inputBg = isDark ? "bg-[#0E1116] placeholder-gray-400 text-gray-200 border-[#2A2F3A]" : "bg-white placeholder-gray-400 text-gray-800 border-gray-200";

    useEffect(() => {
        if (!btnRef.current) return;
        const ro = new ResizeObserver(() => setW(btnRef.current.getBoundingClientRect().width));
        ro.observe(btnRef.current);
        setW(btnRef.current.getBoundingClientRect().width);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const onDoc = (e) => {
            if (!panelRef.current || !btnRef.current) return;
            if (!panelRef.current.contains(e.target) && !btnRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const filtered = useMemo(() => {
        if (!searchable || !q) return items;
        const s = q.toLowerCase();
        return items.filter(it =>
            String(it.label || "").toLowerCase().includes(s) ||
            String(it.subLabel || "").toLowerCase().includes(s)
        );
    }, [items, q, searchable]);

    return (
        <div className="relative">
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-md hover:bg-gray-100/50"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" className={`${isDark ? "text-gray-300" : "text-gray-600"}`}>
                    <path fill="currentColor" d="M7 10l5 5 5-5z" />
                </svg>
            </button>

            {open && (
                <div
                    ref={panelRef}
                    className={`absolute mt-2 rounded-xl shadow-2xl ${panelBg} ${border}`}
                    style={{
                        width: fullWidth ? Math.max(260, w) : 260,
                        right: 0,                 // neo bên phải để bung sang trái, không vượt modal
                        maxHeight: "20rem",
                        overflowY: "auto",
                        zIndex: 30,
                    }}
                >
                    {searchable && (
                        <div className={`p-2 border-b ${border}`}>
                            <input
                                autoFocus
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Tìm kiếm coin"
                                className={`w-full px-3 py-2 rounded-md outline-none border ${inputBg}`}
                            />
                        </div>
                    )}

                    <ul className="max-h-80 overflow-auto py-2">
                        {filtered.map((it) => {
                            const active = String(it.id) === String(selectedId);
                            return (
                                <li key={it.id}>
                                    <button
                                        type="button"
                                        onClick={() => { onSelect(it.id); setOpen(false); setQ(""); }}
                                        className={`w-full px-3 py-2 text-left ${hover}`}
                                    >
                                        {renderItem ? (
                                            renderItem(it, active, isDark)
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <span className={`${active ? (isDark ? "text-white" : "text-gray-900") + " font-medium" : (isDark ? "text-gray-200" : "text-gray-800")}`}>{it.label}</span>
                                                {showCheck && active && (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" className={isDark ? "text-white" : "text-gray-900"}>
                                                        <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                                    </svg>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
