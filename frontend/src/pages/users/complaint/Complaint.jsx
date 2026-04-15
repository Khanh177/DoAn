// frontend/src/pages/user/Complaint.jsx
import React, { useState, useEffect, useRef } from "react";
import {
    Send,
    Paperclip,
    X,
    Search,
    User,
    AlertCircle,
    FileText,
    Image as ImageIcon,
    Check,
    CheckCheck,
} from "lucide-react";
import Header from "../../../layouts/Header";
import api from "../../../api/axios";

const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

// ===== BADGE / TAG =====

const StatusBadge = ({ status }) => {
    const configs = {
        open: { label: "Mới", dot: "bg-sky-400" },
        in_progress: { label: "Đang xử lý", dot: "bg-amber-400" },
        resolved: { label: "Đã giải quyết", dot: "bg-emerald-400" },
        closed: { label: "Đã đóng", dot: "bg-gray-400" },
        cancelled: { label: "Đã hủy", dot: "bg-rose-400" },
    };
    const cfg = configs[status] || configs.open;
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            <span>{cfg.label}</span>
        </span>
    );
};

const PriorityBadge = ({ priority }) => {
    const configs = {
        low: { label: "Thấp", dot: "bg-gray-400" },
        normal: { label: "Bình thường", dot: "bg-sky-400" },
        high: { label: "Cao", dot: "bg-orange-400" },
        urgent: { label: "Khẩn cấp", dot: "bg-rose-500" },
    };
    const cfg = configs[priority] || configs.normal;
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            <span>{cfg.label}</span>
        </span>
    );
};

const RelatedTypeBadge = ({ type }) => {
    const configs = {
        p2p_trade: { label: "P2P", icon: "💱" },
        deposit: { label: "Nạp tiền", icon: "💰" },
        withdraw: { label: "Rút tiền", icon: "💸" },
        other: { label: "Khác", icon: "📝" },
    };
    const cfg = configs[type] || configs.other;
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
        </span>
    );
};

const TicketCard = ({ ticket, onClick, isActive }) => {
    const timeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return "Vừa xong";
        if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
        return `${Math.floor(seconds / 86400)} ngày trước`;
    };

    return (
        <div
            onClick={onClick}
            className={`p-3 sm:p-4 border-b border-gray-100 cursor-pointer transition-all ${isActive
                ? "bg-sky-50/70 border-l-4 border-l-sky-500"
                : "hover:bg-gray-50"
                }`}
        >
            <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-xs sm:text-sm truncate">
                            {ticket.ticket_code}
                        </span>
                        {ticket.unread_count > 0 && (
                            <span className="bg-rose-500 text-white text-[11px] px-2 py-0.5 rounded-full">
                                {ticket.unread_count}
                            </span>
                        )}
                    </div>
                    <h3 className="font-medium text-gray-900 text-sm sm:text-[15px] line-clamp-2">
                        {ticket.title}
                    </h3>
                </div>
                <div className="text-right">
                    <div className="text-[11px] text-gray-400 mb-1">
                        {ticket.last_message_at && timeAgo(ticket.last_message_at)}
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center mt-1">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
            </div>
            <div className="flex justify-between items-center mt-2">
                <RelatedTypeBadge type={ticket.related_type} />
                {ticket.admin_name && (
                    <div className="text-[11px] text-gray-500">
                        👤 {ticket.admin_name}
                    </div>
                )}
            </div>
        </div>
    );
};

// ===== MESSAGE =====

const MessageStatus = ({ status }) => {
    const s = status || "sent";

    const map = {
        sent: { icon: <Check size={12} />, label: "Đã gửi" },
        delivered: {
            icon: (
                <span className="relative inline-flex">
                    <Check size={12} />
                    <Check size={12} className="-ml-1" />
                </span>
            ),
            label: "Đã nhận",
        },
        read: { icon: <CheckCheck size={12} />, label: "Đã đọc" },
    };
    const cfg = map[s];

    return (
        <div className="flex items-center justify-end gap-1 text-[11px] text-gray-300">
            {cfg.icon}
            <span>{cfg.label}</span>
        </div>
    );
};

const MessageBubble = ({ message, currentUserId, showStatus = false }) => {
    const isOwnMessage = message.sender_id === currentUserId;

    const bubbleClasses = isOwnMessage
        ? "bg-sky-500 text-white"
        : "bg-gray-100 text-gray-900";
    const attachmentClasses = isOwnMessage ? "bg-sky-600" : "bg-gray-200";

    return (
        <div
            className={`flex mb-4 ${isOwnMessage ? "justify-end" : "justify-start"
                }`}
        >
            <div
                className={`max-w-[78%] sm:max-w-[70%] ${isOwnMessage ? "order-2" : "order-1"
                    }`}
            >
                {!isOwnMessage && (
                    <div className="text-xs text-gray-600 mb-1.5 flex items-center gap-1.5">
                        <User size={12} />
                        <span>{message.sender_name}</span>
                        {message.sender_role === "admin" && (
                            <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[11px]">
                                Admin
                            </span>
                        )}
                    </div>
                )}

                <div className={`p-3 rounded-2xl ${bubbleClasses}`}>
                    {message.message && (
                        <p className="text-sm whitespace-pre-wrap">
                            {message.message}
                        </p>
                    )}

                    {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
                            {message.attachments.map((att) => {
                                const key = att.id || att.file_url;

                                if (att.file_type === "image") {
                                    return (
                                        <div
                                            key={key}
                                            className="rounded-xl overflow-hidden bg-black/5"
                                        >
                                            <img
                                                src={att.file_url}
                                                alt={
                                                    att.file_name ||
                                                    "Ảnh đính kèm"
                                                }
                                                className="max-h-72 rounded-xl object-contain"
                                            />
                                            {att.file_name && (
                                                <div className="mt-1 text-[11px] opacity-80 truncate">
                                                    {att.file_name}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                if (att.file_type === "video") {
                                    return (
                                        <div
                                            key={key}
                                            className="rounded-xl overflow-hidden bg-black/5"
                                        >
                                            <video
                                                controls
                                                src={att.file_url}
                                                className="max-h-72 rounded-xl"
                                            />
                                            {att.file_name && (
                                                <div className="mt-1 text-[11px] opacity-80 truncate">
                                                    {att.file_name}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <a
                                        key={key}
                                        href={att.file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`flex items-center gap-2 p-2 rounded-xl text-xs ${attachmentClasses}`}
                                    >
                                        <FileText size={16} />
                                        <span className="truncate">
                                            {att.file_name || "File đính kèm"}
                                        </span>
                                        {att.file_size && (
                                            <span className="opacity-80">
                                                ({Math.round(
                                                    att.file_size / 1024,
                                                )}{" "}
                                                KB)
                                            </span>
                                        )}
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center mt-1">
                    <div className="text-[11px] text-gray-500">
                        {new Date(message.created_at).toLocaleTimeString(
                            "vi-VN",
                            {
                                hour: "2-digit",
                                minute: "2-digit",
                            },
                        )}
                    </div>
                    {isOwnMessage && showStatus && (
                        <MessageStatus status={message.status} />
                    )}
                </div>
            </div>
        </div>
    );
};


// ===== MODAL UPLOAD =====
// (giữ nguyên phần UploadModal, NewTicketModal giống code bạn gửi)

const UploadModal = ({ onClose, onConfirm, initialFiles = [], maxFiles = 5 }) => {
    const [files, setFiles] = useState(initialFiles);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        const selected = Array.from(e.target.files || []);
        if (!selected.length) return;
        const merged = [...files, ...selected];
        if (merged.length > maxFiles) {
            setError(`Tối đa ${maxFiles} file cho mỗi tin nhắn`);
            return;
        }
        setError("");
        setFiles(merged);
    };

    const handleRemove = (index) => {
        const next = files.slice();
        next.splice(index, 1);
        setFiles(next);
    };

    const handleConfirm = () => {
        onConfirm(files);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h3 className="text-sm font-semibold">
                        Đính kèm hình ảnh / file
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-gray-100"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-600 mb-2">
                            Kéo thả file vào đây hoặc chọn từ máy
                        </p>
                        <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-sky-50 text-sky-600 text-sm font-medium cursor-pointer hover:bg-sky-100">
                            <Paperclip size={16} className="mr-2" />
                            Chọn file
                            <input
                                type="file"
                                className="hidden"
                                multiple
                                onChange={handleChange}
                            />
                        </label>
                        <p className="mt-2 text-[11px] text-gray-400">
                            Hỗ trợ ảnh và tài liệu. Tối đa {maxFiles} file.
                        </p>
                    </div>

                    {files.length > 0 && (
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                            {files.map((f, i) => {
                                const isImage = f.type?.startsWith("image/");
                                return (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="p-1.5 rounded-md bg-gray-100">
                                                {isImage ? (
                                                    <ImageIcon size={16} />
                                                ) : (
                                                    <FileText size={16} />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-gray-800 truncate">
                                                    {f.name}
                                                </p>
                                                <p className="text-[11px] text-gray-400">
                                                    {Math.round(f.size / 1024)} KB
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemove(i)}
                                            className="p-1 rounded-full hover:bg-rose-50 text-rose-500"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
                <div className="border-t flex justify-end gap-2 px-4 py-3">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={files.length === 0}
                        className="px-3 py-1.5 rounded-lg text-sm text-white bg-sky-500 hover:bg-sky-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Đính kèm ({files.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

function NewTicketModal({ newTicket, setNewTicket, onClose, onSubmit }) {
    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center px-4 py-3 border-b">
                    <div>
                        <h3 className="text-base font-semibold">Tạo ticket mới</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Vui lòng cung cấp thông tin chi tiết để hỗ trợ nhanh hơn
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-gray-100"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label className="block text-xs font-medium mb-1.5 text-gray-700">
                            Loại vấn đề *
                        </label>
                        <select
                            className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                            value={newTicket.related_type}
                            onChange={(e) =>
                                setNewTicket({
                                    ...newTicket,
                                    related_type: e.target.value,
                                    related_id: "",
                                })
                            }
                        >
                            <option value="p2p_trade">💱 P2P</option>
                            <option value="deposit">💰 Nạp tiền</option>
                            <option value="withdraw">💸 Rút tiền</option>
                            <option value="other">📝 Khác</option>
                        </select>
                    </div>

                    {newTicket.related_type !== "other" && (
                        <div>
                            <label className="block text-xs font-medium mb-1.5 text-gray-700">
                                ID giao dịch *
                            </label>
                            <input
                                type="number"
                                className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                placeholder="Nhập ID giao dịch liên quan..."
                                value={newTicket.related_id}
                                onChange={(e) =>
                                    setNewTicket({
                                        ...newTicket,
                                        related_id: e.target.value,
                                    })
                                }
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium mb-1.5 text-gray-700">
                            Tiêu đề *
                        </label>
                        <input
                            type="text"
                            className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                            placeholder="Mô tả ngắn gọn vấn đề..."
                            value={newTicket.title}
                            onChange={(e) =>
                                setNewTicket({
                                    ...newTicket,
                                    title: e.target.value,
                                })
                            }
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium mb-1.5 text-gray-700">
                            Nội dung chi tiết *
                        </label>
                        <textarea
                            className="w-full border rounded-lg p-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                            placeholder="Mô tả chi tiết vấn đề của bạn..."
                            value={newTicket.message}
                            onChange={(e) =>
                                setNewTicket({
                                    ...newTicket,
                                    message: e.target.value,
                                })
                            }
                        />
                    </div>
                </div>

                <div className="px-4 py-3 border-t flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onSubmit}
                        className="px-3 py-1.5 rounded-lg text-sm text-white bg-sky-500 hover:bg-sky-600"
                    >
                        Tạo ticket
                    </button>
                </div>
            </div>
        </div>
    );
}

// ===== MAIN USER COMPLAINT =====

export default function Complaint() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [userId, setUserId] = useState(null);

    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");

    const [filterStatus, setFilterStatus] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    const [showNewTicketModal, setShowNewTicketModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState([]);

    const [newTicket, setNewTicket] = useState({
        related_type: "p2p_trade",
        related_id: "",
        title: "",
        message: "",
    });

    const messagesEndRef = useRef(null);
    const wsRef = useRef(null);
    const selectedIdRef = useRef(null);

    useEffect(() => {
        selectedIdRef.current = selectedTicket ? selectedTicket.id : null;
    }, [selectedTicket]);

    const uploadAttachment = async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.post("/complaints/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
        return res.data;
    };

    // auth info
    useEffect(() => {
        const token = localStorage.getItem("access_token");
        const uname = localStorage.getItem("username");
        const uid = localStorage.getItem("user_id");
        setIsLoggedIn(!!token);
        if (uname) setUsername(uname);
        if (uid) setUserId(Number(uid));
    }, []);

    // open WS cho user
    useEffect(() => {
        if (!isLoggedIn) return;
        const token = localStorage.getItem("access_token");
        if (!token) return;

        const base =
            WS_BASE.startsWith("ws") || WS_BASE.startsWith("wss")
                ? WS_BASE
                : WS_BASE.replace(/^http/, "ws");

        const wsUrl = `${base}/ws/complaints/user?token=${token}`;
        console.log("🔌 Connecting to WebSocket:", wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("✅ WebSocket connected successfully!");
        };

        ws.onerror = (error) => {
            console.error("❌ WebSocket error:", error);
        };

        ws.onclose = (event) => {
            console.log(`🔌 WebSocket closed: code=${event.code}, reason=${event.reason || 'none'}`);
            wsRef.current = null;
        };

        ws.onmessage = (event) => {
            console.log("📨 WebSocket message received:", event.data);
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }

            if (data.type === "new_message") {
                const { complaint_id, message } = data;
                const selectedId = selectedIdRef.current;

                setTickets((prev) =>
                    prev.map((t) => {
                        if (t.id !== complaint_id) return t;

                        const isActive = selectedId === complaint_id;

                        // tin từ admin (bỏ qua ghi chú nội bộ – user không thấy)
                        const fromAdmin =
                            (message.sender_role === "admin" ||
                                message.sender_role === "ADMIN" ||
                                message.sender_id !== userId) &&
                            !message.is_internal;

                        const unread =
                            !fromAdmin || isActive
                                ? t.unread_count || 0
                                : (t.unread_count || 0) + 1;

                        return {
                            ...t,
                            last_message_at: message.created_at,
                            unread_count: unread,
                        };
                    }),
                );

                if (selectedId === complaint_id) {
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === message.id)) return prev;
                        return [...prev, message];
                    });
                }
            }
            else if (data.type === "ticket_updated") {
                const { ticket_id, status, priority, assigned_to, admin_name } =
                    data;
                setTickets((prev) =>
                    prev.map((t) =>
                        t.id === ticket_id
                            ? {
                                ...t,
                                status,
                                priority,
                                assigned_to,
                                admin_name:
                                    admin_name !== undefined
                                        ? admin_name
                                        : t.admin_name,
                            }
                            : t,
                    ),
                );
                setSelectedTicket((prev) =>
                    prev && prev.id === ticket_id
                        ? {
                            ...prev,
                            status,
                            priority,
                            assigned_to,
                            admin_name:
                                admin_name !== undefined
                                    ? admin_name
                                    : prev.admin_name,
                        }
                        : prev,
                );
            } else if (data.type === "ticket_read") {
                const { complaint_id, by_role, last_message_id } = data;
                const selectedId = selectedIdRef.current;

                // Admin vừa mở ticket -> đánh dấu tin mình gửi là đã đọc
                if (by_role === "admin" && selectedId === complaint_id) {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.sender_id === userId &&
                                (last_message_id == null || m.id <= last_message_id)
                                ? { ...m, status: "read" }
                                : m,
                        ),
                    );
                }
            }
        };

        return () => {
            console.log("🔌 Cleaning up WebSocket connection");
            ws.close();
        };
    }, [isLoggedIn]);

    // load tickets
    useEffect(() => {
        if (!isLoggedIn) return;
        (async () => {
            try {
                const res = await api.get("/complaints/my");
                const data = res.data;
                setTickets(Array.isArray(data.items) ? data.items : data);
            } catch (err) {
                console.error("Load complaints error", err);
            }
        })();
    }, [isLoggedIn]);

    // load messages khi chọn ticket
    useEffect(() => {
        if (!selectedTicket) {
            setMessages([]);
            return;
        }

        (async () => {
            try {
                const res = await api.get(
                    `/complaints/${selectedTicket.id}/messages`,
                );
                const data = res.data;
                setMessages(Array.isArray(data.items) ? data.items : data);
            } catch (err) {
                console.error("Load complaint messages error", err);
            }
        })();
    }, [selectedTicket]);

    // mark as read khi mở ticket
    useEffect(() => {
        if (!selectedTicket) return;
        (async () => {
            try {
                const lastId =
                    messages.length > 0 ? messages[messages.length - 1].id : null;
                await api.post(`/complaints/${selectedTicket.id}/read`, {
                    last_message_id: lastId,
                });
                setTickets((prev) =>
                    prev.map((t) =>
                        t.id === selectedTicket.id
                            ? { ...t, unread_count: 0 }
                            : t,
                    ),
                );
            } catch (e) {
                console.error("Mark complaint as read error", e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTicket]);

    // scroll xuống cuối khi có message mới
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // gửi tin nhắn (HTTP)
    // gửi tin nhắn (HTTP)
    const sendMessage = async () => {
        if (!selectedTicket) return;
        if (!inputMessage.trim() && pendingAttachments.length === 0) return;

        try {
            const uploaded =
                pendingAttachments.length > 0
                    ? await Promise.all(
                        pendingAttachments.map((f) => uploadAttachment(f)),
                    )
                    : [];

            // CHỈ GỬI, KHÔNG setMessages Ở ĐÂY
            await api.post(
                `/complaints/${selectedTicket.id}/messages`,
                {
                    message: inputMessage.trim(),
                    attachments: uploaded,
                },
            );

            setInputMessage("");
            setPendingAttachments([]);

            // ticket.last_message_at, unread_count... sẽ được cập nhật
            // qua WS "new_message" + "ticket_read"
        } catch (err) {
            console.error("Send complaint message error", err);
        }
    };

    // tạo ticket mới
    const createNewTicket = async () => {
        if (!newTicket.title.trim() || !newTicket.message.trim()) {
            alert("Vui lòng điền đầy đủ thông tin");
            return;
        }

        try {
            const body = {
                related_type: newTicket.related_type,
                related_id:
                    newTicket.related_type === "other"
                        ? null
                        : newTicket.related_id
                            ? Number(newTicket.related_id)
                            : null,
                title: newTicket.title.trim(),
                priority: "normal",
                first_message: {
                    message: newTicket.message.trim(),
                    is_internal: false,
                    attachments: [],
                },
            };

            const res = await api.post("/complaints", body);

            const createdTicket = res.data;

            setTickets((prev) => [createdTicket, ...prev]);
            setSelectedTicket(createdTicket);
            setMessages([]);

            setShowNewTicketModal(false);
            setNewTicket({
                related_type: "p2p_trade",
                related_id: "",
                title: "",
                message: "",
            });
        } catch (err) {
            console.error("Create complaint error", err);
            console.log("Backend 422 detail:", err.response?.data);
        }
    };

    const filteredTickets = tickets.filter((t) => {
        const matchStatus = filterStatus === "all" || t.status === filterStatus;
        const q = searchQuery.trim().toLowerCase();
        const matchSearch =
            !q ||
            t.title.toLowerCase().includes(q) ||
            t.ticket_code.toLowerCase().includes(q);
        return matchStatus && matchSearch;
    });

    return (
        <div className="h-screen flex flex-col bg-slate-50">
            <Header
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                username={username}
                setUsername={setUsername}
            />

            <div className="flex-1 flex overflow-hidden px-2 sm:px-4 py-3 sm:py-4">
                <div className="flex-1 max-w-6xl mx-auto bg-white rounded-2xl shadow-lg flex overflow-hidden h-full">
                    {/* LEFT SIDEBAR */}
                    <div className="w-[260px] sm:w-80 border-r border-gray-100 flex flex-col bg-gray-50">
                        <div className="p-3 sm:p-4 border-b border-gray-100 space-y-3 bg-white">
                            <button
                                onClick={() => setShowNewTicketModal(true)}
                                className="w-full bg-sky-500 text-white py-2 rounded-xl hover:bg-sky-600 font-medium text-sm flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                <span className="text-base">＋</span>
                                <span>Tạo ticket mới</span>
                            </button>
                            <div className="relative">
                                <Search
                                    className="absolute left-3 top-2.5 text-gray-400"
                                    size={16}
                                />
                                <input
                                    type="text"
                                    placeholder="Tìm theo mã hoặc tiêu đề..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                />
                            </div>
                            <select
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                value={filterStatus}
                                onChange={(e) =>
                                    setFilterStatus(e.target.value)
                                }
                            >
                                <option value="all">Tất cả trạng thái</option>
                                <option value="open">Mới</option>
                                <option value="in_progress">Đang xử lý</option>
                                <option value="resolved">Đã giải quyết</option>
                                <option value="closed">Đã đóng</option>
                            </select>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {filteredTickets.length === 0 ? (
                                <div className="p-6 text-center text-gray-500">
                                    <AlertCircle
                                        size={40}
                                        className="mx-auto mb-3 text-gray-400"
                                    />
                                    <p className="text-sm">
                                        Không có ticket nào
                                    </p>
                                    <p className="text-xs mt-1 text-gray-400">
                                        Tạo ticket mới để bắt đầu liên hệ hỗ trợ
                                    </p>
                                </div>
                            ) : (
                                filteredTickets.map((ticket) => (
                                    <TicketCard
                                        key={ticket.id}
                                        ticket={ticket}
                                        onClick={() =>
                                            setSelectedTicket(ticket)
                                        }
                                        isActive={
                                            selectedTicket?.id === ticket.id
                                        }
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* RIGHT SIDE */}
                    <div className="flex-1 flex flex-col bg-slate-25">
                        {selectedTicket ? (
                            <>
                                {/* HEADER CHAT */}
                                <div className="bg-white border-b border-gray-100 px-4 py-3">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                <h2 className="font-semibold text-sm sm:text-base truncate">
                                                    {selectedTicket.ticket_code}
                                                </h2>
                                                <StatusBadge
                                                    status={selectedTicket.status}
                                                />
                                                <PriorityBadge
                                                    priority={
                                                        selectedTicket.priority
                                                    }
                                                />
                                            </div>
                                            <p className="text-gray-800 text-sm sm:text-[15px] font-medium line-clamp-2">
                                                {selectedTicket.title}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600">
                                                <RelatedTypeBadge
                                                    type={
                                                        selectedTicket.related_type
                                                    }
                                                />
                                                {selectedTicket.related_id && (
                                                    <span>
                                                        ID liên quan: #
                                                        {
                                                            selectedTicket.related_id
                                                        }
                                                    </span>
                                                )}
                                            </div>
                                            {selectedTicket.admin_name && (
                                                <div className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span>
                                                        Đang được xử lý bởi{" "}
                                                        {
                                                            selectedTicket.admin_name
                                                        }
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* MESSAGES */}
                                <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 bg-slate-50">
                                    {messages.length === 0 ? (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <div className="text-center">
                                                <p className="text-sm font-medium">
                                                    Chưa có tin nhắn nào
                                                </p>
                                                <p className="text-xs mt-1 text-gray-400">
                                                    Gửi tin nhắn đầu tiên để
                                                    bắt đầu cuộc hội thoại với
                                                    hỗ trợ
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        (() => {
                                            const lastOwnId =
                                                userId == null
                                                    ? null
                                                    : [...messages]
                                                        .reverse()
                                                        .find((m) => m.sender_id === userId)?.id;

                                            return messages.map((msg) => (
                                                <MessageBubble
                                                    key={msg.id}
                                                    message={msg}
                                                    currentUserId={userId}
                                                    showStatus={msg.id === lastOwnId}
                                                />
                                            ));
                                        })()
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* INPUT */}
                                <div className="bg-white border-t border-gray-100 px-3 sm:px-4 py-3">
                                    {pendingAttachments.length > 0 && (
                                        <div className="mb-2 flex flex-wrap gap-2">
                                            {pendingAttachments.map(
                                                (f, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-gray-100 text-[11px]"
                                                    >
                                                        {f.type?.startsWith(
                                                            "image/",
                                                        ) ? (
                                                            <ImageIcon
                                                                size={14}
                                                            />
                                                        ) : (
                                                            <FileText
                                                                size={14}
                                                            />
                                                        )}
                                                        <span className="max-w-[120px] truncate">
                                                            {f.name}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                const next =
                                                                    pendingAttachments.slice();
                                                                next.splice(
                                                                    idx,
                                                                    1,
                                                                );
                                                                setPendingAttachments(
                                                                    next,
                                                                );
                                                            }}
                                                            className="text-gray-400 hover:text-rose-500"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    )}
                                    <div className="flex gap-2 items-center">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowUploadModal(true)
                                            }
                                            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-600"
                                            disabled={
                                                selectedTicket.status ===
                                                "closed"
                                            }
                                        >
                                            <Paperclip size={18} />
                                        </button>
                                        <input
                                            type="text"
                                            value={inputMessage}
                                            onChange={(e) =>
                                                setInputMessage(
                                                    e.target.value,
                                                )
                                            }
                                            onKeyDown={(e) =>
                                                e.key === "Enter" &&
                                                !e.shiftKey &&
                                                sendMessage()
                                            }
                                            placeholder={
                                                selectedTicket.status ===
                                                    "closed"
                                                    ? "Ticket đã đóng, không thể gửi thêm tin nhắn"
                                                    : "Nhập tin nhắn..."
                                            }
                                            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-gray-100"
                                            disabled={
                                                selectedTicket.status ===
                                                "closed"
                                            }
                                        />
                                        <button
                                            onClick={sendMessage}
                                            disabled={
                                                selectedTicket.status ===
                                                "closed" ||
                                                (!inputMessage.trim() &&
                                                    pendingAttachments.length ===
                                                    0)
                                            }
                                            className="px-3 sm:px-4 py-2 rounded-xl text-white bg-sky-500 hover:bg-sky-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                                        >
                                            <Send size={18} />
                                        </button>
                                    </div>
                                    {selectedTicket.status === "closed" && (
                                        <p className="text-[11px] text-rose-500 mt-2">
                                            Ticket này đã được đóng. Không thể
                                            gửi tin nhắn mới.
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-500">
                                <div className="text-center px-4">
                                    <AlertCircle
                                        size={48}
                                        className="mx-auto mb-3 text-gray-400"
                                    />
                                    <p className="text-sm sm:text-base font-medium">
                                        Chọn một ticket để xem chi tiết
                                    </p>
                                    <p className="text-xs sm:text-sm mt-1 text-gray-400">
                                        hoặc tạo ticket mới để bắt đầu trao đổi
                                        với bộ phận hỗ trợ
                                    </p>
                                    <button
                                        onClick={() =>
                                            setShowNewTicketModal(true)
                                        }
                                        className="mt-3 px-4 py-2 rounded-xl text-sm text-white bg-sky-500 hover:bg-sky-600"
                                    >
                                        + Tạo ticket mới
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showNewTicketModal && (
                <NewTicketModal
                    newTicket={newTicket}
                    setNewTicket={setNewTicket}
                    onClose={() => setShowNewTicketModal(false)}
                    onSubmit={createNewTicket}
                />
            )}

            {showUploadModal && (
                <UploadModal
                    onClose={() => setShowUploadModal(false)}
                    onConfirm={(files) => setPendingAttachments(files)}
                    initialFiles={pendingAttachments}
                />
            )}
        </div>
    );
}
