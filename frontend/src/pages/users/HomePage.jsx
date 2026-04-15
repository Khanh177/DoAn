import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../../layouts/Header';
import { motion } from "framer-motion";
import api from '../../api/axios';

function TrangChu() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState(null);

  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);

  const [domesticToday, setDomesticToday] = useState([]);      // [{brand, buy_price, sell_price}]
  const [domesticYesterday, setDomesticYesterday] = useState([]); // same shape
  const [loadingDomestic, setLoadingDomestic] = useState(false);

  const navigate = useNavigate();

  const handleStartClick = () => {
    const token = localStorage.getItem("access_token");
    if (token) navigate("/domestic-gold");
    else navigate("/login");
  };

  const fmtDate = (d) => {
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const BRANDS_ORDER = ['SJC', 'BTMC SJC', 'DOJI HN', 'DOJI SG', 'PNJ HCM', 'PNJ HN', 'Phú Quý SJC'];

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const uname = localStorage.getItem("username");
    const uid = localStorage.getItem("user_id");
    setIsLoggedIn(!!token);
    if (uname) setUsername(uname);
    if (uid) setUserId(Number(uid));

    fetchNews();
    fetchDomestic();
  }, []);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/news", { params: { skip: 0, limit: 1000 } });
      setNews(Array.isArray(data) ? data : []);
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDomestic = async () => {
    try {
      setLoadingDomestic(true);
      const todayStr = fmtDate(new Date());
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yStr = fmtDate(y);

      const [{ data: t }, { data: yd }] = await Promise.all([
        api.get("/domestic-gold/gold-price", { params: { d: todayStr } }),
        api.get("/domestic-gold/gold-price", { params: { d: yStr } }),
      ]);

      const norm = (arr) => (Array.isArray(arr) ? arr.map(r => ({
        brand: r.display_name,
        buy_price: Number(r.buy_price || 0),
        sell_price: Number(r.sell_price || 0),
      })) : []);

      setDomesticToday(norm(t));
      setDomesticYesterday(norm(yd));
    } catch {
      setDomesticToday([]);
      setDomesticYesterday([]);
    } finally {
      setLoadingDomestic(false);
    }
  };

  const lastSellMap = domesticYesterday.reduce((m, r) => {
    m[r.brand] = r.sell_price || 0;
    return m;
  }, {});

  const domesticList = (() => {
    const mapToday = domesticToday.reduce((m, r) => { m[r.brand] = r; return m; }, {});
    const ordered = BRANDS_ORDER
      .filter(b => mapToday[b])
      .map(b => mapToday[b]);

    // fallback: nếu không có đủ theo order thì nối phần còn lại
    const rest = domesticToday.filter(r => !BRANDS_ORDER.includes(r.brand));
    return [...ordered, ...rest];
  })();

  const renderChange = (brand, todaySell) => {
    const ySell = lastSellMap[brand];
    if (!ySell) return <div className="text-xs text-gray-400">—</div>;
    const diffPct = ((todaySell - ySell) / ySell) * 100;
    const up = diffPct > 0;
    return (
      <div className={`text-xs ${up ? "text-green-500" : "text-red-500"}`}>
        {up ? "+" : ""}{diffPct.toFixed(2)}%
      </div>
    );
  };

  return (
    <div className="bg-white text-black min-h-screen">
      <Header
        isLoggedIn={isLoggedIn}
        setIsLoggedIn={setIsLoggedIn}
        username={username}
        setUsername={setUsername}
      />

      <section className="relative flex flex-col-reverse md:flex-row mx-auto justify-between items-center gap-9 md:gap-4 max-w-[1300px] py-4 my-12">
        <div className="md:w-[520px] z-20">
          <motion.h1
            className="text-3xl md:text-[36px] lg:text-[46px] leading-[56px] text-black font-bold"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <span className="text-[#C0B7E8]">Trang </span>cung cấp thông tin về
            <span className="text-[#C0B7E8]"> giá vàng trong nước và thế giới</span>
          </motion.h1>

          <motion.div
            className="flex items-center gap-3 pt-5 group"
            initial="hidden"
            animate="visible"
            whileHover="hover"
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
            }}
          >
            <motion.button
              onClick={handleStartClick}
              className="uppercase font-bold text-xs rounded-[40px] py-2 lg:py-4 px-4 lg:px-9 text-[#302c42] bg-gradient-to-r from-[#F8D12F] to-[#FFD84E] shadow-md transition-all duration-300"
              variants={{ rest: { scale: 1 }, hover: { scale: 1.05 } }}
              whileHover={{ background: "linear-gradient(to right, #FFE35A, #F8D12F)", boxShadow: "0 0 20px #F8D12F80" }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              Hãy bắt đầu
            </motion.button>

            <motion.svg
              className="w-8 h-6 sm:w-12 sm:h-9"
              viewBox="0 0 46 38"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0, transition: { delay: 0.3, duration: 0.6 } },
                hover: { x: 18 },
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <path
                d="M43.8334 19L2.16669 19M43.8334 19L27.1667 35.6667M43.8334 19L27.1667 2.33333"
                stroke="#302c42"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          </motion.div>
        </div>

        <div className="flex flex-col gap-6 w-full md:w-[600px]">
          <div className="bg-white p-6 rounded-2xl" style={{ boxShadow: '0 0 12px rgba(0,0,0,0.1)' }}>
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-md font-semibold">Phổ biến</h1>
            </div>

            <div className="flex justify-between items-center mb-4 mt-4">
              <h3 className="text-md font-semibold">Vàng trong nước</h3>
              <Link to="/domestic-gold">
                <span className="text-sm text-gray-500 hover:underline">Xem tất cả loại vàng</span>
              </Link>
            </div>

            {/* Dynamic domestic gold list */}
            {loadingDomestic ? (
              <p className="text-gray-500 text-sm">Đang tải giá vàng…</p>
            ) : domesticList.length === 0 ? (
              <p className="text-gray-500 text-sm">Không có dữ liệu.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {domesticList.slice(0, 7).map((item) => (
                  <li key={item.brand} className="flex justify-between items-center">
                    <div className="font-semibold text-gray-800">{item.brand}</div>
                    <div className="text-right">
                      <div className="font-bold text-black">
                        {Number(item.sell_price || 0).toLocaleString('vi-VN')} VNĐ
                      </div>
                      {renderChange(item.brand, Number(item.sell_price || 0))}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-between items-center mb-4 mt-6">
              <h3 className="text-md font-semibold">Vàng thế giới</h3>
              <Link to="/vang-the-gioi">
                <span className="text-sm text-gray-500 hover:underline">Xem tất cả loại vàng</span>
              </Link>
            </div>

            <ul className="space-y-3 text-sm">
              <li className="flex justify-between items-center">
                <div className="font-semibold text-gray-800">XAU</div>
                <div className="text-right"></div>
              </li>
            </ul>
          </div>

          <div className="bg-white p-6 rounded-2xl" style={{ boxShadow: '0 0 12px rgba(0,0,0,0.1)' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-md font-bold">Tin tức</h2>
              <Link to="/news">
                <span className="text-sm text-gray-500 hover:underline font-bold">Xem tất cả tin tức</span>
              </Link>
            </div>

            {loading ? (
              <p className="text-gray-500 text-sm">Đang tải tin tức...</p>
            ) : news.length === 0 ? (
              <p className="text-gray-500 text-sm">Không có tin tức nào.</p>
            ) : (
              <ul className="space-y-2 text-sm text-black">
                {news.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <Link to={`/news/${n.id}`} className="hover:underline block truncate">
                      {n.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default TrangChu;
