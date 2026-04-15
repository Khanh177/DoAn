import React, { useEffect, useState } from "react";
import { X, Copy } from "lucide-react";
import api from "../../../api/axios";
import SuccessModal from "../../../layouts/SuccessModal";

export default function Deposit({ open, onClose, usdToVndRate }) {
    const [showQR, setShowQR] = useState(false);
    const [vndAmount, setVndAmount] = useState("");
    const [usdAmount, setUsdAmount] = useState("");
    const [qrSrc, setQrSrc] = useState("");
    const [depositData, setDepositData] = useState(null);
    const [bank, setBank] = useState(null);
    const [imgLoading, setImgLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Success modal
    const [successOpen, setSuccessOpen] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/vietqr/bank-info");
                setBank(data);
            } catch { }
        })();
    }, []);

    const handleVndChange = (e) => {
        const v = Number(e.target.value || 0);
        setVndAmount(e.target.value);
        setUsdAmount(usdToVndRate > 0 ? (v / usdToVndRate).toFixed(6) : "");
    };

    const buildCdnUrl = (amount, code) => {
        if (!bank?.bank_name || !bank?.account_number) return "";
        const bankCode = encodeURIComponent(bank.bank_name);
        const acct = encodeURIComponent(bank.account_number);
        const amt = Number(amount || 0);
        const info = encodeURIComponent(code || "");
        const accName = encodeURIComponent(bank.receiver_name || "");
        return `https://img.vietqr.io/image/${bankCode}-${acct}-compact.png?amount=${amt}&addInfo=${info}&accountName=${accName}`;
    };

    const handleCreateQR = async () => {
        const amount = parseInt(vndAmount || 0, 10);
        if (!amount || submitting) return;
        setSubmitting(true);
        try {
            const { data } = await api.get("/deposit/code", { params: { length: 10 } });
            const code = data?.deposit_code;
            if (!code) throw new Error("no_code");
            setDepositData({ deposit_code: code });
            setQrSrc(buildCdnUrl(amount, code));
            setShowQR(true);
            setImgLoading(true);
        } catch {
            alert("Không thể tạo mã nạp. Thử lại.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmTransfer = async () => {
        const amount = parseInt(vndAmount || 0, 10);
        const code = depositData?.deposit_code;
        if (!amount || !code || submitting) return;

        setSubmitting(true);
        try {
            const idem = crypto?.randomUUID?.() || String(Date.now());
            const usdt = usdToVndRate > 0 ? amount / usdToVndRate : 0;

            await api.post(
                "/deposit/confirm",
                {
                    amount_vnd: amount,
                    deposit_code: code,
                    usdt_amount: Number(usdt.toFixed(6)),
                    channel: "bank_transfer",
                },
                { headers: { "X-Idempotency-Key": idem } }
            );

            // mở SuccessModal, không đóng ngay
            setSuccessMsg("Yêu cầu nạp đã ghi nhận. Hệ thống sẽ cập nhật sau khi đối soát.");
            setSuccessOpen(true);
        } catch (e) {
            const msg =
                e?.response?.status === 409
                    ? "Mã nạp đã được sử dụng. Vui lòng tạo mã mới."
                    : e?.response?.data?.detail || "Xác nhận thất bại";
            alert(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const closeAll = () => {
        setShowQR(false);
        setVndAmount("");
        setUsdAmount("");
        setQrSrc("");
        setDepositData(null);
        setImgLoading(false);
        setSubmitting(false);
        onClose?.();
    };

    const copyText = async (t) => {
        try {
            await navigator.clipboard.writeText(String(t));
        } catch { }
    };

    // đừng ẩn component khi successOpen đang bật
    if (!open && !showQR && !successOpen) return null;

    return (
        <>
            {/* Success modal nằm trên cùng */}
            <SuccessModal
                open={successOpen}
                message={successMsg}
                onOk={() => {
                    setSuccessOpen(false);
                    closeAll();
                }}
            />

            {open && !showQR && !successOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800">Nạp tiền</h3>
                            <button onClick={closeAll}>
                                <X className="w-5 h-5 text-gray-500 hover:text-gray-700" />
                            </button>
                        </div>

                        <div className="mb-4">
                            <label className="block mb-1 font-medium">Số tiền (VNĐ):</label>
                            <input
                                type="number"
                                value={vndAmount}
                                onChange={handleVndChange}
                                className="w-full border px-3 py-2 rounded"
                                placeholder="Nhập số tiền VNĐ"
                                min="0"
                            />
                            {vndAmount && !isNaN(vndAmount) && (
                                <p className="text-gray-600 mt-1 text-sm">
                                    {parseInt(vndAmount).toLocaleString("vi-VN")} VNĐ
                                </p>
                            )}
                        </div>

                        <div className="mb-6">
                            <label className="block mb-1 font-medium">Tương đương (USD):</label>
                            <input
                                type="text"
                                value={usdAmount}
                                readOnly
                                className="w-full border px-3 py-2 rounded bg-gray-100"
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={handleCreateQR}
                                disabled={!vndAmount || submitting}
                                className="px-4 py-2 bg-[#F0B90B] hover:bg-[#F8D12F] disabled:opacity-60 text-black font-semibold rounded"
                            >
                                {submitting ? "Đang tạo..." : "Xác nhận"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showQR && !successOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800">Quét VietQR để nạp tiền</h3>
                            <button onClick={closeAll}>
                                <X className="w-5 h-5 text-gray-500 hover:text-gray-700" />
                            </button>
                        </div>

                        {depositData?.deposit_code && (
                            <div className="mb-3 flex items-center justify-between bg-gray-50 border rounded px-3 py-2">
                                <div>
                                    <div className="text-xs text-gray-500">Nội dung chuyển khoản</div>
                                    <div className="font-mono font-semibold">{depositData.deposit_code}</div>
                                </div>
                                <button onClick={() => copyText(depositData.deposit_code)} className="p-2 hover:bg-gray-200 rounded">
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <div className="w-full flex justify-center">
                            <img
                                src={qrSrc}
                                alt="VietQR"
                                className="w-64 h-64 mx-auto border rounded object-contain bg-white"
                                onLoad={() => setImgLoading(false)}
                                onError={(e) => {
                                    e.currentTarget.alt = "QR lỗi";
                                    setImgLoading(false);
                                }}
                            />
                        </div>

                        {imgLoading && <div className="text-xs text-gray-500 text-center mt-2">Đang tải QR…</div>}

                        {bank && (
                            <div className="mt-3 text-sm text-gray-700 space-y-1">
                                <div>Ngân hàng: <b>{bank.bank_name}</b></div>
                                <div className="flex items-center gap-2">
                                    <span>Chủ tài khoản: <b>{bank.receiver_name}</b></span>
                                    <button onClick={() => copyText(bank.receiver_name)} className="p-1 hover:bg-gray-200 rounded">
                                        <Copy className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>Số tài khoản: <b>{bank.account_number}</b></span>
                                    <button onClick={() => copyText(bank.account_number)} className="p-1 hover:bg-gray-200 rounded">
                                        <Copy className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="text-sm text-gray-600 mt-3">
                            Số tiền: <b>{Number(vndAmount || 0).toLocaleString("vi-VN")} VNĐ</b>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                            <p className="text-xs text-yellow-800">
                                ⚠️ <b>Lưu ý:</b> Chuyển đúng số tiền và ghi nội dung <b>{depositData?.deposit_code}</b>.
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={handleConfirmTransfer}
                                disabled={submitting}
                                className="px-4 py-2 bg-[#F0B90B] hover:bg-[#F8D12F] text-black font-semibold rounded"
                            >
                                {submitting ? "Đang xác nhận..." : "Đã chuyển tiền"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
