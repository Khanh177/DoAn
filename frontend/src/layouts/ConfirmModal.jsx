// src/pages/users/P2P/components/ConfirmModal.jsx
import React from "react";
import { HelpCircle } from "lucide-react";

export default function ConfirmModal({ open, title, message, onCancel, onConfirm }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
                <div className="flex items-center mb-4">
                    <HelpCircle className="w-6 h-6 text-yellow-500 mr-2" />
                    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                </div>
                <p className="text-gray-700 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
                    >
                        Xác nhận
                    </button>
                </div>
            </div>
        </div>
    );
}
