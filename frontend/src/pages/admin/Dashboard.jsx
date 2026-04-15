import React, { useEffect, useState } from "react";
import { FaUsers, FaMoneyBillWave, FaNewspaper, FaExchangeAlt } from "react-icons/fa";
import api from "../../api/axios";

export default function Dashboard() {
    const [newsCount, setNewsCount] = useState(0);
    const [userCount, setUserCount] = useState(0);
    const [depositCount, setDepositCount] = useState(0);
    const [napGiaoDichCount, setNapGiaoDichCount] = useState(0);

    useEffect(() => {
        const fetchNewsCount = async () => {
            try {
                const res = await api.get("/news", { params: { skip: 0, limit: 1000 } });

                const newsData = Array.isArray(res.data) ? res.data : res.data?.data || [];

                setNewsCount(newsData.length);
            } catch (error) {
                console.error("Lỗi khi lấy số lượng tin tức:", error);
            }
        };

        fetchNewsCount();
    }, []);

    useEffect(() => {
        const fetchUsersCount = async () => {
            try {
                const res = await api.get("/auth", { params: { skip: 0, limit: 1000 } });

                const usersData = Array.isArray(res.data) ? res.data : res.data?.data || [];

                setUserCount(usersData.length);
            } catch (error) {
                console.error("Lỗi khi lấy số lượng người dùng:", error);
            }
        };

        fetchUsersCount();
    }, []);

    useEffect(() => {
        const fetchDepositCount = async () => {
            try {
                // gọi admin endpoint của bạn
                const res = await api.get("/deposit/list", {
                    params: { page: 1, size: 1 }, // chỉ cần total
                });
                const total = Number(res.data?.total || 0);
                setNapGiaoDichCount(total); // nếu bạn muốn hiển thị ở ô "Nạp tiền"
            } catch (error) {
                console.error("Lỗi khi lấy số lượng nạp tiền:", error);
            }
        };
        fetchDepositCount();
    }, []);

    const stats = [
        {
            title: "Người dùng",
            count: userCount,
            icon: <FaUsers className="text-blue-500 text-3xl" />,
        },
        {
            title: "Giao dịch",
            count: 567,
            icon: <FaExchangeAlt className="text-green-500 text-3xl" />,
        },
        {
            title: "Giao dịch nạp tiền",
            count: napGiaoDichCount,
            icon: <FaMoneyBillWave className="text-yellow-500 text-3xl" />,
        },
        {
            title: "Tin tức",
            count: newsCount,
            icon: <FaNewspaper className="text-purple-500 text-3xl" />,
        },
    ];

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Thống kê tổng quan</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((item, index) => (
                    <div
                        key={index}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex items-center justify-between"
                    >
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{item.title}</p>
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{item.count}</h2>
                        </div>
                        <div>{item.icon}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
