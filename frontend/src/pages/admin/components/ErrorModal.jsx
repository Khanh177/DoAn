// src/pages/admin/components/ErrorModal.jsx
import React from "react";

export default function ErrorModal({ open, message, onClose }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
                <h2 className="text-xl font-semibold mb-2 text-red-600">Lỗi</h2>
                <p className="text-gray-700 mb-4">{message}</p>
                <button onClick={onClose} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 cursor-pointer">
                    Đóng
                </button>
            </div>
        </div>
    );
}
