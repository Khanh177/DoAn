import React, { useEffect, useState, lazy, Suspense } from "react";
import api from "../../../api/axios";
import { useDropzone } from "react-dropzone";
import "react-quill/dist/quill.snow.css";

// ==== SHIM CHO react-quill cũ (nếu bạn chưa nâng lên react-quill@^2) ====
import { findDOMNode } from "react-dom";
if (typeof window !== "undefined") {
    // react-quill < v2 gọi ReactDOM.findDOMNode -> thêm tạm để tránh crash
    window.ReactDOM = window.ReactDOM || {};
    if (!window.ReactDOM.findDOMNode) window.ReactDOM.findDOMNode = findDOMNode;
}
// =======================================================================

/** Nếu có thể, KHUYẾN NGHỊ nâng cấp:
 *   npm i react-quill@^2 quill@^2
 * Sau khi nâng, phần SHIM ở trên có thể xóa đi.
 */

class ErrorBoundary extends React.Component {
    constructor(p) { super(p); this.state = { hasErr: false }; }
    static getDerivedStateFromError() { return { hasErr: true }; }
    render() { return this.state.hasErr ? this.props.fallback : this.props.children; }
}

const Quill = lazy(() => import("react-quill"));

const quillModules = {
    toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ align: [] }],
        ["link", "image"],
        ["clean"],
    ],
};
const quillFormats = [
    "header", "bold", "italic", "underline", "strike",
    "list", "bullet", "align", "link", "image",
];

// Giới hạn size base64 tạm thời (nếu backend chưa có endpoint upload file)
const MAX_IMAGE_SIZE = 1_000_000; // 1MB

export default function NewsAddEditForm({ open, onClose, initial, onSaved }) {
    const [formData, setFormData] = useState({
        id: null, title: "", description: "", content: "", author: "", image: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!open) return;
        if (initial) {
            setFormData({
                id: initial.id ?? null,
                title: initial.title || "",
                description: initial.description || "",
                content: initial.content || "",
                author: initial.author || "",
                image: initial.image || "",
            });
        } else {
            setFormData({ id: null, title: "", description: "", content: "", author: "", image: "" });
        }
        setErr("");
    }, [open, initial]);

    // --- (Tùy chọn) Upload ảnh thật lên server để lấy URL ---
    // Bật khi backend có /upload (multipart)
    // async function uploadImage(file) {
    //   const fd = new FormData();
    //   fd.append("file", file);
    //   const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
    //   return data.url; // backend trả về { url: "https://..." }
    // }

    const onDrop = async (files) => {
        const f = files?.[0];
        if (!f) return;
        try {
            const fd = new FormData();
            fd.append("file", f);
            const { data } = await api.post("/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setFormData(s => ({ ...s, image: data.url }));
        } catch (e) {
            setErr(e?.response?.data?.detail || "Upload ảnh thất bại.");
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [] },
    });

    if (!open) return null;

    const submit = async () => {
        try {
            setSubmitting(true); setErr("");
            const payload = {
                title: formData.title.trim(),
                description: formData.description.trim(),
                content: (formData.content || "").toString(),
                author: formData.author.trim(),
                image: formData.image || "",
            };
            if (!payload.title) { setErr("Tiêu đề không được để trống"); return; }

            if (formData.id) {
                await api.put(`/news/${formData.id}`, payload);
                onSaved?.({ type: "edit", id: formData.id, title: payload.title });
            } else {
                await api.post("/news/add_news", payload);
                onSaved?.({ type: "add", title: payload.title });
            }
            onClose?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || "Lỗi khi lưu bài viết");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-semibold text-center mb-4">
                    {formData.id ? "Sửa bài viết" : "Thêm bài viết"}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tiêu đề</label>
                        <input
                            value={formData.title}
                            onChange={(e) => setFormData((s) => ({ ...s, title: e.target.value }))}
                            className="border mt-1 block w-full rounded-md border-gray-300 focus:ring-yellow-500 focus:border-yellow-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Mô tả ngắn</label>
                        <textarea
                            rows={2}
                            value={formData.description}
                            onChange={(e) => setFormData((s) => ({ ...s, description: e.target.value }))}
                            className="border mt-1 block w-full rounded-md border-gray-300 focus:ring-yellow-500 focus:border-yellow-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ảnh đại diện</label>
                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition
                ${isDragActive ? "border-yellow-500 bg-yellow-50" : "border-gray-300 hover:bg-gray-50"}`}
                        >
                            <input {...getInputProps()} />
                            {formData.image ? (
                                <img src={formData.image} alt="preview" className="mx-auto h-40 object-contain rounded-md" />
                            ) : (
                                <p className="text-gray-500 text-sm">Kéo ảnh vào hoặc nhấn để chọn ảnh</p>
                            )}
                        </div>

                        {/* Cho phép dán URL ảnh trực tiếp */}
                        <input
                            type="text"
                            placeholder="hoặc dán URL ảnh…"
                            value={formData.image}
                            onChange={(e) => setFormData((s) => ({ ...s, image: e.target.value }))}
                            className="border mt-2 block w-full rounded-md border-gray-300 focus:ring-yellow-500 focus:border-yellow-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tác giả</label>
                        <input
                            value={formData.author}
                            onChange={(e) => setFormData((s) => ({ ...s, author: e.target.value }))}
                            className="border mt-1 block w-full rounded-md border-gray-300 focus:ring-yellow-500 focus:border-yellow-500"
                        />
                    </div>

                    <div className="mb-4"> {/* Thêm mb-4 để tạo khoảng cách dưới phần nội dung */}
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
                        <Suspense fallback={<div className="text-gray-500 text-sm">Đang tải trình soạn thảo…</div>}>
                            <ErrorBoundary
                                fallback={
                                    <textarea
                                        rows={8}
                                        value={formData.content}
                                        onChange={(e) => setFormData((s) => ({ ...s, content: e.target.value }))}
                                        className="block w-full rounded-md border-gray-300 focus:ring-yellow-500 focus:border-yellow-500 h-64 resize-y"
                                    />
                                }
                            >
                                <div className="h-80 border border-gray-300 rounded-md overflow-hidden"> {/* Giữ overflow-hidden để tránh đè chồng */}
                                    <Quill
                                        theme="snow"
                                        value={formData.content || ""}
                                        onChange={(v) => setFormData((s) => ({ ...s, content: v }))}
                                        modules={quillModules}
                                        formats={quillFormats}
                                        className="h-full"
                                    />
                                </div>
                            </ErrorBoundary>
                        </Suspense>
                    </div>

                    {err && <p className="text-red-600 text-sm mb-4">{err}</p>}
                </div>

                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 bg-gray-200 py-2 rounded hover:bg-gray-300">
                        Hủy
                    </button>
                    <button
                        onClick={submit}
                        disabled={submitting}
                        className="flex-1 bg-yellow-500 text-white py-2 rounded hover:bg-yellow-600 disabled:opacity-60"
                    >
                        {formData.id ? "Cập nhật" : "Thêm mới"}
                    </button>
                </div>
            </div>
        </div>
    );
}