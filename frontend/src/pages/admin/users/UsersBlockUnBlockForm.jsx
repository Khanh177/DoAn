import React, { useMemo, useState } from "react";
import api from "../../../api/axios";

export default function UsersBlockToggleModal({ open, user, onClose, onDone }) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const isBlocked = useMemo(() => (user?.banned === 1 || user?.banned === true), [user]);
    const title = isBlocked ? "Bỏ chặn người dùng" : "Chặn người dùng";
    const desc = isBlocked
        ? `Bạn có chắc muốn BỎ CHẶN tài khoản "${user?.username}"?`
        : `Bạn có chắc muốn CHẶN tài khoản "${user?.username}"?`;
    const confirmText = isBlocked ? "Bỏ chặn" : "Chặn";
    const confirmBtnClass = isBlocked
        ? "bg-green-600 hover:bg-green-700"
        : "bg-red-600 hover:bg-red-700";

    const onConfirm = async () => {
        if (!user?.id) return;
        try {
            setSubmitting(true);
            setError("");
            if (isBlocked) {
                await api.post(`/auth/${user.id}/unblock`);
                onDone?.({ type: "unblock", userId: user.id });
            } else {
                await api.post(`/auth/${user.id}/block`);
                onDone?.({ type: "block", userId: user.id });
            }
            onClose?.();
        } catch (err) {
            const msg = err?.response?.data?.detail || err.message || "Lỗi cập nhật trạng thái";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open || !user) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
                <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full
                        bg-yellow-100 text-yellow-600">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>

                <h3 className="text-lg font-semibold text-center mb-2">{title}</h3>
                <p className="text-gray-600 text-center mb-4">{desc}</p>

                {error && <p className="text-sm text-red-600 text-center mb-3">{error}</p>}

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-md hover:bg-gray-400 disabled:opacity-60"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={submitting}
                        className={`flex-1 text-white py-2 rounded-md ${confirmBtnClass} disabled:opacity-60`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
