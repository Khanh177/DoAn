import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import api from "../../api/axios";

const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,20}$/;

export default function RegisterForm() {
    const [formData, setFormData] = useState({
        ho: '',
        ten: '',
        username: '',
        password: '',
        confirmPassword: '',
        agree: false,
    });
    const [errors, setErrors] = useState({});
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();
    const [isPasswordFocused, setIsPasswordFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const validate = () => {
        const e = {};
        if (!formData.ho.trim()) e.ho = 'Họ không được để trống';
        if (!formData.ten.trim()) e.ten = 'Tên không được để trống';
        if (!formData.username.trim()) e.username = 'Email/Số điện thoại không được để trống';
        if (!formData.password) e.password = 'Mật khẩu không được để trống';
        if (formData.password && !PW_REGEX.test(formData.password)) {
            e.password = 'Mật khẩu cần 8–30 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt';
        }
        if (formData.password !== formData.confirmPassword) {
            e.confirmPassword = 'Mật khẩu không khớp';
        }
        if (!formData.agree) e.agree = 'Vui lòng đồng ý với điều khoản';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;

        const payload = {
            first_name: formData.ho.trim(),
            last_name: formData.ten.trim(),
            username: formData.username.trim(),
            password: formData.password,
            confirm_password: formData.confirmPassword,
        };

        setSubmitting(true);
        setErrors((prev) => ({ ...prev, api: undefined }));

        try {
            await api.post("/auth/register", payload);
            setShowSuccessModal(true);
        } catch (err) {
            // bắt lỗi từ backend
            const detail =
                err?.response?.data?.detail ||
                (Array.isArray(err?.response?.data?.detail) ? err.response.data.detail[0]?.msg : null) ||
                "Có lỗi xảy ra. Vui lòng thử lại.";
            setErrors((prev) => ({ ...prev, api: detail }));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-100 flex items-center justify-center py-12">
            <div
                className="w-full max-w-md p-10 rounded-xl shadow-lg bg-white"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            >
                <Link to="/">
                    <div className="flex items-center justify-center mb-6">
                        <img
                            src="https://pagegpt.pro/api/utilities/image/gold-logo-maker/confirmed/1695271930155-15904.png"
                            alt="Gold Logo"
                            className="h-28 mr-2"
                        />
                    </div>
                </Link>

                <h1 className="text-3xl font-bold text-left mb-4">Đăng ký</h1>

                {/* họ & tên */}
                <div className="flex space-x-4 mb-4">
                    <div className="w-1/2">
                        <label className="block mb-2 text-gray-700 font-medium">Họ</label>
                        <input
                            type="text"
                            value={formData.ho}
                            onChange={(e) => setFormData({ ...formData, ho: e.target.value })}
                            placeholder="Nhập họ"
                            className={`w-full px-4 py-2 border rounded-md focus:outline-none ${errors.ho ? 'border-red-500' : 'focus:ring-2 focus:ring-yellow-500'}`}
                        />
                        {errors.ho && <p className="text-red-500 text-sm mt-1">{errors.ho}</p>}
                    </div>
                    <div className="w-1/2">
                        <label className="block mb-2 text-gray-700 font-medium">Tên</label>
                        <input
                            type="text"
                            value={formData.ten}
                            onChange={(e) => setFormData({ ...formData, ten: e.target.value })}
                            placeholder="Nhập tên"
                            className={`w-full px-4 py-2 border rounded-md focus:outline-none ${errors.ten ? 'border-red-500' : 'focus:ring-2 focus:ring-yellow-500'}`}
                        />
                        {errors.ten && <p className="text-red-500 text-sm mt-1">{errors.ten}</p>}
                    </div>
                </div>

                {/* username */}
                <label className="block mb-2 text-gray-700 font-medium">Email/Số điện thoại</label>
                <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => {
                        const limited = e.target.value.slice(0, 50);
                        setFormData({ ...formData, username: limited });
                    }}
                    placeholder="Email/Số điện thoại (không có mã quốc gia)"
                    className={`w-full px-4 py-2 mb-4 border rounded-md focus:outline-none ${errors.username ? 'border-red-500' : 'focus:ring-2 focus:ring-yellow-500'}`}
                />
                {errors.username && <p className="text-red-500 text-sm mb-4">{errors.username}</p>}

                {/* password */}
                <label className="block mb-2 text-gray-700 font-medium">Mật khẩu</label>
                <div className="relative">
                    <input
                        type={showPassword ? "text" : "password"}
                        maxLength={30}
                        value={formData.password}
                        onChange={(e) => {
                            const limited = e.target.value.slice(0, 30);
                            setFormData({ ...formData, password: limited });
                        }}
                        onFocus={() => setIsPasswordFocused(true)}
                        onBlur={() => setIsPasswordFocused(false)}
                        placeholder="Nhập mật khẩu"
                        className={`w-full px-4 py-2 mb-2 border rounded-md focus:outline-none ${errors.password ? "border-red-500" : "focus:ring-2 focus:ring-yellow-500"}`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                    >
                        {showPassword ? <AiOutlineEyeInvisible size={22} /> : <AiOutlineEye size={22} />}
                    </button>
                </div>

                {/* hint */}
                <div className={`text-sm text-gray-500 transition-all duration-300 ${isPasswordFocused ? "opacity-100 translate-y-0 mb-3" : "opacity-0 -translate-y-2 h-0 overflow-hidden"}`}>
                    Mật khẩu cần có ít nhất:
                    <ul className="list-disc ml-5 mt-1 space-y-1">
                        <li>1 chữ hoa (A–Z)</li>
                        <li>1 chữ thường (a–z)</li>
                        <li>1 số (0–9)</li>
                        <li>1 ký tự đặc biệt (!@#$...)</li>
                        <li>Độ dài 8–30 ký tự</li>
                    </ul>
                </div>
                {errors.password && <p className="text-red-500 text-sm mt-2">{errors.password}</p>}

                {/* confirm password */}
                <label className="block mb-2 text-gray-700 font-medium">Nhập lại mật khẩu</label>
                <div className="relative">
                    <input
                        type={showConfirmPassword ? "text" : "password"}
                        maxLength={30}
                        value={formData.confirmPassword}
                        onChange={(e) => {
                            const limited = e.target.value.slice(0, 30);
                            setFormData({ ...formData, confirmPassword: limited });
                        }}
                        placeholder="Nhập lại mật khẩu"
                        className={`w-full px-4 py-2 mb-4 border rounded-md focus:outline-none ${errors.confirmPassword ? 'border-red-500' : 'focus:ring-2 focus:ring-yellow-500'}`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                    >
                        {showConfirmPassword ? <AiOutlineEyeInvisible size={22} /> : <AiOutlineEye size={22} />}
                    </button>
                </div>
                {errors.confirmPassword && <p className="text-red-500 text-sm mb-4">{errors.confirmPassword}</p>}

                {/* lỗi API */}
                {errors.api && <p className="text-red-600 text-sm mb-3">{errors.api}</p>}

                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={`w-full ${submitting ? "bg-gray-400" : "bg-yellow-500 hover:bg-yellow-600"} text-white py-2 rounded-md font-semibold transition duration-200 mb-4`}
                >
                    {submitting ? "Đang xử lý..." : "Tiếp theo"}
                </button>

                {/* agree */}
                <div className="flex items-start mb-4">
                    <input
                        type="checkbox"
                        id="agree"
                        checked={formData.agree}
                        onChange={(e) => setFormData({ ...formData, agree: e.target.checked })}
                        className="mt-1 mr-2"
                    />
                    <label htmlFor="agree" className="text-sm text-gray-700">
                        Thông qua việc tạo tài khoản, tôi đồng ý với
                        <a href="#" className="text-yellow-500 hover:underline"> Điều khoản dịch vụ </a>
                        và
                        <a href="#" className="text-yellow-500 hover:underline"> Thông báo về quyền riêng tư </a>.
                    </label>
                </div>
                {errors.agree && <p className="text-red-500 text-sm mb-4">{errors.agree}</p>}

                {/* nav */}
                <div className="flex items-center my-4">
                    <hr className="flex-grow border-gray-300" />
                    <span className="mx-2 text-gray-500">hoặc</span>
                    <hr className="flex-grow border-gray-300" />
                </div>
                <Link to="/login">
                    <button className="w-full bg-yellow-500 text-white py-2 rounded-md font-semibold hover:bg-yellow-600 transition duration-200 mb-4">
                        Đăng nhập
                    </button>
                </Link>
            </div>

            {/* Success modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
                        <div className="flex justify-center mb-4">
                            <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                                <path d="M9 12l2 2l4 -4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold mb-2">Đăng ký thành công!</h2>
                        <p className="text-gray-600 mb-4">Chúc mừng bạn đã đăng ký thành công!</p>
                        <button onClick={() => navigate('/login')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
