import React from "react";

export default function NewsDeleteForm({ open, deleteId, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-center mb-3">Xác nhận xóa?</h3>
        <p className="text-sm text-gray-600 mb-4">
          Bạn có chắc muốn xóa bài #{deleteId}?
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 bg-gray-200 py-2 rounded hover:bg-gray-300"
            onClick={onCancel}
          >
            Hủy
          </button>
          <button
            className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700"
            onClick={onConfirm}
          >
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}