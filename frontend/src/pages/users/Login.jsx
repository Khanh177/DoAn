import React, { useRef, useState } from 'react';
import { FaGoogle } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import api from "../../api/axios";

export default function DangNhap() {
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [pendingUserId, setPendingUserId] = useState(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [resendOpen, setResendOpen] = useState(false);
    const [resendMsg, setResendMsg] = useState('');
    const navigate = useNavigate();
    const otpRefs = Array.from({ length: 6 }, () => useRef(null));

    const validate = () => {
        const e = {};
        if (!formData.username.trim()) e.username = 'Email/Số điện thoại không được để trống';
        if (!formData.password.trim()) e.password = 'Mật khẩu không được để trống';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleLogin = async () => {
        if (!validate()) return;
        setLoading(true);
        setErrors(prev => ({ ...prev, api: undefined }));
        try {
            const { data } = await api.post("/auth/login", {
                username: formData.username.trim(),
                password: formData.password,
            });
            setPendingUserId(data.user_id);
            setShowOtpModal(true);
            setOtpDigits(["", "", "", "", "", ""]);
            setOtpError('');
            setTimeout(() => otpRefs[0].current?.focus(), 0);
        } catch (err) {
            if (!err?.response) {
                setErrors(prev => ({ ...prev, api: "Không thể kết nối server." }));
            } else {
                const { status, data } = err.response;
                const detail = data?.detail;
                if (status === 401) setErrors(prev => ({ ...prev, api: detail || "Sai thông tin đăng nhập" }));
                else if (status === 403) setErrors(prev => ({ ...prev, api: detail || "Tài khoản đã bị khóa" }));
                else setErrors(prev => ({ ...prev, api: detail || "Lỗi hệ thống, vui lòng thử lại." }));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOtpChange = (idx, val) => {
        const v = val.replace(/\D/g, '').slice(0, 1);
        const next = [...otpDigits];
        next[idx] = v;
        setOtpDigits(next);
        if (v && idx < 5) otpRefs[idx + 1].current?.focus();
    };

    const handleOtpKeyDown = (idx, e) => {
        if (e.key === 'Backspace') {
            if (otpDigits[idx]) {
                const next = [...otpDigits];
                next[idx] = '';
                setOtpDigits(next);
            } else if (idx > 0) {
                otpRefs[idx - 1].current?.focus();
            }
        }
        if (e.key === 'ArrowLeft' && idx > 0) otpRefs[idx - 1].current?.focus();
        if (e.key === 'ArrowRight' && idx < 5) otpRefs[idx + 1].current?.focus();
    };

    const handleOtpPaste = (e) => {
        e.preventDefault();
        const clip = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!clip) return;
        const filled = clip.split('').concat(Array(6).fill('')).slice(0, 6);
        setOtpDigits(filled);
        const emptyIdx = filled.findIndex(d => d === '');
        otpRefs[(emptyIdx === -1 ? 5 : emptyIdx)].current?.focus();
    };

    const handleOtpSubmit = async () => {
        setOtpError('');
        const code = otpDigits.join('');
        if (code.length !== 6) {
            setOtpError('Vui lòng nhập mã OTP gồm 6 chữ số.');
            return;
        }
        if (!pendingUserId) {
            setOtpError('Thiếu thông tin phiên đăng nhập. Vui lòng thử lại.');
            return;
        }
        setOtpLoading(true);
        try {
            const { data } = await api.post("/auth/verify-otp", { user_id: pendingUserId, otp: code });
            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("username", data.username);
            localStorage.setItem("user_id", String(data.uid));
            setShowOtpModal(false);
            setShowSuccessModal(true);
        } catch (err) {
            const detail = err?.response?.data?.detail || "OTP không đúng hoặc đã hết hạn";
            setOtpError(detail);
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setOtpError('');
        try {
            await api.post("/auth/resend-otp", { username: formData.username.trim() });
            setResendMsg('Đã gửi lại mã OTP!');
            setResendOpen(true);
        } catch {
            setResendMsg('Không thể gửi lại OTP. Thử lại sau.');
            setResendOpen(true);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div
                className="w-full bg-white max-w-md p-10 rounded-xl shadow-lg"
                onKeyDown={(e) => { if (e.key === 'Enter' && !showOtpModal) handleLogin(); }}
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

                <h1 className="text-3xl font-bold text-left mb-4">Đăng nhập</h1>

                <label className="block mb-2 text-gray-700 font-medium">Email/Số điện thoại</label>
                <input
                    type="email"
                    autoComplete="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.slice(0, 50) })}
                    placeholder="Email/Số điện thoại"
                    className={`w-full px-4 py-2 mb-2 border rounded-md focus:outline-none ${errors.username ? 'border-red-500' : 'focus:ring-2 focus:ring-yellow-500'}`}
                />
                {errors.username && <p className="text-red-500 text-sm mb-3">{errors.username}</p>}

                <label className="block mb-2 text-gray-700 font-medium">Mật khẩu</label>
                <div className="relative">
                    <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value.slice(0, 50) })}
                        placeholder="Mật khẩu"
                        className={`w-full px-4 py-2 mb-2 border rounded-md focus:outline-none ${errors.password ? 'border-red-500' : 'focus:ring-2 focus:ring-yellow-500'}`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                    >
                        {showPassword ? <AiOutlineEyeInvisible size={22} /> : <AiOutlineEye size={22} />}
                    </button>
                </div>
                {errors.password && <p className="text-red-500 text-sm mb-3">{errors.password}</p>}

                {errors.api && <p className="text-red-600 text-sm mb-3">{errors.api}</p>}

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className={`w-full ${loading ? "bg-gray-400" : "bg-yellow-500 hover:bg-yellow-600"} text-white py-2 rounded-md font-semibold transition duration-200 mb-4`}
                >
                    {loading ? 'Đang đăng nhập...' : 'Tiếp theo'}
                </button>

                <div className="flex items-center my-4">
                    <hr className="flex-grow border-gray-300" />
                    <span className="mx-2 text-gray-500">hoặc</span>
                    <hr className="flex-grow border-gray-300" />
                </div>

                <p className="text-center text-sm text-gray-700 mt-6">
                    <Link to="/register" className="text-yellow-500 font-medium hover:underline">
                        Đăng ký tài khoản
                    </Link>
                </p>
            </div>

            {showOtpModal && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
                        <h2 className="text-xl font-semibold mb-2">Xác thực OTP</h2>
                        <p className="text-gray-600 mb-4">Nhập mã xác thực đã gửi đến Email.</p>

                        <div className="flex justify-between mb-2" onPaste={handleOtpPaste}>
                            {otpRefs.map((ref, i) => (
                                <input
                                    key={i}
                                    ref={ref}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={otpDigits[i]}
                                    onChange={(e) => handleOtpChange(i, e.target.value)}
                                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                    className={`w-10 h-12 border rounded-md text-center text-xl ${otpError ? 'border-red-500' : 'focus:ring-2 focus:ring-yellow-500'}`}
                                    maxLength={1}
                                />
                            ))}
                        </div>

                        {otpError && <p className="text-red-500 text-sm mb-2">{otpError}</p>}

                        <button
                            onClick={handleOtpSubmit}
                            className="w-full bg-yellow-500 text-white py-2 rounded-md font-semibold hover:bg-yellow-600 mb-2 disabled:opacity-60"
                            disabled={otpLoading}
                        >
                            {otpLoading ? 'Đang xác thực OTP...' : 'Xác nhận'}
                        </button>

                        <button
                            onClick={handleResendOtp}
                            className="text-blue-500 text-sm underline hover:text-blue-600 disabled:opacity-60"
                            disabled={otpLoading}
                        >
                            Gửi lại mã
                        </button>
                    </div>
                </div>
            )}

            {resendOpen && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
                        <div className="flex justify-center mb-3">
                            <svg className="w-14 h-14 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M9 12l2 2l4 -4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-1">Thông báo</h3>
                        <p className="text-gray-700 mb-4">{resendMsg}</p>
                        <button
                            onClick={() => setResendOpen(false)}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {showSuccessModal && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
                        <div className="flex justify-center mb-4">
                            <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M9 12l2 2l4 -4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold mb-2">Đăng nhập thành công!</h2>
                        <p className="text-gray-600 mb-4">Chào mừng bạn quay trở lại!</p>
                        <button
                            onClick={() => { setShowSuccessModal(false); navigate('/wallet'); }}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
