// frontend/src/pages/admin/ComplaintAdmin.jsx
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
    Lock,
    UserCheck,
    Check,
    CheckCheck,
} from "lucide-react";
import api from "../../../api/axios";

const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

// ===== badges =====

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
        p2p_trade: { label: "P2P Trade", icon: "💱" },
        deposit: { label: "Nạp tiền", icon: "💰" },
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
                    <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                        <User size={11} /> {ticket.user_name}
                    </p>
                    <p className="text-[11px] text-gray-400">
                        {ticket.user_email}
                    </p>
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
                <RelatedTypeBadge type={ticket.related_type} />
            </div>
            <div className="mt-2 text-[11px] flex items-center gap-1">
                {ticket.admin_name ? (
                    <>
                        <UserCheck size={11} className="text-emerald-500" />
                        <span className="text-emerald-600">
                            {ticket.admin_name}
                        </span>
                    </>
                ) : (
                    <>
                        <UserCheck size={11} className="text-amber-500" />
                        <span className="text-amber-600">Chưa assign</span>
                    </>
                )}
            </div>
        </div>
    );
};

// ===== message status =====

const MessageStatus = ({ status }) => {
    const s = status || "sent";

    if (s === "seen" || s === "read") {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-sky-500">
                <CheckCheck size={12} />
                <span>Đã đọc</span>
            </span>
        );
    }
    if (s === "delivered") {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                <Check size={12} />
                <Check size={12} className="-ml-2" />
                <span>Đã nhận</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
            <Check size={12} />
            <span>Đã gửi</span>
        </span>
    );
};

// ===== message bubble admin view =====
const MessageBubble = ({ message, currentUserId, showStatus = false }) => {
    const isOwn = message.sender_id === currentUserId;
    const isInternal = message.is_internal;

    const bubbleClasses = isInternal
        ? "bg-amber-50 border border-amber-200"
        : isOwn
        ? "bg-sky-500 text-white"
        : "bg-gray-100 text-gray-900";

    const attachmentClasses = isOwn ? "bg-sky-600" : "bg-gray-200";

    return (
        <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-4`}>
            <div
                className={`max-w-[78%] sm:max-w-[70%] ${
                    isOwn ? "order-2" : "order-1"
                }`}
            >
                {!isOwn && (
                    <div className="text-xs text-gray-600 mb-1.5 flex items-center gap-1.5">
                        <User size={12} />
                        <span>{message.sender_name}</span>
                        {message.sender_role === "admin" && !isInternal && (
                            <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[11px]">
                                Admin
                            </span>
                        )}
                    </div>
                )}

                <div className={`p-3 rounded-2xl ${bubbleClasses}`}>
                    {isInternal && (
                        <div className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1.5">
                            <Lock size={12} />
                            Ghi chú nội bộ
                        </div>
                    )}

                    {message.message && (
                        <div className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto pr-1">
                            {message.message}
                        </div>
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
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div
                    className={`text-[11px] text-gray-500 mt-1 flex items-center gap-2 ${
                        isOwn ? "justify-end" : ""
                    }`}
                >
                    {new Date(message.created_at).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                    {isOwn && showStatus && (
                        <MessageStatus status={message.status} />
                    )}
                    {isInternal && (
                        <span className="text-amber-600">
                            • Chỉ admin thấy
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};


// ===== MAIN ADMIN COMPLAINT =====

export default function ComplaintAdmin() {
    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [messages, setMessages] = useState([]);

    const [inputMessage, setInputMessage] = useState("");
    const [isInternalNote, setIsInternalNote] = useState(false);

    const [filterStatus, setFilterStatus] = useState("all");
    const [filterPriority, setFilterPriority] = useState("all");
    const [filterAssigned, setFilterAssigned] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    const [previewFiles, setPreviewFiles] = useState([]); // [{file, url}]
    const [showUploadModal, setShowUploadModal] = useState(false);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const [currentAdminId, setCurrentAdminId] = useState(null);
    const [admins, setAdmins] = useState([]);

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

    // lấy admin id từ localStorage nếu có
    useEffect(() => {
        const uid = localStorage.getItem("user_id");
        if (uid) setCurrentAdminId(Number(uid));
    }, []);

    // WebSocket admin
    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        const base =
            WS_BASE.startsWith("ws") || WS_BASE.startsWith("wss")
                ? WS_BASE
                : WS_BASE.replace(/^http/, "ws");

        const wsUrl = `${base}/ws/complaints/admin?token=${token}`;
        console.log("🔌 [Admin] Connecting to WebSocket:", wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        let closedByEffect = false;

        ws.onopen = () => {
            console.log("✅ [Admin] WebSocket connected successfully!");
        };

        ws.onerror = (event) => {
            if (closedByEffect) return; // ignore error do cleanup StrictMode
            console.error("❌ [Admin] WebSocket error:", event);
        };

        ws.onclose = (event) => {
            console.log(
                `🔌 [Admin] WebSocket closed: code=${event.code}, reason=${event.reason || "none"}`,
            );
            wsRef.current = null;
        };

        ws.onmessage = (event) => {
            console.log("📨 [Admin] WebSocket message received:", event.data);
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }

            const selectedId = selectedIdRef.current;

            if (data.type === "new_message") {
                const { complaint_id, message } = data;
                const selectedId = selectedIdRef.current;

                setTickets((prev) =>
                    prev.map((t) => {
                        if (t.id !== complaint_id) return t;

                        let unread = t.unread_count || 0;

                        // tin từ user (không phải ghi chú nội bộ)
                        const fromUser =
                            (message.sender_role === "user" ||
                                message.sender_role === "USER" ||
                                message.sender_id === t.user_id) &&
                            !message.is_internal;

                        if (fromUser && selectedId !== complaint_id) {
                            unread = unread + 1;
                        }

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
            } else if (data.type === "ticket_created") {
                (async () => {
                    try {
                        const res = await api.get("/complaints/admin");
                        const d = res.data;
                        setTickets(Array.isArray(d.items) ? d.items : d);
                    } catch (err) {
                        console.error("Reload tickets after ticket_created error", err);
                    }
                })();
            } else if (data.type === "ticket_read") {
                const { complaint_id, by_role, last_message_id } = data;
                const selectedId = selectedIdRef.current;

                // Admin nào đó (có thể là chính mình) vừa đọc -> xóa badge chưa đọc
                if (by_role === "admin") {
                    setTickets((prev) =>
                        prev.map((t) =>
                            t.id === complaint_id ? { ...t, unread_count: 0 } : t,
                        ),
                    );
                }

                // User đọc -> đánh dấu tin admin gửi là đã đọc
                if (by_role === "user" && selectedId === complaint_id) {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.sender_role === "admin" &&
                                (last_message_id == null || m.id <= last_message_id)
                                ? { ...m, status: "read" }
                                : m,
                        ),
                    );
                }
            }
        };

        return () => {
            console.log("🔌 [Admin] Cleaning up WebSocket connection");
            closedByEffect = true;
            ws.close();
        };
    }, []);

    // load danh sách admin có role_id=1
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get("/complaints/admin/assignees");
                setAdmins(res.data || []);
            } catch (err) {
                console.error("Load complaint assignees error", err);
            }
        })();
    }, []);

    // load danh sách ticket admin (HTTP)
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get("/complaints/admin");
                const data = res.data;
                setTickets(Array.isArray(data.items) ? data.items : data);
            } catch (err) {
                console.error("Load admin complaints error", err);
            }
        })();
    }, []);

    // load messages khi chọn ticket (HTTP)
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
                console.error("Load admin complaint messages error", err);
            }
        })();
    }, [selectedTicket]);

    // mark as read khi admin mở ticket + có messages
    useEffect(() => {
        if (!selectedTicket) return;
        if (!messages.length) return;

        (async () => {
            try {
                const lastId = messages[messages.length - 1].id;
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
                console.error("Admin mark complaint as read error", e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTicket, messages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleUploadChange = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const withPreview = files.map((f) => ({
            file: f,
            url: URL.createObjectURL(f),
        }));
        setPreviewFiles((prev) => [...prev, ...withPreview]);
        setShowUploadModal(true);
    };

    // gửi tin (HTTP)
    const sendMessage = async () => {
        if (!selectedTicket) return;
        if (!inputMessage.trim() && previewFiles.length === 0) return;

        try {
            const uploaded =
                previewFiles.length > 0
                    ? await Promise.all(
                        previewFiles.map((p) => uploadAttachment(p.file)),
                    )
                    : [];

            const res = await api.post(
                `/complaints/${selectedTicket.id}/messages`,
                {
                    message: inputMessage.trim(),
                    is_internal: isInternalNote,
                    attachments: uploaded,
                },
            );
            const saved = res.data;

            setMessages((prev) => [...prev, saved]);
            setTickets((prev) =>
                prev.map((t) =>
                    t.id === selectedTicket.id
                        ? { ...t, last_message_at: saved.created_at }
                        : t,
                ),
            );

            setInputMessage("");
            setIsInternalNote(false);
            setPreviewFiles([]);
            setShowUploadModal(false);
        } catch (err) {
            console.error("Admin send complaint message error", err);
        }
    };

    const updateTicketStatus = async (newStatus) => {
        if (!selectedTicket) return;
        try {
            await api.patch(`/complaints/admin/${selectedTicket.id}`, {
                status: newStatus,
            });

            setTickets((prev) =>
                prev.map((t) =>
                    t.id === selectedTicket.id ? { ...t, status: newStatus } : t,
                ),
            );
            setSelectedTicket((prev) =>
                prev ? { ...prev, status: newStatus } : prev,
            );
        } catch (err) {
            console.error("Update ticket status error", err);
        }
    };

    const updateTicketPriority = async (newPriority) => {
        if (!selectedTicket) return;
        try {
            await api.patch(`/complaints/admin/${selectedTicket.id}`, {
                priority: newPriority,
            });
            setTickets((prev) =>
                prev.map((t) =>
                    t.id === selectedTicket.id
                        ? { ...t, priority: newPriority }
                        : t,
                ),
            );
            setSelectedTicket((prev) =>
                prev ? { ...prev, priority: newPriority } : prev,
            );
        } catch (err) {
            console.error("Update ticket priority error", err);
        }
    };

    const assignTicket = async (adminId) => {
        if (!selectedTicket) return;
        const idNum = adminId ? parseInt(adminId, 10) : null;

        try {
            const res = await api.patch(`/complaints/admin/${selectedTicket.id}`, {
                assigned_to: idNum,
            });
            const updated = res.data; // backend trả ComplaintOut có admin_name

            setTickets((prev) =>
                prev.map((t) => (t.id === updated.id ? updated : t)),
            );
            setSelectedTicket((prev) =>
                prev && prev.id === updated.id ? updated : prev,
            );
        } catch (err) {
            console.error("Assign ticket error", err);
        }
    };

    const filteredTickets = tickets.filter((t) => {
        const matchStatus = filterStatus === "all" || t.status === filterStatus;
        const matchPriority =
            filterPriority === "all" || t.priority === filterPriority;
        const matchAssigned =
            filterAssigned === "all" ||
            (filterAssigned === "unassigned" && !t.assigned_to) ||
            (filterAssigned === "assigned" && t.assigned_to);
        const q = searchQuery.trim().toLowerCase();
        const matchSearch =
            !q ||
            t.title.toLowerCase().includes(q) ||
            t.ticket_code.toLowerCase().includes(q) ||
            (t.user_name || "").toLowerCase().includes(q);
        return matchStatus && matchPriority && matchAssigned && matchSearch;
    });

    const stats = {
        total: tickets.length,
        open: tickets.filter((t) => t.status === "open").length,
        in_progress: tickets.filter((t) => t.status === "in_progress").length,
        urgent: tickets.filter((t) => t.priority === "urgent").length,
        unassigned: tickets.filter((t) => !t.assigned_to).length,
    };

    return (
        <div className="h-screen flex flex-col bg-slate-50">
            {/* header */}
            <div className="border-b border-gray-100 bg-white/90 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div>
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                            Admin · Hỗ trợ & Khiếu nại
                        </h1>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                            Xử lý ticket, trao đổi với khách và ghi chú nội bộ
                        </p>
                    </div>
                    <div className="flex gap-3 text-xs sm:text-sm">
                        <div className="bg-slate-50 border border-gray-200 px-3 py-1.5 rounded-xl text-gray-700">
                            <div className="font-semibold text-sm text-gray-900">
                                {stats.total}
                            </div>
                            <div className="text-[11px] text-gray-500">
                                Tổng ticket
                            </div>
                        </div>
                        <div className="bg-slate-50 border border-gray-200 px-3 py-1.5 rounded-xl text-gray-700">
                            <div className="font-semibold text-sm text-rose-500">
                                {stats.urgent}
                            </div>
                            <div className="text-[11px] text-gray-500">
                                Khẩn cấp
                            </div>
                        </div>
                        <div className="bg-slate-50 border border-gray-200 px-3 py-1.5 rounded-xl text-gray-700">
                            <div className="font-semibold text-sm text-amber-500">
                                {stats.unassigned}
                            </div>
                            <div className="text-[11px] text-gray-500">
                                Chưa assign
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* body */}
            <div className="flex-1 flex overflow-hidden px-2 sm:px-4 py-3 sm:py-4">
                <div className="flex-1 max-w-6xl mx-auto bg-white rounded-2xl shadow-lg flex overflow-hidden">
                    {/* sidebar */}
                    <div className="w-[260px] sm:w-96 border-r border-gray-100 flex flex-col bg-gray-50">
                        <div className="p-3 sm:p-4 border-b border-gray-100 space-y-3 bg-white">
                            <div className="relative">
                                <Search
                                    className="absolute left-3 top-2.5 text-gray-400"
                                    size={16}
                                />
                                <input
                                    type="text"
                                    placeholder="Tìm ticket, user..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    className="border border-gray-200 rounded-xl p-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                    value={filterStatus}
                                    onChange={(e) =>
                                        setFilterStatus(e.target.value)
                                    }
                                >
                                    <option value="all">
                                        Tất cả trạng thái
                                    </option>
                                    <option value="open">Mới</option>
                                    <option value="in_progress">
                                        Đang xử lý
                                    </option>
                                    <option value="resolved">
                                        Đã giải quyết
                                    </option>
                                    <option value="closed">Đã đóng</option>
                                </select>
                                <select
                                    className="border border-gray-200 rounded-xl p-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                    value={filterPriority}
                                    onChange={(e) =>
                                        setFilterPriority(e.target.value)
                                    }
                                >
                                    <option value="all">
                                        Tất cả ưu tiên
                                    </option>
                                    <option value="urgent">Khẩn cấp</option>
                                    <option value="high">Cao</option>
                                    <option value="normal">Bình thường</option>
                                    <option value="low">Thấp</option>
                                </select>
                            </div>
                            <select
                                className="w-full border border-gray-200 rounded-xl p-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                value={filterAssigned}
                                onChange={(e) =>
                                    setFilterAssigned(e.target.value)
                                }
                            >
                                <option value="all">Tất cả ticket</option>
                                <option value="unassigned">Chưa assign</option>
                                <option value="assigned">Đã assign</option>
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
                                        Không tìm thấy ticket
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

                    {/* main */}
                    <div className="flex-1 flex flex-col bg-slate-25">
                        {selectedTicket ? (
                            <>
                                {/* header ticket */}
                                <div className="bg-white border-b border-gray-100 px-4 py-3">
                                    <div className="flex justify-between items-start gap-3 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                <h2 className="font-semibold text-sm sm:text-base truncate">
                                                    {selectedTicket.ticket_code}
                                                </h2>
                                                <StatusBadge
                                                    status={
                                                        selectedTicket.status
                                                    }
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
                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs sm:text-sm text-gray-600">
                                                <div className="flex items-center gap-1">
                                                    <User size={12} />
                                                    <span>
                                                        {
                                                            selectedTicket.user_name
                                                        }
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {
                                                        selectedTicket.user_email
                                                    }
                                                </span>
                                                <RelatedTypeBadge
                                                    type={
                                                        selectedTicket.related_type
                                                    }
                                                />
                                                {selectedTicket.related_id && (
                                                    <span className="text-[11px] bg-gray-100 px-2 py-1 rounded-full">
                                                        ID liên quan: #
                                                        {
                                                            selectedTicket.related_id
                                                        }
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 items-center text-xs sm:text-sm">
                                        <select
                                            className="border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                            value={selectedTicket.status}
                                            onChange={(e) =>
                                                updateTicketStatus(
                                                    e.target.value,
                                                )
                                            }
                                        >
                                            <option value="open">Mới</option>
                                            <option value="in_progress">
                                                Đang xử lý
                                            </option>
                                            <option value="resolved">
                                                Đã giải quyết
                                            </option>
                                            <option value="closed">Đóng</option>
                                            <option value="cancelled">
                                                Hủy
                                            </option>
                                        </select>

                                        <select
                                            className="border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                            value={selectedTicket.priority}
                                            onChange={(e) =>
                                                updateTicketPriority(
                                                    e.target.value,
                                                )
                                            }
                                        >
                                            <option value="low">Thấp</option>
                                            <option value="normal">
                                                Bình thường
                                            </option>
                                            <option value="high">Cao</option>
                                            <option value="urgent">
                                                Khẩn cấp
                                            </option>
                                        </select>

                                        <select
                                            className="border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-gray-50"
                                            value={
                                                selectedTicket.assigned_to || ""
                                            }
                                            onChange={(e) =>
                                                assignTicket(e.target.value)
                                            }
                                        >
                                            <option value="">
                                                Chưa assign
                                            </option>
                                            {admins.map((admin) => (
                                                <option
                                                    key={admin.id}
                                                    value={admin.id}
                                                >
                                                    {admin.full_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* messages */}
                                <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 bg-slate-50">
                                    {messages.length === 0 ? (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <div className="text-center">
                                                <p className="text-sm font-medium">
                                                    Chưa có tin nhắn nào
                                                </p>
                                                <p className="text-xs mt-1 text-gray-400">
                                                    Gửi tin nhắn đầu tiên cho
                                                    user hoặc ghi chú nội bộ
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        (() => {
                                            const lastOwnId =
                                                currentAdminId == null
                                                    ? null
                                                    : [...messages]
                                                        .reverse()
                                                        .find((m) => m.sender_id === currentAdminId)?.id;

                                            return messages.map((msg) => (
                                                <MessageBubble
                                                    key={msg.id}
                                                    message={msg}
                                                    currentUserId={currentAdminId}
                                                    showStatus={msg.id === lastOwnId}
                                                />
                                            ));
                                        })()
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* input */}
                                <div className="bg-white border-t border-gray-100 px-3 sm:px-4 py-3">
                                    <label className="flex items-center gap-2 mb-3 text-xs sm:text-sm">
                                        <input
                                            type="checkbox"
                                            checked={isInternalNote}
                                            onChange={(e) =>
                                                setIsInternalNote(
                                                    e.target.checked,
                                                )
                                            }
                                            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                        />
                                        <Lock
                                            size={14}
                                            className="text-amber-600"
                                        />
                                        <span className="text-amber-700 font-medium">
                                            Ghi chú nội bộ (chỉ admin nhìn
                                            thấy)
                                        </span>
                                    </label>

                                    {previewFiles.length > 0 && (
                                        <div className="mb-2 flex flex-wrap gap-2">
                                            {previewFiles.map((p, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-gray-100 text-[11px]"
                                                >
                                                    {p.file.type?.startsWith(
                                                        "image/",
                                                    ) ? (
                                                        <ImageIcon size={14} />
                                                    ) : (
                                                        <FileText size={14} />
                                                    )}
                                                    <span className="max-w-[120px] truncate">
                                                        {p.file.name}
                                                    </span>
                                                    <button
                                                        onClick={() =>
                                                            setPreviewFiles(
                                                                (prev) =>
                                                                    prev.filter(
                                                                        (
                                                                            _,
                                                                            i,
                                                                        ) =>
                                                                            i !==
                                                                            idx,
                                                                    ),
                                                            )
                                                        }
                                                        className="text-gray-400 hover:text-rose-500"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex gap-2 items-center">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                fileInputRef.current?.click()
                                            }
                                            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-600"
                                        >
                                            <Paperclip size={18} />
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            onChange={handleUploadChange}
                                            className="hidden"
                                        />

                                        <input
                                            type="text"
                                            value={inputMessage}
                                            onChange={(e) =>
                                                setInputMessage(e.target.value)
                                            }
                                            onKeyDown={(e) =>
                                                e.key === "Enter" &&
                                                !e.shiftKey &&
                                                sendMessage()
                                            }
                                            placeholder={
                                                isInternalNote
                                                    ? "Nhập ghi chú nội bộ..."
                                                    : "Nhập tin nhắn trả lời user..."
                                            }
                                            className={`flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${isInternalNote
                                                ? "bg-amber-50 border-amber-200"
                                                : "bg-white"
                                                }`}
                                        />
                                        <button
                                            onClick={sendMessage}
                                            disabled={
                                                !inputMessage.trim() &&
                                                previewFiles.length === 0
                                            }
                                            className="px-3 sm:px-4 py-2 rounded-xl text-white bg-sky-500 hover:bg-sky-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                                        >
                                            <Send size={18} />
                                        </button>
                                    </div>
                                    {isInternalNote && (
                                        <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
                                            <Lock size={12} />
                                            Tin nhắn này sẽ không hiển thị cho
                                            user
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
                                        Có {stats.unassigned} ticket chưa
                                        assign và {stats.urgent} ticket khẩn cấp
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* modal xem trước upload */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-semibold">
                                Đính kèm ({previewFiles.length})
                            </h3>
                            <button
                                onClick={() => setShowUploadModal(false)}
                                className="p-1 rounded-full hover:bg-gray-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                            {previewFiles.map((item, i) => (
                                <div
                                    key={i}
                                    className="relative group rounded-lg border border-gray-200 overflow-hidden"
                                >
                                    {item.file.type.startsWith("image/") ? (
                                        <img
                                            src={item.url}
                                            className="w-full h-32 object-cover"
                                        />
                                    ) : (
                                        <div className="bg-gray-100 h-32 flex items-center justify-center text-gray-500">
                                            <FileText size={32} />
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-black/50 text-[11px] text-white px-2 py-1 truncate">
                                        {item.file.name}
                                    </div>
                                    <button
                                        onClick={() =>
                                            setPreviewFiles((prev) =>
                                                prev.filter(
                                                    (_, idx) => idx !== i,
                                                ),
                                            )
                                        }
                                        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 border border-sky-500 text-sky-600 py-2.5 rounded-lg text-sm font-medium hover:bg-sky-50"
                            >
                                + Thêm file
                            </button>
                            <button
                                onClick={sendMessage}
                                disabled={previewFiles.length === 0}
                                className="flex-1 bg-sky-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-sky-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                Gửi kèm {previewFiles.length} file
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};