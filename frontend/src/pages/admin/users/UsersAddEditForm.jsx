import React, { useEffect, useState } from "react";
import api from "../../../api/axios";

export default function UsersAddEditForm({ open, onClose, onSaved, roles, user }) {
    const [form, setForm] = useState({
        id: null,
        first_name: "",
        last_name: "",
        username: "",
        role_id: "",
        password: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [isPasswordFocused, setIsPasswordFocused] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (user) {
            setForm({
                id: user.id,
                first_name: user.first_name || "",
                last_name: user.last_name || "",
                username: user.username || "",
                role_id: user.role_id || "",
                password: "",
            });
        } else {
            setForm({
                id: null,
                first_name: "",
                last_name: "",
                username: "",
                role_id: "",
                password: "",
            });
        }
        setError("");
    }, [open, user]);

    const onChange = (e) => setForm((s) => ({ ...s, [e.target.name]: e.target.value }));

    const onSubmit = async () => {
        try {
            setSubmitting(true);
            if (form.id) {
                const payload = {
                    first_name: form.first_name.trim(),
                    last_name: form.last_name.trim(),
                    role_id: form.role_id ? Number(form.role_id) : null,
                };
                await api.put(`/auth/${form.id}`, payload);
                onSaved?.({ type: "edit" });
            } else {
                const payload = {
                    username: form.username.trim(),
                    password: form.password,
                    first_name: form.first_name.trim(),
                    last_name: form.last_name.trim(),
                    role_id: form.role_id ? Number(form.role_id) : null,
                };
                await api.post("/auth/add_user", payload);
                onSaved?.({ type: "add" });
            }
            onClose?.();
        } catch (err) {
            setError(err?.response?.data?.detail || err.message || "Lỗi lưu user");
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg mx-4 relative">
                <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
                    {form.id ? "Cập nhật User" : "Thêm User mới"}
                </h2>

                <div className="space-y-4">
                    {/* Họ */}
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Họ</label>
                        <input
                            type="text"
                            name="last_name"
                            value={form.last_name}
                            onChange={onChange}
                            placeholder="Nhập họ"
                            className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                            required
                        />
                    </div>

                    {/* Tên */}
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Tên</label>
                        <input
                            type="text"
                            name="first_name"
                            value={form.first_name}
                            onChange={onChange}
                            placeholder="Nhập tên"
                            className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                            required
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Username (email)</label>
                        <input
                            type="email"
                            name="username"
                            value={form.username}
                            onChange={onChange}
                            placeholder="Nhập email"
                            disabled={!!form.id}
                            className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:outline-none ${form.id ? "bg-gray-100 cursor-not-allowed" : ""}`}
                        />
                    </div>

                    {/* Mật khẩu (chỉ khi thêm) */}
                    {!form.id && (
                        <div>
                            <label className="block mb-1 text-gray-700 font-medium">Mật khẩu</label>
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={onChange}
                                onFocus={() => setIsPasswordFocused(true)}
                                onBlur={() => setIsPasswordFocused(false)}
                                placeholder="Nhập mật khẩu (≥8 ký tự)"
                                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                                required
                            />

                            {/* Gợi ý mật khẩu */}
                            <div
                                className={`text-sm text-gray-500 transition-all duration-300 ${
                                    isPasswordFocused
                                        ? "opacity-100 translate-y-0 mt-2"
                                        : "opacity-0 -translate-y-2 h-0 overflow-hidden"
                                }`}
                            >
                                Mật khẩu cần có ít nhất:
                                <ul className="list-disc ml-5 mt-1 space-y-1">
                                    <li>1 chữ hoa (A–Z)</li>
                                    <li>1 chữ thường (a–z)</li>
                                    <li>1 số (0–9)</li>
                                    <li>1 ký tự đặc biệt (!@#$...)</li>
                                    <li>Độ dài 8–30 ký tự</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Role */}
                    <div>
                        <label className="block mb-1 text-gray-700 font-medium">Vai trò</label>
                        <select
                            name="role_id"
                            value={form.role_id}
                            onChange={onChange}
                            className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                            required
                        >
                            <option value="">Chọn role</option>
                            {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="px-5 py-2 rounded-md bg-gray-300 text-gray-800 hover:bg-gray-400 transition disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={submitting}
                        className={`px-5 py-2 rounded-md text-white font-semibold transition ${
                            submitting ? "bg-yellow-500" : "bg-yellow-500 hover:bg-yellow-600"
                        }`}
                    >
                        {form.id ? "Cập nhật" : "Thêm"}
                    </button>
                </div>
            </div>
        </div>
    );
}
