// frontend/src/pages/user/ChatBot.jsx

import React, { useState, useEffect, useRef } from "react";
import { SendHorizonal, Trash2, History } from "lucide-react";
import Header from "../../../layouts/Header";
import ConfirmModal from "../../../layouts/ConfirmModal";
import SuccessModal from "../../../layouts/SuccessModal";
import ErrorModal from "../../../layouts/ErrorModal";
import api from "../../../api/axios";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    LabelList,
} from "recharts";

export default function ChatBot() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [userId, setUserId] = useState(null);

    const [messages, setMessages] = useState([
        {
            from: "bot",
            text:
                "Chào bạn!\n" +
                '- Gõ: "hôm nay" để dự đoán giá vàng hôm nay.\n' +
                "- Hoặc nhập SỐ ngày muốn dự đoán (1–30) để xem nhiều ngày tiếp theo.\n\n" +
                "Lưu ý: Kết quả chỉ mang tính chất tham khảo, không phải khuyến nghị đầu tư.",
        },
    ]);
    const [input, setInput] = useState("");

    const [chartData, setChartData] = useState([]);
    const [showChart, setShowChart] = useState(false);
    const [awaitingChartConfirm, setAwaitingChartConfirm] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Modal states
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [modalMessage, setModalMessage] = useState("");

    const messagesEndRef = useRef(null);

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        const uname = localStorage.getItem("username");
        const uid = localStorage.getItem("user_id");
        setIsLoggedIn(!!token);
        if (uname) setUsername(uname);
        if (uid) setUserId(Number(uid));

        // Tự động load lịch sử chat khi component mount
        if (uid) {
            loadChatHistory(Number(uid));
        }
    }, []);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, showChart]);

    // Hàm load lịch sử chat từ database
    const loadChatHistory = async (uid) => {
        setIsLoadingHistory(true);
        try {
            const res = await api.get("/ai/gold/chat/history", {
                params: { user_id: uid, limit: 100 },
            });

            if (res.data && res.data.length > 0) {
                const historyMessages = res.data.map((msg) => ({
                    from: msg.role,
                    text: msg.text,
                }));

                // Thêm tin nhắn chào mừng ở đầu nếu cần
                const welcomeMsg = {
                    from: "bot",
                    text:
                        "Chào mừng trở lại!\n" +
                        '- Gõ: "hôm nay" để dự đoán giá vàng hôm nay.\n' +
                        "- Hoặc nhập SỐ ngày muốn dự đoán (1–30).\n",
                };

                setMessages([welcomeMsg, ...historyMessages]);
            }
        } catch (err) {
            console.error("Không thể load lịch sử chat:", err);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    // Hàm lưu tin nhắn vào database
    const saveMessage = async (role, text) => {
        try {
            await api.post("/ai/gold/chat/message", {
                user_id: userId,
                role: role,
                text: text,
            });
        } catch (err) {
            console.error("Không thể lưu tin nhắn:", err);
        }
    };

    // Hàm xóa lịch sử chat
    const clearChatHistory = async () => {
        try {
            await api.delete("/ai/gold/chat/history", {
                params: { user_id: userId },
            });

            // Reset về tin nhắn chào mừng ban đầu
            setMessages([
                {
                    from: "bot",
                    text:
                        "Chào bạn!\n" +
                        '- Gõ: "hôm nay" để dự đoán giá vàng hôm nay.\n' +
                        "- Hoặc nhập SỐ ngày muốn dự đoán (1–30).\n\n" +
                        "Lưu ý: Kết quả chỉ mang tính chất tham khảo.",
                },
            ]);
            setShowChart(false);
            setAwaitingChartConfirm(false);

            // Hiển thị success modal
            setModalMessage("Đã xóa lịch sử chat thành công!");
            setShowSuccessModal(true);
            setShowConfirmDelete(false);
        } catch (err) {
            console.error("Không thể xóa lịch sử:", err);
            setModalMessage("Có lỗi xảy ra khi xóa lịch sử chat.");
            setShowErrorModal(true);
            setShowConfirmDelete(false);
        }
    };

    const sendMessage = async () => {
        const raw = input.trim();
        if (!raw) return;
        const lower = raw.toLowerCase();

        // Đang chờ "có / không" để vẽ sơ đồ
        if (awaitingChartConfirm) {
            if (["có", "co", "yes", "y"].includes(lower)) {
                setShowChart(true);
                const userMsg = { from: "user", text: raw };
                const botMsg = {
                    from: "bot",
                    text: "Đã hiển thị sơ đồ dự đoán giá vàng.\n\nBạn có thể tiếp tục gõ 'hôm nay' hoặc số ngày (1-30) để dự đoán mới."
                };

                setMessages((prev) => [...prev, userMsg, botMsg]);

                // Lưu vào DB
                await saveMessage("user", raw);
                await saveMessage("bot", botMsg.text);

                setAwaitingChartConfirm(false);
                setInput("");
                return;
            }
            if (["không", "khong", "no", "n"].includes(lower)) {
                setShowChart(false);
                const userMsg = { from: "user", text: raw };
                const botMsg = {
                    from: "bot",
                    text: "Ok, không hiển thị sơ đồ.\n\nBạn có thể tiếp tục gõ 'hôm nay' hoặc số ngày (1-30) để dự đoán mới."
                };

                setMessages((prev) => [...prev, userMsg, botMsg]);

                await saveMessage("user", raw);
                await saveMessage("bot", botMsg.text);

                setAwaitingChartConfirm(false);
                setInput("");
                return;
            }
            // gõ thứ khác => coi như yêu cầu dự đoán mới
            setAwaitingChartConfirm(false);
            setShowChart(false); // Tắt chart cũ khi bắt đầu dự đoán mới
        }

        let days = null;
        let isTodayOnly = false;

        if (lower === "hôm nay" || lower === "hom nay" || lower === "today") {
            days = 1;
            isTodayOnly = true;
        } else {
            const parsed = parseInt(raw, 10);
            if (!Number.isNaN(parsed)) days = parsed;
        }

        if (days === null || days < 1 || days > 30) {
            const userMsg = { from: "user", text: raw };
            const botMsg = {
                from: "bot",
                text:
                    'Giá trị không hợp lệ.\n' +
                    '- Gõ: "hôm nay" để dự đoán giá vàng hôm nay.\n' +
                    "- Hoặc nhập số từ 1 đến 30.",
            };

            setMessages((prev) => [...prev, userMsg, botMsg]);

            await saveMessage("user", raw);
            await saveMessage("bot", botMsg.text);

            setInput("");
            return;
        }

        const userText =
            isTodayOnly || days === 1
                ? "Dự đoán giá vàng hôm nay"
                : `Dự đoán giá vàng ${days} ngày tiếp theo`;

        setMessages((prev) => [...prev, { from: "user", text: userText }]);
        await saveMessage("user", userText);

        setInput("");

        try {
            const res = await api.get("/ai/gold/forecast", { params: { days } });
            const data = res.data;

            const lines = [];

            if (data.today_date) {
                lines.push(
                    `Giá vàng gần nhất trong dữ liệu (${data.today_date}): ${data.today_price.toFixed(
                        2
                    )} USD.`
                );
            } else {
                lines.push(
                    `Giá vàng gần nhất trong dữ liệu: ${data.today_price.toFixed(2)} USD.`
                );
            }

            if (days === 1 && data.items && data.items.length > 0) {
                const item = data.items[0];
                const dir = item.change_pct >= 0 ? "tăng" : "giảm";
                lines.push(
                    `Dự đoán GIÁ VÀNG HÔM NAY (${item.date}): ` +
                    `${item.price.toFixed(2)} USD (${dir} ${item.change_pct.toFixed(
                        2
                    )}% so với ngày trước đó).`
                );
            } else if (data.items && data.items.length > 0) {
                lines.push(`Dự đoán ${days} ngày tiếp theo:`);
                data.items.forEach((item) => {
                    const dir = item.change_pct >= 0 ? "tăng" : "giảm";
                    lines.push(
                        `• ${item.date}: ${item.price.toFixed(2)} USD (${dir} ${item.change_pct.toFixed(
                            2
                        )}% so với giá ngày gần nhất trong dữ liệu).`
                    );
                });
                lines.push(
                    `Khoảng dao động dự đoán: ${data.min_price.toFixed(
                        2
                    )} – ${data.max_price.toFixed(
                        2
                    )} USD (biên độ ${data.range.toFixed(2)} USD).`
                );
            }

            lines.push(
                "\nLưu ý: Kết quả chỉ mang tính chất tham khảo, không phải khuyến nghị đầu tư."
            );

            // Chuẩn bị data vẽ chart
            const historyPoints =
                (data.history || []).map((h) => ({
                    name: h.date,
                    historyPrice: Number(h.price),
                    forecastPrice: null,
                })) || [];

            let combined = [...historyPoints];

            if (data.items && data.items.length > 0) {
                const lastHist = historyPoints[historyPoints.length - 1];
                const connectorPoint = lastHist
                    ? {
                        name: lastHist.name,
                        historyPrice: null,
                        forecastPrice: lastHist.historyPrice,
                    }
                    : null;

                const forecastPoints = data.items.map((f) => ({
                    name: f.date,
                    historyPrice: null,
                    forecastPrice: Number(f.price),
                }));

                combined = connectorPoint
                    ? [...historyPoints, connectorPoint, ...forecastPoints]
                    : [...historyPoints, ...forecastPoints];
            }

            setChartData(combined);
            setShowChart(false);
            setAwaitingChartConfirm(true);

            const botMsg1 = { from: "bot", text: lines.join("\n") };
            const botMsg2 = {
                from: "bot",
                text:
                    'Bạn có muốn xem sơ đồ biến động giá cho dự đoán này không? ' +
                    'Gõ "có" hoặc "không".',
            };

            setMessages((prev) => [...prev, botMsg1, botMsg2]);

            // Lưu vào DB
            await saveMessage("bot", botMsg1.text);
            await saveMessage("bot", botMsg2.text);

        } catch (err) {
            console.error(err);
            const botMsg = {
                from: "bot",
                text: "Không gọi được API dự đoán, vui lòng thử lại sau.",
            };

            setMessages((prev) => [...prev, botMsg]);
            await saveMessage("bot", botMsg.text);
        }
    };

    return (
        <div className="bg-[#ffffff] text-black h-screen">
            <Header
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                username={username}
                setUsername={setUsername}
            />

            <div className="h-[calc(100vh-80px)] flex items-center justify-center px-4 bg-gray-100 p-5">
                <div className="w-full max-w-2xl bg-white rounded-xl shadow-md flex flex-col p-4 h-full">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-lg font-bold text-center flex-1">
                            💬 Chatbot Dự Đoán Giá Vàng
                        </div>

                        {isLoggedIn && (
                            <button
                                onClick={() => setShowConfirmDelete(true)}
                                className="ml-2 p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Xóa lịch sử chat"
                            >
                                <Trash2 size={20} />
                            </button>
                        )}
                    </div>

                    {isLoadingHistory && (
                        <div className="text-center text-gray-500 py-2">
                            <History className="inline-block animate-spin mr-2" size={16} />
                            Đang tải lịch sử chat...
                        </div>
                    )}

                    {/* Chat + chart trong cùng vùng scroll */}
                    <div className="flex-1 overflow-y-auto space-y-3 mb-4 flex flex-col">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`whitespace-pre-line p-3 rounded-lg max-w-[80%] ${msg.from === "user"
                                        ? "bg-yellow-100 self-end ml-auto text-right"
                                        : "bg-gray-200 self-start"
                                    }`}
                            >
                                {msg.text}
                            </div>
                        ))}

                        {showChart && chartData.length > 0 && (
                            <div className="self-stretch">
                                <div className="h-72 border rounded-lg p-3 bg-yellow-300 overflow-hidden">
                                    <div className="text-sm font-semibold mb-2">
                                        Biểu đồ lịch sử + dự đoán giá vàng
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData}>
                                            <CartesianGrid
                                                stroke="#ffffff"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                dataKey="name"
                                                tick={{ fontSize: 10 }}
                                                angle={-30}
                                                textAnchor="end"
                                                height={50}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 10 }}
                                                domain={["dataMin - 50", "dataMax + 50"]}
                                            />
                                            <Tooltip
                                                formatter={(value) =>
                                                    `${Number(value).toFixed(2)} USD`
                                                }
                                                labelFormatter={(label) =>
                                                    `Ngày: ${label}`
                                                }
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="historyPrice"
                                                stroke="#0000ff"
                                                strokeWidth={2}
                                                dot={false}
                                                name="Historical Price"
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="forecastPrice"
                                                stroke="#ff0000"
                                                strokeWidth={2.5}
                                                strokeDasharray="5 3"
                                                dot={{ r: 4 }}
                                                name="Forecast"
                                            >
                                                <LabelList
                                                    dataKey="forecastPrice"
                                                    position="top"
                                                    formatter={(v) =>
                                                        Number(v).toFixed(0)
                                                    }
                                                />
                                            </Line>
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="flex border rounded-lg overflow-hidden">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                            placeholder={
                                awaitingChartConfirm
                                    ? 'Trả lời "có" hoặc "không"...'
                                    : 'Gõ "hôm nay" hoặc nhập số ngày (1–30)...'
                            }
                            className="flex-1 px-4 py-2 focus:outline-none"
                        />
                        <button
                            onClick={sendMessage}
                            className="bg-yellow-400 px-4 py-2 hover:bg-yellow-500 flex items-center justify-center"
                        >
                            <SendHorizonal size={20} />
                        </button>
                    </div>

                    <div className="mt-2 text-xs text-gray-500 text-center">
                        Giá vàng chỉ mang tính chất tham khảo, không phải khuyến nghị mua bán.
                        Phạm vi dự đoán: 1–30 ngày.
                        {isLoggedIn && " Lịch sử chat được lưu tự động."}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ConfirmModal
                open={showConfirmDelete}
                message="Bạn có chắc muốn xóa toàn bộ lịch sử chat? Hành động này không thể hoàn tác."
                onConfirm={clearChatHistory}
                onCancel={() => setShowConfirmDelete(false)}
            />

            <SuccessModal
                open={showSuccessModal}
                message={modalMessage}
                onOk={() => setShowSuccessModal(false)}
            />

            <ErrorModal
                open={showErrorModal}
                message={modalMessage}
                onClose={() => setShowErrorModal(false)}
            />
        </div>
    );
}