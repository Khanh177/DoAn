// src/pages/users/P2P/P2PTrade.jsx
import React, { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import Header from "../../../layouts/Header";
import api from "../../../api/axios";
import SuccessModal from "../../../layouts/SuccessModal";
import ErrorModal from "../../../layouts/ErrorModal";

import ConfirmModal from "../../../layouts/ConfirmModal";
import TransactionDetailModal from "./TransactionDetailModal";
import PendingTransactions from "./PendingTransactions";
import TransactionHistory from "./TransactionHistory";
import PostRow from "./PostRow";
import AddPostModal from "./AddPostModal";
import BuyGoldModal from "./BuyGoldModal";
import SellGoldModal from "./SellGoldModal";
import EditPostModal from "./EditPostModal";

export const GOLD_TYPE_LABELS = {
    gold_world_balance: "XAU",
};

const FEE_RATE = 0.005;

const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

export const translateStatus = (status) => {
    const map = {
        pending: { label: "Chờ xử lý", color: "text-yellow-500" },
        waiting_payment: { label: "Chờ thanh toán", color: "text-yellow-500" },
        paid: { label: "Đã thanh toán", color: "text-blue-500" },
        confirmed: { label: "Đã xác nhận", color: "text-green-500" },
        completed: { label: "Hoàn thành", color: "text-emerald-600" },
        cancelled: { label: "Đã hủy", color: "text-red-600" },
        disputed: { label: "Tranh chấp", color: "text-orange-500" },
    };
    return map[status] || { label: status, color: "text-gray-600" };
};

const extractErrorMessage = (err, fallback = "Có lỗi xảy ra.") => {
    if (typeof err === "string") return err;

    const detail = err?.response?.data?.detail ?? err?.detail;

    if (Array.isArray(detail)) {
        return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
    }

    if (typeof detail === "string") return detail;

    if (detail && typeof detail === "object") {
        try {
            return JSON.stringify(detail);
        } catch {
            return fallback;
        }
    }

    if (err?.message) return err.message;

    return fallback;
};

const mapPost = (p) => ({
    id: p.id,
    user_id: p.user_id,
    trade_type: p.trade_type,
    gold_type: p.gold_type,
    loai_vang: p.gold_type,
    gia_tien: Number(p.price_vnd ?? 0),
    gia_toi_thieu: Number(p.min_amount_vnd ?? 0),
    gia_toi_da: Number(p.max_amount_vnd ?? 0),
    tong_so_luong: Number(p.total_quantity ?? 0),
    ten_ngan_hang: p.bank_name,
    so_tai_khoan: p.bank_account_number,
    ten_chu_tai_khoan: p.bank_account_name,
    noi_dung_chuyen_khoan: p.transfer_note_template,
    trang_thai: p.status,
    thoi_gian_tao: p.created_at,
    thoi_gian_cap_nhat: p.updated_at,
    ho_ten: p.full_name,
    kha_dung: p.available_gold,
});

const mapTrade = (t) => ({
    ...t,
    id: t.id,
    ma_giao_dich: t.trade_code,
    post_id: t.post_id,
    buyer_id: t.buyer_id,
    seller_id: t.seller_id,
    nguoi_mua_id: t.buyer_id,
    nguoi_ban_id: t.seller_id,
    so_luong: Number(t.quantity ?? 0),
    gia_thoa_thuan: Number(t.agreed_price_vnd ?? 0),
    tong_tien: Number(t.total_amount_vnd ?? 0),
    phi_giao_dich: Number(t.fee_vnd ?? 0),
    loai_vang: t.gold_type,
    trang_thai: t.status,
    thoi_gian_tao: t.created_at,
    thoi_gian_thanh_toan: t.paid_at,
    thoi_gian_xac_nhan: t.confirmed_at,
    bank_info: t.bank_info,
    khieu_nai: t.complaint,
    ten_nguoi_mua: t.buyer_name,
    ten_nguoi_ban: t.seller_name,
});

export default function P2PTrade() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [userId, setUserId] = useState(null);

    const [activeTab, setActiveTab] = useState("P2P");
    const [action, setAction] = useState("Mua");

    const [wallet, setWallet] = useState(null);
    const [buyPosts, setBuyPosts] = useState([]);
    const [sellPosts, setSellPosts] = useState([]);
    const [pendingTransactions, setPendingTransactions] = useState([]);
    const [transactionHistory, setTransactionHistory] = useState([]);

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState("Mua");
    const [addForm, setAddForm] = useState({
        quantity: "",
        minPrice: "",
        maxPrice: "",
        price: "",
        bankName: "",
        accountNumber: "",
        accountName: "",
    });

    const [selectedPost, setSelectedPost] = useState(null);
    const [buyModalOpen, setBuyModalOpen] = useState(false);
    const [sellModalOpen, setSellModalOpen] = useState(false);

    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [postToDelete, setPostToDelete] = useState(null);

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    const [editModalOpen, setEditModalOpen] = useState(false);
    const [postToEdit, setPostToEdit] = useState(null);
    const [editForm, setEditForm] = useState({
        quantity: "",
        minPrice: "",
        maxPrice: "",
        price: "",
        bankName: "",
        accountNumber: "",
        accountName: "",
    });

    const [successState, setSuccessState] = useState({
        open: false,
        message: "",
    });
    const [errorState, setErrorState] = useState({
        open: false,
        message: "",
    });

    const wsRef = useRef(null);
    const retryTimer = useRef(null);

    const wsUserRef = useRef(null);
    const retryUserTimer = useRef(null);

    const showSuccess = (message) => setSuccessState({ open: true, message });
    const showError = (message) => setErrorState({ open: true, message });

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        const uname = localStorage.getItem("username");
        const uid = localStorage.getItem("user_id");
        setIsLoggedIn(!!token);
        if (uname) setUsername(uname);
        if (uid) setUserId(Number(uid));
    }, []);

    const fetchWallet = async () => {
        if (!userId) return;
        try {
            const res = await api.get("/wallet/p2p/me");
            setWallet({
                usd: Number(res.data.balance ?? 0),
                gold_world: Number(res.data.gold_world_balance ?? 0),
            });
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Không thể tải thông tin ví."));
        }
    };

    useEffect(() => {
        fetchWallet();
    }, [userId]);


    const getTradeTypeForList = (uiAction) =>
        uiAction === "Mua" ? "buy" : "sell";

    const getTradeTypeForPost = (uiAction) =>
        uiAction === "Mua" ? "buy" : "sell";

    const fetchPosts = async (type) => {
        try {
            const tradeType = getTradeTypeForList(type);

            const publicRes = await api.get("/p2p/posts", {
                params: { trade_type: tradeType },
            });

            let allPosts = publicRes.data.map(mapPost);

            if (isLoggedIn && userId) {
                try {
                    const myRes = await api.get("/p2p/posts/my", {
                        params: { trade_type: tradeType },
                    });
                    const myPosts = myRes.data.map(mapPost);

                    const publicIds = new Set(allPosts.map((p) => p.id));
                    const myInactivePosts = myPosts.filter(
                        (p) => !publicIds.has(p.id)
                    );

                    allPosts = [...allPosts, ...myInactivePosts];
                } catch (err) {
                    console.warn("Cannot fetch my posts:", err);
                }
            }

            if (type === "Mua") setBuyPosts(allPosts);
            else setSellPosts(allPosts);
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Không thể tải danh sách bài đăng."));
        }
    };


    const fetchPending = async () => {
        if (!isLoggedIn) return;
        try {
            const [buyerRes, sellerRes] = await Promise.all([
                api.get("/p2p/trades/pending/buyer"),
                api.get("/p2p/trades/pending/seller"),
            ]);
            const merged = [
                ...buyerRes.data.map(mapTrade),
                ...sellerRes.data.map(mapTrade),
            ];
            merged.sort(
                (a, b) => new Date(b.thoi_gian_tao) - new Date(a.thoi_gian_tao)
            );
            setPendingTransactions(merged);
        } catch (err) {
            console.error(err);
            showError(
                extractErrorMessage(err, "Không thể tải giao dịch chờ xử lý.")
            );
        }
    };

    const fetchHistory = async () => {
        if (!isLoggedIn) return;
        try {
            const res = await api.get("/p2p/trades/history");
            const mapped = res.data.map(mapTrade);

            mapped.sort(
                (a, b) => new Date(b.thoi_gian_tao) - new Date(a.thoi_gian_tao)
            );
            setTransactionHistory(mapped);
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Không thể tải lịch sử giao dịch."));
        }
    };

    useEffect(() => {
        fetchPosts(action);
    }, [action]);

    useEffect(() => {
        if (!isLoggedIn) return;
        if (activeTab === "Chờ xử lý") fetchPending();
        if (activeTab === "Lịch sử") fetchHistory();
    }, [activeTab, isLoggedIn]);

    // Load giao dịch chờ xử lý 1 lần khi user đã đăng nhập
    useEffect(() => {
        if (!isLoggedIn || !userId) return;
        fetchPending();
    }, [isLoggedIn, userId]);


    useEffect(() => {
        let stopped = false;

        const openWS = () => {
            if (stopped) return;

            const token = encodeURIComponent(localStorage.getItem("access_token") || "");
            const url = `${WS_BASE}/ws/p2p/public?token=${token}`;
            console.log("P2P WebSocket connecting to:", url);

            try {
                if (
                    wsRef.current &&
                    (wsRef.current.readyState === WebSocket.OPEN ||
                        wsRef.current.readyState === WebSocket.CLOSING)
                ) {
                    wsRef.current.close();
                }
            } catch { }

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("P2P WebSocket connected!");
                if (retryTimer.current) {
                    clearTimeout(retryTimer.current);
                    retryTimer.current = null;
                }
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);

                    if (msg.type === "p2p_post_updated" && msg.post) {
                        const mapped = mapPost(msg.post);

                        setBuyPosts((prev) => {
                            if (mapped.trade_type !== "buy") return prev;
                            const idx = prev.findIndex((p) => p.id === mapped.id);
                            const isOwner =
                                userId && mapped.user_id === Number(userId);

                            if (mapped.trang_thai !== "active" && !isOwner) {
                                if (idx === -1) return prev;
                                return prev.filter((p) => p.id !== mapped.id);
                            }

                            if (idx === -1) return [...prev, mapped];
                            return prev.map((p) =>
                                p.id === mapped.id ? mapped : p
                            );
                        });

                        setSellPosts((prev) => {
                            if (mapped.trade_type !== "sell") return prev;
                            const idx = prev.findIndex((p) => p.id === mapped.id);
                            const isOwner =
                                userId && mapped.user_id === Number(userId);

                            if (mapped.trang_thai !== "active" && !isOwner) {
                                if (idx === -1) return prev;
                                return prev.filter((p) => p.id !== mapped.id);
                            }

                            if (idx === -1) return [...prev, mapped];
                            return prev.map((p) =>
                                p.id === mapped.id ? mapped : p
                            );
                        });
                    }

                    if (msg.type === "p2p_post_deleted") {
                        const { id, trade_type } = msg;
                        if (!id) return;

                        if (!trade_type || trade_type === "buy") {
                            setBuyPosts((prev) => prev.filter((p) => p.id !== id));
                        }
                        if (!trade_type || trade_type === "sell") {
                            setSellPosts((prev) => prev.filter((p) => p.id !== id));
                        }
                    }
                } catch (e) {
                    console.error("P2P WS parse error:", e);
                }
            };

            ws.onclose = () => {
                if (stopped) return;
                console.log("P2P WS closed. Reconnecting...");
                retryTimer.current = setTimeout(openWS, 1500);
            };
        };

        openWS();

        return () => {
            stopped = true;
            if (retryTimer.current) {
                clearTimeout(retryTimer.current);
                retryTimer.current = null;
            }
            try {
                if (
                    wsRef.current &&
                    (wsRef.current.readyState === WebSocket.OPEN ||
                        wsRef.current.readyState === WebSocket.CLOSING)
                ) {
                    wsRef.current.close();
                }
            } catch { }
        };
    }, [userId]);

    useEffect(() => {
        const t = setInterval(() => {
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping" }));
            }
        }, 30000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        if (!isLoggedIn || !userId) return;
        let stopped = false;

        const openUserWS = () => {
            if (stopped) return;

            const token = encodeURIComponent(
                localStorage.getItem("access_token") || ""
            );
            const url = `${WS_BASE}/ws/p2p/user?token=${token}`;
            console.log("P2P User WebSocket connecting to:", url);

            try {
                if (
                    wsUserRef.current &&
                    (wsUserRef.current.readyState === WebSocket.OPEN ||
                        wsUserRef.current.readyState === WebSocket.CLOSING)
                ) {
                    wsUserRef.current.close();
                }
            } catch { }

            const ws = new WebSocket(url);
            wsUserRef.current = ws;

            ws.onopen = () => {
                console.log("P2P User WebSocket connected!");
                if (retryUserTimer.current) {
                    clearTimeout(retryUserTimer.current);
                    retryUserTimer.current = null;
                }
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    let tx = null;
                    if (msg.trade) {
                        tx = mapTrade(msg.trade);
                    }

                    switch (msg.type) {
                        case "p2p_trade_created": {
                            if (!tx) break;
                            setPendingTransactions((prev) => {
                                const exists = prev.some((t) => t.id === tx.id);
                                if (exists) return prev;
                                return [tx, ...prev];
                            });
                            setActiveTab("Chờ xử lý");
                            showSuccess("Đã tạo giao dịch P2P mới.");
                            if (tx.buyer_id === userId || tx.seller_id === userId) {
                                fetchWallet();
                            }
                            // >>> THÊM
                            fetchPending();
                            break;
                        }

                        case "p2p_trade_paid": {
                            if (!tx) break;
                            setPendingTransactions((prev) => {
                                const idx = prev.findIndex((t) => t.id === tx.id);
                                if (idx === -1) return [tx, ...prev];
                                const clone = [...prev];
                                clone[idx] = tx;
                                return clone;
                            });
                            setActiveTab("Chờ xử lý");
                            showSuccess(
                                "Đối tác đã xác nhận đã chuyển tiền. Vui lòng kiểm tra và xác nhận giao dịch."
                            );
                            // >>> THÊM
                            fetchPending();
                            break;
                        }

                        case "p2p_trade_completed": {
                            if (!tx) break;
                            setPendingTransactions((prev) =>
                                prev.filter((t) => t.id !== tx.id)
                            );
                            setTransactionHistory((prev) => {
                                const idx = prev.findIndex((t) => t.id === tx.id);
                                if (idx === -1) return [tx, ...prev];
                                const clone = [...prev];
                                clone[idx] = tx;
                                return clone;
                            });
                            setActiveTab("Lịch sử");

                            const isBuyer =
                                tx.nguoi_mua_id === userId || tx.buyer_id === userId;
                            const isSeller =
                                tx.nguoi_ban_id === userId || tx.seller_id === userId;

                            const grossGold = Number(tx.so_luong || 0);
                            const netGold = grossGold * (1 - 0.005);
                            const totalVnd = Number(tx.tong_tien || 0);

                            let msgText = "Giao dịch P2P đã hoàn tất.";
                            if (isBuyer) {
                                msgText = `Giao dịch P2P đã hoàn tất. Bạn nhận được ${netGold.toFixed(5)} XAU.`;
                            } else if (isSeller) {
                                msgText = `Giao dịch P2P đã hoàn tất. Bạn đã bán ${grossGold.toFixed(5)} XAU và nhận ${totalVnd.toLocaleString()} VNĐ.`;
                            }
                            showSuccess(msgText);

                            if (isBuyer || isSeller) {
                                fetchWallet();
                            }
                            // >>> THÊM
                            fetchPending();
                            fetchHistory();
                            break;
                        }

                        case "p2p_trade_cancelled": {
                            if (!tx) break;
                            setPendingTransactions((prev) =>
                                prev.filter((t) => t.id !== tx.id)
                            );
                            setTransactionHistory((prev) => {
                                const idx = prev.findIndex((t) => t.id === tx.id);
                                if (idx === -1) return [tx, ...prev];
                                const clone = [...prev];
                                clone[idx] = tx;
                                return clone;
                            });
                            const who =
                                msg.cancelled_by === "buyer" ? "Người mua" : "Người bán";
                            showSuccess(`${who} đã hủy giao dịch P2P.`);

                            if (tx.buyer_id === userId || tx.seller_id === userId) {
                                fetchWallet();
                            }
                            // >>> THÊM
                            fetchPending();
                            fetchHistory();
                            break;
                        }

                        default:
                            break;
                    }
                } catch (e) {
                    console.error("P2P User WS parse error:", e);
                }
            };

            ws.onclose = () => {
                if (stopped) return;
                console.log("P2P User WS closed. Reconnecting...");
                retryUserTimer.current = setTimeout(openUserWS, 1500);
            };
        };

        openUserWS();

        return () => {
            stopped = true;
            if (retryUserTimer.current) {
                clearTimeout(retryUserTimer.current);
                retryUserTimer.current = null;
            }
            try {
                if (
                    wsUserRef.current &&
                    (wsUserRef.current.readyState === WebSocket.OPEN ||
                        wsUserRef.current.readyState === WebSocket.CLOSING)
                ) {
                    wsUserRef.current.close();
                }
            } catch { }
        };
    }, [isLoggedIn, userId]);

    const handleAddPostSubmit = async () => {
        try {
            if (!userId) throw new Error("Vui lòng đăng nhập trước khi đăng bài.");

            const quantity = parseFloat(addForm.quantity);
            const minPrice = parseFloat(addForm.minPrice);
            const maxPrice = parseFloat(addForm.maxPrice);
            const price = parseFloat(addForm.price);

            if (!quantity || quantity <= 0) {
                throw new Error("Vui lòng nhập số vàng muốn đăng bán.");
            }

            if (!minPrice || !maxPrice || !price) {
                throw new Error("Vui lòng nhập đầy đủ giá và giới hạn.");
            }
            if (minPrice > maxPrice) {
                throw new Error("Giới hạn tối thiểu không được lớn hơn tối đa.");
            }

            if (
                !addForm.bankName.trim() ||
                !addForm.accountNumber.trim() ||
                !addForm.accountName.trim()
            ) {
                throw new Error("Vui lòng điền đầy đủ thông tin ngân hàng.");
            }

            if (modalAction === "Bán" && wallet) {
                if (quantity > Number(wallet.gold_world ?? 0)) {
                    throw new Error("Số vàng đăng bán vượt quá vàng khả dụng.");
                }
            }

            const tradeType = getTradeTypeForPost(modalAction);

            await api.post("/p2p/posts", {
                trade_type: tradeType,
                gold_type: "gold_world_balance",
                price_vnd: price,
                min_amount_vnd: minPrice,
                max_amount_vnd: maxPrice,
                total_quantity: quantity,
                bank_name: addForm.bankName,
                bank_account_number: addForm.accountNumber,
                bank_account_name: addForm.accountName,
                transfer_note_template: "AUTO",
            });

            setAddModalOpen(false);
            setAddForm({
                quantity: "",
                minPrice: "",
                maxPrice: "",
                price: "",
                bankName: "",
                accountNumber: "",
                accountName: "",
            });

            await fetchPosts(modalAction);
            showSuccess("Đăng bài P2P thành công.");
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Lỗi khi tạo bài đăng."));
        }
    };

    const handleOpenBuy = (post) => {
        setSelectedPost(post);
        setBuyModalOpen(true);
    };

    const handleOpenSell = (post) => {
        setSelectedPost(post);
        setSellModalOpen(true);
    };

    const handleCreateBuyTransaction = async (payload) => {
        try {
            if (!userId || !selectedPost)
                throw new Error("Thiếu thông tin người dùng hoặc bài đăng.");

            const res = await api.post("/p2p/trades", {
                post_id: selectedPost.id,
                quantity: payload.goldAmountGross,
                total_amount_vnd: payload.totalVnd,
                fee_rate: 0.005,
                agreed_price_vnd: selectedPost.gia_tien,
                bank_info: {
                    ten_ngan_hang: selectedPost.ten_ngan_hang,
                    so_tai_khoan: selectedPost.so_tai_khoan,
                    ten_chu_tai_khoan: selectedPost.ten_chu_tai_khoan,
                    transfer_note: payload.transferCode,
                },
            });

            const trade = res.data;

            try {
                await api.post(`/p2p/trades/${trade.id}/mark-paid`);
            } catch (e) {
                console.error("Mark paid failed:", e);
            }

            setBuyModalOpen(false);
            setSelectedPost(null);

            setActiveTab("Lịch sử");

            showSuccess(
                "Đã xác nhận thanh toán thành công. Đang chờ người bán xử lý."
            );
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Lỗi khi tạo giao dịch mua."));
        }
    };

    const handleCreateSellTransaction = async (payload) => {
        try {
            if (!userId || !selectedPost)
                throw new Error("Thiếu thông tin người dùng hoặc bài đăng.");

            await api.post("/p2p/trades", {
                post_id: selectedPost.id,
                quantity: payload.gold,
                total_amount_vnd: payload.money,
                fee_rate: 0.005,
                agreed_price_vnd: selectedPost.gia_tien,
                bank_info: payload.bankInfo,
            });

            setSellModalOpen(false);
            setSelectedPost(null);
            setActiveTab("Chờ xử lý");

            showSuccess(
                "Đã tạo lệnh bán vàng thành công! Đang chờ người mua chuyển tiền."
            );
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Lỗi khi tạo giao dịch bán."));
        }
    };

    const handleDeletePostClick = (post) => {
        setPostToDelete(post);
        setConfirmDeleteOpen(true);
    };

    const handleDeletePost = async () => {
        if (!postToDelete) return;
        try {
            await api.delete(`/p2p/posts/${postToDelete.id}`);
            setConfirmDeleteOpen(false);
            setPostToDelete(null);
            await fetchPosts(action);
            showSuccess("Xóa bài đăng thành công.");
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Không thể xóa bài đăng."));
        }
    };

    const handleEditPostClick = (post) => {
        setPostToEdit(post);
        setEditForm({
            quantity: post.tong_so_luong.toString(),
            minPrice: post.gia_toi_thieu.toString(),
            maxPrice: post.gia_toi_da.toString(),
            price: post.gia_tien.toString(),
            bankName: post.ten_ngan_hang || "",
            accountNumber: post.so_tai_khoan || "",
            accountName: post.ten_chu_tai_khoan || "",
        });
        setEditModalOpen(true);
    };

    const handleEditPostSubmit = async () => {
        if (!postToEdit) return;

        try {
            const quantity = parseFloat(editForm.quantity);
            const minPrice = parseFloat(editForm.minPrice);
            const maxPrice = parseFloat(editForm.maxPrice);
            const price = parseFloat(editForm.price);

            if (!quantity || quantity <= 0) {
                throw new Error("Vui lòng nhập số vàng hợp lệ.");
            }

            if (!minPrice || !maxPrice || !price) {
                throw new Error("Vui lòng nhập đầy đủ giá và giới hạn.");
            }
            if (minPrice > maxPrice) {
                throw new Error("Giới hạn tối thiểu không được lớn hơn tối đa.");
            }

            if (
                !editForm.bankName.trim() ||
                !editForm.accountNumber.trim() ||
                !editForm.accountName.trim()
            ) {
                throw new Error("Vui lòng điền đầy đủ thông tin ngân hàng.");
            }

            await api.put(`/p2p/posts/${postToEdit.id}`, {
                price_vnd: price,
                min_amount_vnd: minPrice,
                max_amount_vnd: maxPrice,
                total_quantity: quantity,
                bank_name: editForm.bankName,
                bank_account_number: editForm.accountNumber,
                bank_account_name: editForm.accountName,
            });

            setEditModalOpen(false);
            setPostToEdit(null);
            setEditForm({
                quantity: "",
                minPrice: "",
                maxPrice: "",
                price: "",
                bankName: "",
                accountNumber: "",
                accountName: "",
            });

            await fetchPosts(action);
            showSuccess("Cập nhật bài đăng thành công.");
        } catch (err) {
            console.error(err);
            showError(extractErrorMessage(err, "Lỗi khi cập nhật bài đăng."));
        }
    };

    const handleTogglePostStatus = async (post) => {
        try {
            const newStatus = post.trang_thai === "active" ? "inactive" : "active";

            await api.patch(`/p2p/posts/${post.id}/status`, {
                status: newStatus,
            });

            await fetchPosts(action);
            showSuccess(
                `Đã ${newStatus === "active" ? "hiện" : "ẩn"} bài đăng thành công.`
            );
        } catch (err) {
            console.error(err);
            showError(
                extractErrorMessage(err, "Không thể thay đổi trạng thái bài đăng.")
            );
        }
    };

    const handleTransactionAction = async (transactionId, actionType) => {
        try {
            const trade = pendingTransactions.find((t) => t.id === transactionId);
            if (!trade) throw new Error("Không tìm thấy giao dịch.");

            const isBuyer =
                trade.buyer_id === userId || trade.nguoi_mua_id === userId;
            const isSeller =
                trade.seller_id === userId || trade.nguoi_ban_id === userId;

            if (!isBuyer && !isSeller) {
                throw new Error("Bạn không có quyền xử lý giao dịch này.");
            }

            if (actionType === "confirm") {
                if (isBuyer && trade.trang_thai === "waiting_payment") {
                    await api.post(`/p2p/trades/${transactionId}/mark-paid`);
                } else if (isSeller && trade.trang_thai === "paid") {
                    await api.post(`/p2p/trades/${transactionId}/confirm`);
                } else {
                    throw new Error("Trạng thái hiện tại không cho phép thao tác này.");
                }
            } else if (actionType === "cancel") {
                await api.post(`/p2p/trades/${transactionId}/cancel`);
            }

            showSuccess(
                `Giao dịch đã được ${actionType === "confirm" ? "xử lý" : "hủy"
                } thành công.`
            );
        } catch (err) {
            console.error(err);
            showError(
                extractErrorMessage(err, "Không thể cập nhật trạng thái giao dịch.")
            );
        }
    };

    const handleViewDetail = (tx) => {
        setSelectedTransaction(tx);
        setDetailModalOpen(true);
    };

    const TABS = [
        { key: "P2P", label: "P2P" },
        { key: "Chờ xử lý", label: `Chờ xử lý (${pendingTransactions.length})` },
        { key: "Lịch sử", label: "Lịch sử" },
    ];

    const currentPosts = action === "Mua" ? buyPosts : sellPosts;

    return (
        <div className="bg-gray-50 text-gray-900 min-h-screen flex flex-col">
            <Header
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                username={username}
                setUsername={setUsername}
            />

            <div className="flex-1 p-6 bg-gray-100 overflow-y-auto">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex space-x-8 border-b border-gray-200 mb-6">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`relative pb-3 text-sm font-medium ${activeTab === tab.key
                                    ? "text-gray-900"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                {tab.label}
                                {activeTab === tab.key && (
                                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-500 rounded-t-md" />
                                )}
                            </button>
                        ))}
                    </div>

                    {activeTab === "P2P" && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="inline-flex rounded-full bg-white shadow">
                                    <button
                                        onClick={() => setAction("Mua")}
                                        className={`px-6 py-2 text-xs font-medium rounded-l-full ${action === "Mua"
                                            ? "bg-green-500 text-white"
                                            : "text-gray-700 hover:bg-gray-100"
                                            }`}
                                    >
                                        Mua
                                    </button>
                                    <button
                                        onClick={() => setAction("Bán")}
                                        className={`px-6 py-2 text-xs font-medium rounded-r-full ${action === "Bán"
                                            ? "bg-red-500 text-white"
                                            : "text-gray-700 hover:bg-gray-100"
                                            }`}
                                    >
                                        Bán
                                    </button>
                                </div>

                                <button
                                    disabled={!isLoggedIn}
                                    onClick={() => {
                                        setModalAction(action);
                                        setAddModalOpen(true);
                                    }}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full shadow ${isLoggedIn
                                        ? "bg-yellow-500 text-white hover:bg-yellow-600"
                                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        }`}
                                    title={
                                        isLoggedIn
                                            ? "Tạo bài P2P mới"
                                            : "Vui lòng đăng nhập"
                                    }
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-5 text-xs font-semibold text-gray-500 px-4 py-2 bg-gray-50 rounded-t-md">
                                <div>Người quảng cáo</div>
                                <div className="text-right">Giá</div>
                                <div className="text-center">
                                    Khả dụng / Giới hạn lệnh
                                </div>
                                <div className="text-center">Thanh toán</div>
                                <div className="text-right">Giao dịch</div>
                            </div>

                            <div className="bg-white rounded-b-md shadow">
                                {currentPosts.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4 text-sm">
                                        Chưa có bài đăng nào.
                                    </p>
                                ) : (
                                    currentPosts.map((post) => (
                                        <PostRow
                                            key={post.id}
                                            post={post}
                                            type={action}
                                            userId={userId}
                                            onDelete={handleDeletePostClick}
                                            onEdit={handleEditPostClick}
                                            onToggleStatus={handleTogglePostStatus}
                                            onOpen={
                                                action === "Mua"
                                                    ? handleOpenBuy
                                                    : handleOpenSell
                                            }
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "Chờ xử lý" && (
                        <PendingTransactions
                            pendingTransactions={pendingTransactions}
                            userId={userId}
                            onAction={handleTransactionAction}
                            onViewDetail={handleViewDetail}
                        />
                    )}

                    {activeTab === "Lịch sử" && (
                        <TransactionHistory
                            transactions={transactionHistory}
                            userId={userId}
                            currentPage={currentPage}
                            itemsPerPage={itemsPerPage}
                            setCurrentPage={setCurrentPage}
                        />
                    )}
                </div>
            </div>

            <AddPostModal
                open={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                modalAction={modalAction}
                setModalAction={setModalAction}
                wallet={wallet}
                form={addForm}
                setForm={setAddForm}
                onSubmit={handleAddPostSubmit}
            />

            <BuyGoldModal
                open={buyModalOpen}
                post={selectedPost}
                onClose={() => {
                    setBuyModalOpen(false);
                    setSelectedPost(null);
                }}
                onSubmit={handleCreateBuyTransaction}
            />

            <SellGoldModal
                open={sellModalOpen}
                post={selectedPost}
                availableGold={wallet?.gold_world ?? 0}
                onClose={() => {
                    setSellModalOpen(false);
                    setSelectedPost(null);
                }}
                onSubmit={handleCreateSellTransaction}
            />

            <EditPostModal
                open={editModalOpen}
                onClose={() => {
                    setEditModalOpen(false);
                    setPostToEdit(null);
                }}
                post={postToEdit}
                form={editForm}
                setForm={setEditForm}
                onSubmit={handleEditPostSubmit}
            />

            <ConfirmModal
                open={confirmDeleteOpen}
                title="Xóa bài đăng"
                message={
                    postToDelete
                        ? `Bạn chắc chắn muốn xóa bài đăng #${postToDelete.id}?`
                        : ""
                }
                onCancel={() => setConfirmDeleteOpen(false)}
                onConfirm={handleDeletePost}
            />

            <TransactionDetailModal
                open={detailModalOpen}
                transaction={selectedTransaction}
                userId={userId}
                onClose={() => {
                    setDetailModalOpen(false);
                    setSelectedTransaction(null);
                }}
            />

            <SuccessModal
                open={successState.open}
                message={successState.message}
                onOk={() => setSuccessState({ open: false, message: "" })}
            />

            <ErrorModal
                open={errorState.open}
                message={errorState.message}
                onClose={() => setErrorState({ open: false, message: "" })}
            />
        </div>
    );
}
