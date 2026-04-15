import React from "react";

export default function SuccessModal({ open, message, onOk }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
                <div className="flex justify-center mb-4">
                    <svg
                        className="w-16 h-16 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9 12l2 2l4 -4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Thành công!</h2>
                <p className="text-gray-600 mb-4">{message}</p>
                <button
                    onClick={onOk}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 cursor-pointer"
                >
                    OK
                </button>
            </div>
        </div>
    );
}
