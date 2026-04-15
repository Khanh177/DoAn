import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../../layouts/Header";
import api from "../../api/axios";

const highlight = (text, query) => {
    if (!query) return text;
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${safe})`, "gi"));
    return parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
            ? <mark key={i} className="bg-yellow-200 text-inherit rounded px-0.5">{p}</mark>
            : <span key={i}>{p}</span>
    );
};

export default function News() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [news, setNews] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);

    const [openSuggest, setOpenSuggest] = useState(false);
    const [suggests, setSuggests] = useState([]);
    const [hi, setHi] = useState(-1);
    const debTimer = useRef(null);
    const boxRef = useRef(null);

    const itemsPerPage = 12;
    const totalPages = Math.ceil(news.length / itemsPerPage) || 1;
    const nav = useNavigate();

    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return news.slice(start, start + itemsPerPage);
    }, [news, currentPage]);

    useEffect(() => {
        const uid = localStorage.getItem("user_id");
        const uname = localStorage.getItem("username");
        setIsLoggedIn(!!uid);
        setUsername(uname || "");
        fetchNews();
    }, []);

    useEffect(() => {
        const onClickOutside = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpenSuggest(false);
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    useEffect(() => {
        if (debTimer.current) clearTimeout(debTimer.current);
        if (!searchTerm.trim()) {
            setSuggests([]);
            setOpenSuggest(false);
            return;
        }
        debTimer.current = setTimeout(async () => {
            try {
                const { data } = await api.get("/news/suggest", { params: { q: searchTerm, limit: 8 } });
                setSuggests(Array.isArray(data) ? data : []);
                setOpenSuggest(true);
                setHi(-1);
            } catch {
                setSuggests([]);
                setOpenSuggest(false);
            }
        }, 200);
    }, [searchTerm]);

    const fetchNews = async () => {
        try {
            setLoading(true);
            const { data } = await api.get("/news", { params: { skip: 0, limit: 1000 } });
            setNews(Array.isArray(data) ? data : []);
            setCurrentPage(1);
        } catch {
            setNews([]);
        } finally {
            setLoading(false);
        }
    };

    const search = async (q) => {
        const query = q?.trim();
        if (!query) return fetchNews();
        try {
            setLoading(true);
            const { data } = await api.get("/news/search", { params: { q: query, skip: 0, limit: 1000 } });
            setNews(Array.isArray(data) ? data : []);
            setCurrentPage(1);
        } catch {
            setNews([]);
        } finally {
            setLoading(false);
        }
    };

    const onSubmitSearch = (e) => {
        e.preventDefault();
        if (openSuggest && hi >= 0 && suggests[hi]) {
            setSearchTerm(suggests[hi].title);
            setOpenSuggest(false);
            search(suggests[hi].title);
            return;
        }
        setOpenSuggest(false);
        search(searchTerm);
    };

    const onKeyDown = (e) => {
        if (!openSuggest || suggests.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((v) => (v + 1) % suggests.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((v) => (v <= 0 ? suggests.length - 1 : v - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (hi >= 0 && suggests[hi]) {
                setSearchTerm(suggests[hi].title);
                setOpenSuggest(false);
                search(suggests[hi].title);
            } else {
                setOpenSuggest(false);
                search(searchTerm);
            }
        }
    };

    const paginate = (p) => {
        if (loading) return;
        const clamped = Math.max(1, Math.min(totalPages, p));
        setCurrentPage(clamped);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <div className="bg-gray-100 text-black min-h-screen">
            <Header
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                username={username}
                setUsername={setUsername}
            />

            <main className="max-w-7xl mx-auto px-6 py-10">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Tin tức mới nhất</h1>
                </div>

                <form onSubmit={onSubmitSearch} className="relative mb-6 flex justify-end" ref={boxRef}>
                    <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-full px-4 py-2 shadow-sm hover:shadow-md transition-all duration-200 w-full max-w-md">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={onKeyDown}
                            onFocus={() => { if (suggests.length > 0) setOpenSuggest(true); }}
                            placeholder="Tìm kiếm tin tức..."
                            className="bg-transparent focus:outline-none text-gray-700 placeholder-gray-400 w-full"
                            aria-label="Tìm kiếm tin tức"
                        />
                        <button
                            type="submit"
                            className="bg-yellow-400 hover:bg-yellow-500 text-white p-2 rounded-full transition-colors duration-200 disabled:opacity-60"
                            disabled={loading}
                            aria-label="Tìm"
                            title="Tìm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
                            </svg>
                        </button>
                    </div>

                    {openSuggest && suggests.length > 0 && (
                        <div className="absolute right-0 top-[3.2rem] z-30 w-full max-w-md rounded-2xl border border-gray-100 bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5 overflow-hidden">
                            <div className="px-4 py-2 text-xs font-semibold text-gray-500/80 bg-gray-50 sticky top-0">
                                Gợi ý tìm kiếm
                            </div>
                            <ul className="max-h-80 overflow-auto divide-y divide-gray-100">
                                {suggests.map((it, i) => (
                                    <li
                                        key={it.id}
                                        onMouseDown={() => {
                                            setSearchTerm(it.title);
                                            setOpenSuggest(false);
                                            search(it.title);
                                        }}
                                        onMouseEnter={() => setHi(i)}
                                        className={`px-4 py-2.5 cursor-pointer transition-colors ${hi === i ? "bg-yellow-50" : "hover:bg-gray-50"}`}
                                        title={it.title}
                                        aria-selected={hi === i}
                                    >
                                        <div className="flex items-start gap-3">
                                            <svg className="w-4 h-4 mt-0.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
                                            </svg>
                                            <div className="flex-1 text-sm text-gray-800 line-clamp-1">
                                                {highlight(it.title, searchTerm)}
                                            </div>
                                            <svg className="w-4 h-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); setOpenSuggest(false); search(searchTerm); }}
                                className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-t border-gray-100 flex items-center justify-between"
                            >
                                Xem tất cả kết quả cho “{searchTerm}”
                                <span className="text-gray-400 text-xs">Enter</span>
                            </button>
                        </div>
                    )}
                </form>

                {loading ? (
                    <div className="text-center text-gray-600 py-16">Đang tải…</div>
                ) : news.length === 0 ? (
                    <div className="text-center text-gray-600 py-16">Không có tin phù hợp.</div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                            {currentItems.map((item) => (
                                <div key={item.id} className="bg-white rounded-lg shadow-lg overflow-hidden group">
                                    {item.image && (
                                        <img
                                            src={item.image}
                                            alt={item.title}
                                            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
                                            onError={(e) => (e.currentTarget.style.display = "none")}
                                            loading="lazy"
                                        />
                                    )}
                                    <div className="p-4">
                                        <h2 className="text-xl font-semibold mb-2 line-clamp-2 cursor-pointer text-gray-800 transition-colors duration-300 hover:text-yellow-500">
                                            {item.title}
                                        </h2>
                                        <p className="text-gray-600 text-sm mb-4 line-clamp-3">{item.content}</p>
                                        <div className="flex justify-end mt-2">
                                            <Link
                                                to={`/tintuc/${item.id}`}
                                                className="text-blue-500 hover:text-yellow-500 font-medium transition-colors duration-200"
                                            >
                                                Xem chi tiết
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="flex justify-center mt-8 space-x-2">
                                <button
                                    onClick={() => paginate(currentPage - 1)}
                                    disabled={currentPage === 1 || loading}
                                    className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    &lt;
                                </button>

                                {Array.from({ length: totalPages }).map((_, i) => {
                                    const page = i + 1;
                                    const isNear = Math.abs(page - currentPage) <= 2 || page === 1 || page === totalPages;
                                    const isDots = (page === currentPage - 3 && page > 2) || (page === currentPage + 3 && page < totalPages - 1);

                                    if (isNear)
                                        return (
                                            <button
                                                key={page}
                                                onClick={() => paginate(page)}
                                                disabled={loading}
                                                className={`px-3 py-1 rounded border text-sm font-medium transition-colors ${currentPage === page ? "bg-blue-500 text-white border-blue-500" : "bg-white border-gray-300 hover:bg-gray-50 cursor-pointer"
                                                    } disabled:cursor-not-allowed`}
                                            >
                                                {page}
                                            </button>
                                        );

                                    if (isDots)
                                        return (
                                            <span key={`dots-${page}`} className="px-2 py-1 text-gray-400 select-none">
                                                ...
                                            </span>
                                        );
                                    return null;
                                })}

                                <button
                                    onClick={() => paginate(currentPage + 1)}
                                    disabled={currentPage === totalPages || loading}
                                    className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    &gt;
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
