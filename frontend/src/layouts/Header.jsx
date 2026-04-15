// src/layouts/Header.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaUser, FaWallet } from "react-icons/fa";

const Header = () => {
    const navigate = useNavigate();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");

    useEffect(() => {
        const loadAuth = () => {
            const token = localStorage.getItem("access_token");
            const name = localStorage.getItem("username") || "";
            setIsLoggedIn(Boolean(token));
            setUsername(name);
        };
        loadAuth();
        const onStorage = (e) => {
            if (["access_token", "username"].includes(e.key)) loadAuth();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const maskUsername = (name) =>
        !name ? "" : name.length <= 4 ? name : name.slice(0, 2) + "*".repeat(name.length - 4) + name.slice(-2);

    const guardNav = (path) => navigate(isLoggedIn ? path : "/login");

    const guardTo = (path) => (isLoggedIn ? path : "/login");

    const handleWalletClick = () => navigate("/wallet");

    const handleComplaintClick = () => navigate("/complaint");

    const handleLogout = () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user_id");
        localStorage.removeItem("username");
        setIsLoggedIn(false);
        setUsername("");
        navigate("/");
    };

    return (
        <header className="justify-between flex bg-white h-20 py-4 px-8 font-bold">
            <div className="flex items-center gap-10">
                <Link to="/">
                    <img
                        src="https://pagegpt.pro/api/utilities/image/gold-logo-maker/confirmed/1695271930155-15904.png"
                        className="h-28 mix-blend-multiply"
                        alt="Logo"
                    />
                </Link>

                <nav className="hidden sm:inline-block">
                    <ul className="flex gap-3 md:gap-5 lg:gap-10">
                        <li>
                            <Link
                                to={guardTo("/domestic-gold")}
                                className="cursor-pointer hover:text-[#C0B7E8] transition-colors duration-200"
                            >
                                Vàng trong nước
                            </Link>
                        </li>

                        <li>
                            <Link
                                to={guardTo("/world-gold")}
                                className="cursor-pointer hover:text-[#C0B7E8] transition-colors duration-200"
                            >
                                Vàng thế giới
                            </Link>
                        </li>

                        <li className="relative group cursor-pointer">
                            <span className="hover:text-[#C0B7E8] transition-colors duration-200">Giao dịch ▾</span>
                            <ul className="absolute left-0 top-full w-44 bg-white border border-gray-100 shadow-lg rounded-xl py-2 z-40 invisible opacity-0 translate-y-2 transition-all duration-200 ease-out group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 before:content-[''] before:absolute before:-top-3 before:left-0 before:h-3 before:w-full">
                                <li>
                                    <Link
                                        to={isLoggedIn ? "/futures" : "/login"}
                                        className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-[#C0B7E8] rounded-md transition"
                                    >
                                        Futures
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        to={isLoggedIn ? "/p2p" : "/login"}
                                        className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-[#C0B7E8] rounded-md transition"
                                    >
                                        P2P
                                    </Link>
                                </li>
                            </ul>
                        </li>

                        <Link to="/news">
                            <li className="cursor-pointer hover:text-[#C0B7E8] transition-colors duration-200">Tin tức</li>
                        </Link>

                        <li
                            className="cursor-pointer hover:text-[#C0B7E8] transition-colors duration-200"
                            onClick={() => guardNav("/chatbot")}
                        >
                            Dự đoán giá vàng
                        </li>
                    </ul>
                </nav>
            </div>

            <div className="pr-8 flex items-center gap-4 relative">
                {isLoggedIn ? (
                    <>
                        <div className="relative group">
                            <div className="text-xl hover:text-yellow-500 transition-colors cursor-pointer">
                                <FaUser />
                            </div>
                            <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-100 shadow-lg rounded-xl py-2 z-50 invisible opacity-0 translate-y-2 transition-all duration-200 ease-out group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 before:content-[''] before:absolute before:-top-3 before:right-0 before:h-3 before:w-full">
                                <div className="px-4 py-2 border-b border-gray-100 font-semibold text-gray-800 truncate">
                                    {maskUsername(username)}
                                </div>
                                <button
                                    onClick={handleWalletClick}
                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-[#C0B7E8] rounded-md transition-all duration-200"
                                >
                                    Tài sản
                                </button>
                                <button
                                    onClick={handleComplaintClick}
                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-[#C0B7E8] rounded-md transition-all duration-200"
                                >
                                    Chăm sóc khách hàng
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-[#C0B7E8] rounded-md transition-all duration-200"
                                >
                                    Đăng xuất
                                </button>
                            </div>
                        </div>

                        <button onClick={handleWalletClick} className="text-xl hover:text-yellow-500 transition-colors cursor-pointer" aria-label="Tài sản">
                            <FaWallet />
                        </button>
                    </>
                ) : (
                    <div className="flex items-center space-x-3">
                        <Link to="/login">
                            <button className="px-5 py-2.5 border border-yellow-400 text-yellow-600 font-semibold rounded-md hover:bg-yellow-50 transition-all duration-200 shadow-sm hover:shadow-md">
                                Đăng nhập
                            </button>
                        </Link>
                        <Link to="/register">
                            <button className="px-5 py-2.5 bg-gradient-to-r from-yellow-400 to-yellow-500 text-white font-semibold rounded-md hover:from-yellow-500 hover:to-yellow-600 transition-all duration-200 shadow-md hover:shadow-lg">
                                Đăng ký
                            </button>
                        </Link>
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
