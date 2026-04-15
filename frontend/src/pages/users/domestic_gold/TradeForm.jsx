// src/pages/domestic_gold/components/TradeForm.jsx
import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import api from "../../../api/axios";
import SuccessModal from "../../admin/components/SuccessModal";
import ErrorModal from "../../admin/components/ErrorModal";

export default function TradeForm({
    selectedBrand,
    instrumentId,
    marketBuyPrice = 0,
    marketSellPrice = 0,
    usdToVndRate = 0,
    showGuide,
    setShowGuide,
    onTraded,
}) {
    const [type, setType] = useState("buy"); // 'buy' | 'sell'
    const [inputValue, setInputValue] = useState("");
    const [loading, setLoading] = useState(false);

    const [usdAvail, setUsdAvail] = useState(0);     // USD khả dụng để mua
    const [xauUnlocked, setXauUnlocked] = useState(0); // Lượng đã T+1, được phép bán

    const [errOpen, setErrOpen] = useState(false);
    const [errMsg, setErrMsg] = useState("");
    const [okOpen, setOkOpen] = useState(false);
    const [okMsg, setOkMsg] = useState("");

    const MAX_VND = 500_000_000;

    const isBuying = type === "buy";
    const price = Number(isBuying ? marketBuyPrice : marketSellPrice);
    const rate = Number(usdToVndRate || 0);

    // ===== Helpers (BUY) =====
    const sanitizeInt = (s) => (s || "").replace(/\D+/g, "");
    const clampVND = (n) => Math.max(0, Math.min(MAX_VND, n || 0));
    const fmtVND = (n) => (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
    const parseVND = (s) => clampVND(Number(sanitizeInt(s)));

    function onChangeBuy(e) {
        const n = parseVND(e.target.value);
        setInputValue(fmtVND(n));
    }
    function onPasteBuy(e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text") || "";
        const n = parseVND(text);
        setInputValue(fmtVND(n));
    }

    // ===== Helpers (SELL) =====
    const sanitizeSellLoose = (s) => {
        if (!s) return "";
        let t = String(s).replace(/[^0-9.]/g, "");
        const i = t.indexOf(".");
        if (i !== -1) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "");
        if (t.startsWith(".")) t = "0" + t;
        t = t.replace(/-/g, "");
        return t;
    };
    function onChangeSell(e) {
        setInputValue(sanitizeSellLoose(e.target.value));
    }
    function onPasteSell(e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text") || "";
        setInputValue(sanitizeSellLoose(text));
    }

    // ===== Derived numbers =====
    const v = isBuying
        ? parseVND(inputValue)
        : (inputValue === "" || inputValue === ".") ? 0 : Number(inputValue);

    const qty = isBuying ? (price > 0 ? v / price : 0) : v;
    const totalVND = isBuying ? v : qty * price;
    const totalUSD = rate > 0 ? totalVND / rate : 0;

    // Submit conditions
    const hasValidQty = isBuying ? v > 0 : qty > 0;
    const canSubmit =
        !!instrumentId &&
        price > 0 &&
        hasValidQty &&
        !loading &&
        (!isBuying ? xauUnlocked > 0 && qty <= xauUnlocked + 1e-9 : true);

    // ===== API: available balances =====
    async function refreshAvailable() {
        if (!instrumentId) return;
        const { data } = await api.get("/domestic-gold/spot/available", {
            params: { instrument_id: instrumentId },
        });
        setUsdAvail(Number(data.usd_balance || 0));
        setXauUnlocked(Number(data.unlocked_xau || 0));
    }
    useEffect(() => {
        refreshAvailable().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instrumentId]);

    function setErr(m) { setErrMsg(m); setErrOpen(true); }
    function setOk(m) { setOkMsg(m); setOkOpen(true); }

    // ===== Submit =====
    async function handleTrade() {
        if (!instrumentId) return setErr("Thiếu instrument_id.");
        if (!Number.isFinite(price) || price <= 0) return setErr("Giá thị trường không khả dụng.");

        try {
            setLoading(true);

            if (isBuying) {
                const usdNeeded = Math.floor(v) / Math.max(rate, 1);
                if (usdNeeded > usdAvail + 1e-6) {
                    setLoading(false);
                    return setErr("Số dư USD không đủ.");
                }

                const resp = await api.post(
                    "/domestic-gold/spot/buy",
                    { instrument_id: instrumentId, amount_vnd: Math.floor(v) },
                    { headers: { "Idem-Key": `buy-${instrumentId}-${Date.now()}` } }
                );
                setOk(`Mua thành công ${Number(resp.data.qty_xau).toFixed(6)} Lượng`);

            } else {
                // SELL: chặn trước 24h bằng unlocked_xau
                const qtyXau = Number((qty || 0).toFixed(6));
                if (qtyXau <= 0) {
                    setLoading(false);
                    return setErr("Số lượng bán phải > 0.");
                }
                if (qtyXau > xauUnlocked + 1e-9) {
                    setLoading(false);
                    return setErr("Số lượng mở bán không đủ (T+1).");
                }

                const resp = await api.post(
                    "/domestic-gold/spot/sell",
                    { instrument_id: instrumentId, qty_xau: qtyXau, allow_partial: true },
                    { headers: { "Idem-Key": `sell-${instrumentId}-${Date.now()}` } }
                );
                setOk(
                    `Bán thành công ${Number(resp.data.qty_xau).toFixed(6)} Lượng, nhận ròng ${Number(
                        resp.data.net_vnd
                    ).toLocaleString("en-US")} VND.`
                );
            }

            setInputValue("");
            await refreshAvailable();
            if (typeof onTraded === "function") await onTraded();
        } catch (e) {
            const msg = e?.response?.data?.detail || "Giao dịch thất bại.";
            setErr(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <div className="relative space-y-3">
                {/* Tabs */}
                <div className="flex border-b mb-2">
                    <button
                        onClick={() => { setType("buy"); setInputValue(""); }}
                        className={`flex-1 py-2 font-bold rounded-t ${isBuying ? "bg-green-500 text-white" : "bg-gray-100"}`}
                    >
                        Mua
                    </button>
                    <button
                        onClick={() => { setType("sell"); setInputValue(""); }}
                        className={`flex-1 py-2 font-bold rounded-t ${!isBuying ? "bg-red-500 text-white" : "bg-gray-100"}`}
                    >
                        Bán
                    </button>
                </div>

                {/* Policy summary */}
                <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-2">
                    T+1 (≥24h) mới bán. Trước 24h: không thể bán. Band ±0.5%/ngày. Phí bán sau T+1: 0.2%.
                </div>

                {/* Input */}
                <label className="block mb-1">
                    {isBuying ? "Nhập số tiền (VND)" : "Số lượng (Lượng/XAU)"}
                </label>

                {isBuying ? (
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={inputValue}
                        onChange={onChangeBuy}
                        onPaste={onPasteBuy}
                        placeholder="VD: 100,000,000"
                        className="w-full border px-3 py-2 rounded"
                    />
                ) : (
                    <input
                        type="text"
                        inputMode="decimal"
                        value={inputValue}
                        onChange={onChangeSell}
                        onPaste={onPasteSell}
                        placeholder="VD: 0.500000"
                        className="w-full border px-3 py-2 rounded"
                    />
                )}

                {/* USD preview */}
                <label className="block mb-1">Số tiền (USD)</label>
                <input
                    type="text"
                    readOnly
                    className="w-full border px-3 py-2 rounded bg-gray-100"
                    value={
                        Number.isFinite(totalUSD)
                            ? totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "0.00"
                    }
                />

                {/* Derived hint */}
                <div className="text-right text-gray-500">
                    {isBuying
                        ? `≈ ${Number.isFinite(price) && price > 0 ? ((v / price) || 0).toFixed(6) : "0.000000"} Lượng`
                        : `≈ ${Number.isFinite(totalVND) ? totalVND.toLocaleString("en-US") : "0"} VND`}
                </div>

                {/* Market price */}
                <label className="block mb-1">Giá thị trường (VNĐ/lượng)</label>
                <input
                    type="text"
                    readOnly
                    className="w-full border px-3 py-2 rounded bg-gray-100"
                    value={price ? price.toLocaleString("en-US") : "N/A"}
                />

                {/* Availabilities */}
                <div className="text-xs text-gray-500 space-y-1">
                    {isBuying ? (
                        <>
                            <p>
                                Khả dụng: {(usdAvail * usdToVndRate).toLocaleString("en-US")} VND ≈{" "}
                                {usdAvail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                            </p>
                            <p>
                                Mua tối đa: {price > 0 ? ((usdAvail * usdToVndRate) / price).toFixed(6) : "0.000000"} Lượng
                            </p>
                            <p className="text-[11px] text-gray-500">Tối đa mỗi lệnh: {fmtVND(MAX_VND)} VND.</p>
                        </>
                    ) : (
                        <>
                            <p>Khả dụng bán (đã T+1): {xauUnlocked.toFixed(6)} Lượng ({selectedBrand || "-"})</p>
                            <p>Bán tối đa: {(xauUnlocked * price).toLocaleString("en-US")} VND</p>
                            <p className="text-[11px] text-gray-500">Giá thực nhận có thể chịu band ±0.5%/ngày.</p>
                        </>
                    )}
                </div>

                {/* Submit */}
                <button
                    onClick={handleTrade}
                    className={`w-full py-2 rounded font-bold ${isBuying ? "bg-green-500 text-white" : "bg-red-500 text-white"} hover:opacity-90 disabled:opacity-50`}
                    disabled={!canSubmit}
                    title={
                        !instrumentId ? "Thiếu instrument" :
                            price <= 0 ? "Giá chưa sẵn sàng" :
                                !hasValidQty ? "Nhập số lượng/số tiền > 0" :
                                    (!isBuying && xauUnlocked <= 0) ? "Chưa đủ T+1 để bán" :
                                        (!isBuying && qty > xauUnlocked) ? "Vượt lượng mở bán" :
                                            undefined
                    }
                >
                    {loading ? "Đang xử lý..." : isBuying ? "Mua vàng" : "Bán vàng"}
                </button>
            </div>

            {/* Guide modal */}
            {showGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/30" onClick={() => setShowGuide?.(false)} />
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] mx-4 flex flex-col">
                        <div className="flex items-center justify-between px-6 py-3">
                            <h2 className="text-lg font-semibold">Hướng dẫn giao dịch vàng trong nước (Spot)</h2>
                            <button onClick={() => setShowGuide?.(false)}>
                                <X className="w-5 h-5 text-gray-500 cursor-pointer" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm leading-relaxed">
                            {/* 1) Tổng quan */}
                            <section>
                                <h3 className="font-semibold mb-1">1) Giao dịch gì?</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Mua/Bán vàng theo giá bảng hiện tại của từng thương hiệu (SJC, DOJI, PNJ…).</li>
                                    <li>Đơn vị khối lượng: Lượng (XAU). Thanh toán: VND. Hiển thị quy đổi USD theo tỷ giá hệ thống.</li>
                                    <li>Mua tạo “lô vàng” trong ví Spot. Bán chỉ được phần đã “đến hạn T+1”.</li>
                                </ul>
                            </section>

                            {/* 2) Cách đặt lệnh */}
                            <section>
                                <h3 className="font-semibold mb-1">2) Cách đặt lệnh</h3>
                                <div className="grid gap-2">
                                    <div>
                                        <p className="font-medium">Mua</p>
                                        <ul className="list-disc ml-5 space-y-1">
                                            <li>Nhập số tiền VND. Lượng nhận = VND / Giá mua.</li>
                                            <li>Cần đủ USD khả dụng: USD cần = VND / tỷ giá.</li>
                                            <li>Giới hạn mỗi lệnh: 500.000.000 VND.</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <p className="font-medium">Bán</p>
                                        <ul className="list-disc ml-5 space-y-1">
                                            <li>Nhập số Lượng muốn bán. VND nhận = Lượng × Giá bán.</li>
                                            <li>Chỉ bán phần đã qua T+1. Phần chưa T+1 bị khóa.</li>
                                            <li>Có thể bán một phần, miễn không vượt “Lượng mở bán”.</li>
                                        </ul>
                                    </div>
                                </div>
                            </section>

                            {/* 3) Giá & band */}
                            <section>
                                <h3 className="font-semibold mb-1">3) Giá khớp và biên độ (band)</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Giá tính tại thời điểm đặt lệnh.</li>
                                    <li>Band an toàn: ±0,5%/ngày quanh giá tham chiếu. Vượt band → từ chối lệnh.</li>
                                    <li>Khi bán, giá thực nhận có thể khác nhẹ giá bảng do band.</li>
                                </ul>
                            </section>

                            {/* 4) T+1 & phí */}
                            <section>
                                <h3 className="font-semibold mb-1">4) Thời gian giữ & phí</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Vàng mua bị khóa 24h (T+1). Trước 24h: không thể bán.</li>
                                    <li>Sau T+1 mới được bán. Phí bán: <b>0,2%</b>.</li>
                                </ul>
                            </section>

                            {/* 5) Ví dụ */}
                            <section>
                                <h3 className="font-semibold mb-1">5) Ví dụ nhanh</h3>
                                <div className="rounded border p-3 bg-gray-50">
                                    <p className="font-medium">Mua</p>
                                    <p>Chi 100.000.000 VND, giá mua 85.000.000 → ~ <b>1,176471</b> Lượng.</p>
                                    <hr className="my-2" />
                                    <p className="font-medium">Trong 24h đầu</p>
                                    <p>Vàng đang khóa → <b>không thể bán</b>.</p>
                                    <hr className="my-2" />
                                    <p className="font-medium">Sau 24h (đủ T+1)</p>
                                    <p>Giá bán 86.000.000. Bán 0,500000 Lượng → gốc 43.000.000 VND.</p>
                                    <p>Phí 0,2% = 86.000 → <b>Nhận ròng 42.914.000 VND</b>.</p>
                                </div>
                            </section>

                            {/* 6) Số dư */}
                            <section>
                                <h3 className="font-semibold mb-1">6) Số dư & khả dụng</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li><b>USD khả dụng</b> dùng để mua: USD = VND / tỷ giá.</li>
                                    <li><b>Lượng mở bán</b> là phần vàng đã đủ T+1.</li>
                                    <li>Thiếu số dư → lệnh bị từ chối.</li>
                                </ul>
                            </section>

                            {/* 7) Lỗi thường gặp */}
                            <section>
                                <h3 className="font-semibold mb-1">7) Lỗi thường gặp</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>“Giá thị trường không khả dụng”: giá chưa tải xong hoặc vượt band.</li>
                                    <li>“Số dư USD không đủ”: nạp thêm USD hoặc giảm VND mua.</li>
                                    <li>“Số lượng mở bán không đủ (T+1)”: chờ đủ 24h hoặc giảm khối lượng bán.</li>
                                    <li>“Idem-Key trùng lặp”: lặp lệnh; đợi kết quả hoặc làm mới trang.</li>
                                </ul>
                            </section>

                            {/* 8) Mẹo */}
                            <section>
                                <h3 className="font-semibold mb-1">8) Mẹo nhanh</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Chia nhỏ lệnh khi sát band.</li>
                                    <li>Bán sau T+1 để được phí 0,2%.</li>
                                    <li>Luôn kiểm tra “USD khả dụng” và “Lượng mở bán”.</li>
                                </ul>
                            </section>
                        </div>
                    </div>
                </div>
            )}

            <ErrorModal open={errOpen} message={errMsg} onClose={() => setErrOpen(false)} />
            <SuccessModal open={okOpen} message={okMsg} onOk={() => setOkOpen(false)} />
        </>
    );
}
