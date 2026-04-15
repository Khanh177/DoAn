import React, { useState, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";

const GOLD_TYPE_LABELS = {
    gold_world_balance: "XAU",
};

const FEE_RATE = 0.005; // 0.5%

export default function BuyGoldModal({ open, post, onClose, onSubmit }) {
    const [amount, setAmount] = useState("");
    const [error, setError] = useState("");
    const [transferCode, setTransferCode] = useState("");
    const [copiedField, setCopiedField] = useState(null);

    const generateCode = () =>
        Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");

    useEffect(() => {
        if (open && post) {
            setAmount("");
            setError("");
            setTransferCode(generateCode());
            setCopiedField(null);
        }
    }, [open, post]);

    if (!open || !post) return null;

    const amountNumber = parseFloat(amount) || 0;
    const goldGross = amountNumber / post.gia_tien;
    const feeGold = goldGross * FEE_RATE;
    const goldNet = goldGross - feeGold;

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleConfirm = () => {
        if (amountNumber < post.gia_toi_thieu || amountNumber > post.gia_toi_da) {
            setError(`Số tiền phải từ ${post.gia_toi_thieu.toLocaleString()} đến ${post.gia_toi_da.toLocaleString()} VNĐ`);
            return;
        }
        setError("");

        onSubmit({
            amount: amountNumber,
            goldAmountGross: goldGross,
            goldAmountNet: goldNet,
            feeGold,
            totalVnd: amountNumber,
            transferCode,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative max-h-screen overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full">
                    <X className="w-5 h-5 text-gray-500" />
                </button>

                <h2 className="text-2xl font-bold text-gray-800 mb-6">
                    Mua vàng ({GOLD_TYPE_LABELS[post.loai_vang] || post.loai_vang})
                </h2>

                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-6 border border-green-100">
                    <p className="text-sm text-gray-600">Giá mua hiện tại</p>
                    <p className="text-3xl font-bold text-green-600">
                        {post.gia_tien.toLocaleString()} VNĐ/lượng
                    </p>
                </div>

                <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Số tiền muốn chi (VNĐ)
                    </label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-lg"
                        placeholder="Nhập số tiền"
                    />
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </div>

                {amountNumber > 0 && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 mb-6 border">
                        <div className="space-y-3 text-lg">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Vàng trước phí:</span>
                                <span className="font-bold">{goldGross.toFixed(5)} lượng</span>
                            </div>
                            <div className="flex justify-between text-red-600">
                                <span>Phí 0.5% (bạn chịu):</span>
                                <span>-{feeGold.toFixed(5)} lượng</span>
                            </div>
                            <div className="flex justify-between text-2xl font-bold text-green-600 pt-3 border-t">
                                <span>Thực nhận:</span>
                                <span>{goldNet.toFixed(5)} lượng</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-5 mb-6">
                    <p className="font-bold text-yellow-900 mb-4">Chuyển khoản đến:</p>
                    <div className="space-y-3 text-lg">
                        <div className="flex justify-between">
                            <span className="text-gray-600">Ngân hàng:</span>
                            <span className="font-semibold">{post.ten_ngan_hang}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Số TK:</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-bold">{post.so_tai_khoan}</span>
                                <button onClick={() => copyToClipboard(post.so_tai_khoan, "stk")}>
                                    {copiedField === "stk" ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-gray-600" />}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">Chủ TK:</span>
                            <span className="font-semibold">{post.ten_chu_tai_khoan}</span>
                        </div>
                        <div className="flex justify-between items-center bg-white rounded-lg px-4 py-3 border-2 border-yellow-400 mt-4">
                            <div>
                                <span className="text-gray-600 block text-sm">Nội dung:</span>
                                <span className="font-mono text-xl tracking-widest text-yellow-800">{transferCode}</span>
                            </div>
                            <button onClick={() => copyToClipboard(transferCode, "code")}>
                                {copiedField === "code" ? <Check className="w-6 h-6 text-green-600" /> : <Copy className="w-6 h-6 text-yellow-700" />}
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleConfirm}
                    disabled={!amountNumber}
                    className="w-full py-5 rounded-xl bg-green-600 text-white text-xl font-bold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-lg"
                >
                    Tôi đã chuyển khoản đúng nội dung
                </button>
            </div>
        </div>
    );
}