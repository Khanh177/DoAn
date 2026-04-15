import React, { useState, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";

const GOLD_TYPE_LABELS = { gold_world_balance: "XAU" };
const FEE_RATE = 0.005;

export default function SellGoldModal({
    open,
    post,
    onClose,
    onSubmit,
    availableGold,
}) {
    const [gold, setGold] = useState("");
    const [bankName, setBankName] = useState("");
    const [accountName, setAccountName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [error, setError] = useState("");
    const [transferCode, setTransferCode] = useState("");
    const [copied, setCopied] = useState(false);

    const generateCode = () =>
        Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");

    useEffect(() => {
        if (open && post) {
            setGold("");
            setBankName("");
            setAccountName("");
            setAccountNumber("");
            setError("");
            setTransferCode(generateCode());
            setCopied(false);
        }
    }, [open, post]);

    if (!open || !post) return null;

    const goldNumber = parseFloat(gold) || 0;
    const totalVnd = goldNumber * post.gia_tien;
    const feeGold = goldNumber * FEE_RATE;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(transferCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleConfirm = () => {
        if (goldNumber <= 0 || isNaN(goldNumber)) return setError("Vui lòng nhập số lượng vàng hợp lệ");
        if (goldNumber > availableGold) return setError(`Chỉ còn ${availableGold.toFixed(5)} lượng khả dụng`);
        if (totalVnd < post.gia_toi_thieu || totalVnd > post.gia_toi_da)
            return setError(`Số tiền phải từ ${post.gia_toi_thieu.toLocaleString()} đến ${post.gia_toi_da.toLocaleString()} VNĐ`);
        if (!bankName.trim() || !accountName.trim() || !accountNumber.trim())
            return setError("Vui lòng nhập đầy đủ thông tin ngân hàng");

        onSubmit({
            gold: goldNumber,
            money: totalVnd,
            feeGold,
            bankInfo: {
                ten_ngan_hang: bankName.trim(),
                ten_chu_tai_khoan: accountName.trim(),
                so_tai_khoan: accountNumber.trim(),
                transfer_note: transferCode,
            },
        });
    };

    const handleMax = () => {
        if (availableGold > 0) {
            setGold(availableGold.toString());
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative max-h-screen overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full">
                    <X className="w-5 h-5 text-gray-500" />
                </button>

                <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                    Bán vàng XAU cho người mua
                </h2>

                <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-5 mb-6 border border-red-200">
                    <p className="text-sm text-gray-600">Giá bán hiện tại</p>
                    <p className="text-3xl font-bold text-red-600">
                        {post.gia_tien.toLocaleString()} VNĐ/lượng
                    </p>
                </div>

                <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Số lượng vàng muốn bán (lượng)
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.00001"
                            value={gold}
                            onChange={(e) => setGold(e.target.value)}
                            className="w-full px-4 py-3 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-lg placeholder-gray-400"
                            placeholder="0.00000"
                        />
                        <button
                            type="button"
                            onClick={handleMax}
                            className="absolute inset-y-0 right-2 flex items-center px-3 text-xs font-bold text-yellow-500 hover:text-yellow-400 transition-colors uppercase tracking-wider cursor-pointer"
                        >
                            Tối đa
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-right">
                        Khả dụng: <span className="font-bold">{availableGold.toFixed(5)}</span> lượng
                    </p>
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </div>

                <div className="bg-gray-50 rounded-xl p-5 mb-6 border">
                    <div className="flex justify-between text-lg mb-3">
                        <span className="text-gray-600">Bạn bán:</span>
                        <span className="font-bold">{goldNumber.toFixed(5)} lượng</span>
                    </div>
                    <div className="flex justify-between text-2xl font-bold text-green-600">
                        <span>Bạn nhận:</span>
                        <span>{totalVnd.toLocaleString()} VNĐ</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-4 pt-4 border-t">
                        Phí 0.5% ({feeGold.toFixed(5)} lượng) do <strong>người mua chịu</strong>
                    </p>
                </div>

                <div className="space-y-4 mb-6">
                    <input placeholder="Tên ngân hàng của bạn" value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full px-4 py-3 border rounded-xl" />
                    <input placeholder="Chủ tài khoản" value={accountName} onChange={(e) => setAccountName(e.target.value)} className="w-full px-4 py-3 border rounded-xl" />
                    <input placeholder="Số tài khoản" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-full px-4 py-3 border rounded-xl" />
                </div>

                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-6">
                    <p className="font-bold text-amber-900 mb-3">
                        Người mua chuyển khoản với nội dung:
                    </p>
                    <div className="flex items-center justify-between bg-white rounded-lg px-5 py-4 border-2 border-amber-400">
                        <span className="font-mono text-2xl tracking-widest text-amber-800 select-all">
                            {transferCode}
                        </span>
                        <button onClick={copyToClipboard} className="ml-4 p-2 hover:bg-amber-100 rounded-lg">
                            {copied ? <Check className="w-6 h-6 text-green-600" /> : <Copy className="w-6 h-6 text-amber-700" />}
                        </button>
                    </div>
                    <p className="text-xs text-amber-700 mt-3">
                        Mã này chỉ dùng 1 lần – hệ thống tự động khớp lệnh
                    </p>
                </div>

                <div className="flex gap-4">
                    <button onClick={onClose} className="flex-1 py-4 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
                        Hủy
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex-1 py-4 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 text-white font-bold hover:from-red-700 hover:to-pink-700 shadow-lg text-lg"
                    >
                        Xác nhận bán vàng
                    </button>
                </div>
            </div>
        </div>
    );
}