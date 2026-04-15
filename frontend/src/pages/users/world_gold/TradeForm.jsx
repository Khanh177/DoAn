import React, { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import api from "../../../api/axios";
import SuccessModal from "../../../layouts/SuccessModal";
import ErrorModal from "../../../layouts/ErrorModal";

export default function TradeForm({ wallet, onWalletChange, currentPrice, onTradeSuccess, wsMessage }) {
    const [orderType, setOrderType] = useState("market");
    const [tradeType, setTradeType] = useState("buy");
    const [inputValue, setInputValue] = useState("");
    const [limitPrice, setLimitPrice] = useState("");
    const [showGuide, setShowGuide] = useState(false);
    const [loading, setLoading] = useState(false);

    const [okOpen, setOkOpen] = useState(false);
    const [okMsg, setOkMsg] = useState("");
    const [errOpen, setErrOpen] = useState(false);
    const [errMsg, setErrMsg] = useState("");

    const handledExecIdsRef = useRef(new Set());

    // Xử lý WebSocket message từ parent
    useEffect(() => {
        if (!wsMessage) return;

        try {
            // Ví cập nhật - bổ sung reserved và available
            if (wsMessage.type === "wallet_update") {
                const b = Number(wsMessage.balance);
                const g = Number(wsMessage.gold_world_balance);
                const resUsd = Number(wsMessage.reserved_usd || 0);
                const resXau = Number(wsMessage.reserved_xau || 0);
                const availUsd = Number(wsMessage.available_usd);
                const availXau = Number(wsMessage.available_xau);

                onWalletChange?.({
                    so_du_tien: Number.isFinite(b) ? b : wallet.so_du_tien,
                    luong_vang: Number.isFinite(g) ? g : wallet.luong_vang,
                    reserved_usd: Number.isFinite(resUsd) ? resUsd : wallet.reserved_usd,
                    reserved_xau: Number.isFinite(resXau) ? resXau : wallet.reserved_xau,
                    available_usd: Number.isFinite(availUsd) ? availUsd : wallet.available_usd,
                    available_xau: Number.isFinite(availXau) ? availXau : wallet.available_xau,
                });
            }

            // Lệnh LIMIT khớp → hiện modal realtime
            if (wsMessage.type === "spot_limit_filled" && wsMessage.data) {
                const exec = wsMessage.data;
                const execId = exec.id;

                if (!handledExecIdsRef.current.has(execId)) {
                    handledExecIdsRef.current.add(execId);

                    const side = String(exec.trade_type || "").toLowerCase() === "buy" ? "Mua" : "Bán";
                    const p = Number(exec.price || 0);
                    const q = Number(exec.qty_xau || 0);
                    const ts = exec.executed_at
                        ? new Date(exec.executed_at).toLocaleString("vi-VN")
                        : "";

                    setOkMsg(`Khớp lệnh giới hạn thành công: ${side} ${q.toFixed(5)} XAU @ $${p.toFixed(2)} (${ts})`);
                    setOkOpen(true);
                    onTradeSuccess?.();
                }
            }

            // Các sự kiện khác
            if (wsMessage.type === "spot_exec" ||
                wsMessage.type === "spot_order" ||
                wsMessage.type === "spot_refresh") {
                onTradeSuccess?.();
            }
        } catch (e) {
            console.error("WS message error:", e);
        }
    }, [wsMessage, onTradeSuccess, onWalletChange, wallet]);

    // Tính toán hiển thị
    const FEE_TAKER = 0.0008;
    const isBuying = tradeType === "buy";
    const isMarket = orderType === "market";
    const usd = Number(wallet.so_du_tien || 0);
    const xau = Number(wallet.luong_vang || 0);
    const priceEff = isMarket ? Number(currentPrice || 0) : Number(limitPrice || 0);

    const qty = isBuying
        ? inputValue && priceEff ? Number(inputValue) / priceEff : 0
        : Number(inputValue || 0);

    const totalUSD = isBuying
        ? Number(inputValue || 0)
        : inputValue && priceEff ? Number(inputValue) * priceEff : 0;

    const estFeeUSD = isMarket ? totalUSD * FEE_TAKER : Math.max(totalUSD * 0.0002, 0);

    const openOk = (msg) => { setOkMsg(msg); setOkOpen(true); };
    const openErr = (msg) => { setErrMsg(msg); setErrOpen(true); };

    // Submit
    const handleTrade = async () => {
        const v = Number(inputValue);
        if (!Number.isFinite(v) || v <= 0) return openErr("Nhập số hợp lệ");

        if (!isMarket) {
            const lp = Number(limitPrice);
            if (!Number.isFinite(lp) || lp <= 0) return openErr("Nhập giá giới hạn hợp lệ");
        }

        setLoading(true);
        try {
            if (isMarket) {
                // MARKET: mở modal ngay
                if (isBuying) {
                    const res = await api.post("/spot/world/market/buy", {
                        amount_usd: v,
                        slippage_bps: 5
                    });
                    if (res.data?.id) openOk("Mua thị trường thành công");
                } else {
                    const res = await api.post("/spot/world/market/sell", {
                        qty_xau: v,
                        slippage_bps: 5
                    });
                    if (res.data?.id) openOk("Bán thị trường thành công");
                }
                onTradeSuccess?.();
            } else {
                // LIMIT: KHÔNG mở modal ở đây, chờ WS
                const payload = {
                    side: tradeType,
                    limit_price: Number(limitPrice),
                    qty_xau: isBuying ? null : v,
                    total_usd: isBuying ? v : null,
                };
                await api.post("/spot/world/limit", payload);
                // Không hiện modal success ở đây
                onTradeSuccess?.();
            }

            setInputValue("");
            setLimitPrice("");
        } catch (err) {
            const msg = err?.response?.data?.detail ||
                err?.response?.data ||
                "Giao dịch thất bại";
            openErr(String(msg));
        } finally {
            setLoading(false);
        }
    };

    const handleOk = () => {
        setOkOpen(false);
        onTradeSuccess?.();
    };

    return (
        <div className="bg-white rounded-lg shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2">
                <h1 className="font-bold text-2xl">Giao dịch</h1>
                <button
                    onClick={() => setShowGuide(true)}
                    className="text-gray-600 hover:text-blue-600"
                >
                    <HelpCircle className="w-5 h-5" />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-0 p-2 bg-gray-50">
                <button
                    onClick={() => setTradeType("buy")}
                    className={`py-2.5 font-bold rounded-lg ${isBuying
                            ? "bg-green-500 text-white"
                            : "bg-white text-gray-600"
                        }`}
                >
                    Mua
                </button>
                <button
                    onClick={() => setTradeType("sell")}
                    className={`py-2.5 font-bold rounded-lg ${!isBuying
                            ? "bg-red-500 text-white"
                            : "bg-white text-gray-600"
                        }`}
                >
                    Bán
                </button>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-auto">
                <div>
                    <label className="block text-sm font-medium mb-2">Loại lệnh</label>
                    <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value)}
                        className="w-full border-2 px-3 py-2 rounded-lg"
                    >
                        <option value="market">Thị trường</option>
                        <option value="limit">Giới hạn</option>
                    </select>
                </div>

                {orderType === "limit" && (
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Giá kích hoạt
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            placeholder="Nhập giá"
                            value={limitPrice}
                            onChange={(e) => setLimitPrice(e.target.value)}
                            className="w-full border-2 px-4 py-2.5 rounded-lg"
                        />
                    </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-600 mb-1">Giá thị trường</div>
                    <div className="text-2xl font-bold">
                        ${Number(currentPrice || 0).toLocaleString()}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2">
                        {isBuying ? "Số tiền mua (USD)" : "Số lượng bán (XAU)"}
                    </label>
                    <input
                        type="number"
                        step="0.0001"
                        placeholder={isBuying ? "Nhập USD" : "Nhập XAU"}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="w-full border-2 px-4 py-2.5 rounded-lg"
                    />
                    <div className="mt-2 text-right text-sm text-gray-600">
                        {isBuying
                            ? `≈ ${qty.toFixed(5)} XAU`
                            : `≈ $${totalUSD.toFixed(2)}`
                        }
                    </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                        <span>Khả dụng</span>
                        <span className="font-semibold">
                            {isBuying
                                ? `$${usd.toLocaleString()}`
                                : `${xau.toFixed(5)} XAU`
                            }
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span>Phí ước tính</span>
                        <span className="font-semibold">${estFeeUSD.toFixed(2)}</span>
                    </div>
                </div>

                <button
                    onClick={handleTrade}
                    disabled={loading}
                    className={`w-full py-3.5 rounded-lg font-bold text-white ${isBuying
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-red-600 hover:bg-red-700"
                        } disabled:opacity-50`}
                >
                    {loading ? "Đang xử lý..." : isBuying ? "Mua XAU" : "Bán XAU"}
                </button>
            </div>

            {showGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl">
                        <div className="flex items-center justify-between px-5 py-3 border-b">
                            <div className="font-semibold">Hướng dẫn giao dịch Spot vàng</div>
                            <button onClick={() => setShowGuide(false)}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 text-sm">
                            <section>
                                <h4 className="font-semibold mb-1">1) Khái niệm</h4>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li><b>Thị trường</b>: khớp ngay theo giá hiện tại</li>
                                    <li><b>Giới hạn</b>: đặt giá mong muốn, chờ khớp</li>
                                </ul>
                            </section>
                            <section>
                                <h4 className="font-semibold mb-1">2) Phí giao dịch</h4>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Thị trường: 0.08%</li>
                                    <li>Giới hạn: 0.02%</li>
                                </ul>
                            </section>
                        </div>
                        <div className="px-5 py-3 border-t flex justify-end">
                            <button
                                onClick={() => setShowGuide(false)}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white"
                            >
                                Đã hiểu
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SuccessModal open={okOpen} message={okMsg} onOk={handleOk} />
            <ErrorModal open={errOpen} message={errMsg} onClose={() => setErrOpen(false)} />
        </div>
    );
}