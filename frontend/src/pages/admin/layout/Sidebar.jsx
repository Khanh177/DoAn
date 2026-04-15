// Sidebar.jsx
import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FaChartBar, FaUsers, FaMoneyCheckAlt, FaWallet, FaNewspaper, FaBars,
  FaCoins,
} from "react-icons/fa";

const items = [
  { to: "/admin/dashboard", label: "Dashboard", icon: FaChartBar },
  { to: "/admin/users", label: "Quản lý người dùng", icon: FaUsers },
  { to: "/admin/deposits", label: "Quản lý nạp tiền", icon: FaWallet },
  { to: "/admin/news", label: "Quản lý tin tức", icon: FaNewspaper },
  { to: "/admin/domestic-gold-price", label: "Giá vàng trong nước", icon: FaCoins },
  { to: "/admin/p2p", label: "Quản lý bài đăng P2P", icon: FaUsers },
  { to: "/admin/p2p/disputes", label: "Quản lý giao dịch P2P", icon: FaMoneyCheckAlt },
  { to: "/admin/giao-dich", label: "Quản lý giao dịch", icon: FaMoneyCheckAlt },
  { to: "/admin/complaints", label: "Quản lý khiếu nại & hỗ trợ", icon: FaMoneyCheckAlt },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const year = new Date().getFullYear();

  return (
    <aside
      className={`flex flex-col h-screen sticky top-0 z-30
                  bg-gradient-to-b from-[#111827] to-[#0b1220] text-white
                  shadow-xl transition-all duration-300
                  ${collapsed ? "w-18" : "w-64"} overflow-x-hidden`}
    >
      {/* header */}
      <div className={`h-16 px-3 flex items-center ${collapsed ? "justify-center" : "justify-between"} border-b border-white/10`}>
        {!collapsed && <div className="font-semibold tracking-wide text-sm">Trang quản lý</div>}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="p-2 rounded-md bg-white/5 hover:bg-white/10 transition cursor-pointer"
          title={collapsed ? "Mở rộng" : "Thu gọn"}
        >
          <FaBars />
        </button>
      </div>

      {/* menu */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `${collapsed
                ? "justify-center px-0"
                : "justify-start px-3"}
               flex items-center gap-3 py-2 rounded-lg transition
               ${isActive ? "bg-white/10 text-white" : "text-slate-200 hover:bg-white/5 hover:text-white"}`
            }
          >
            <Icon className="shrink-0" />
            <span
              className={`text-sm font-medium whitespace-nowrap overflow-hidden
                          transition-[width,opacity] duration-200
                          ${collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}`}
            >
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* footer dính đáy */}
      <div className={`px-3 py-3 text-[11px] text-slate-400/80 border-t border-white/10 ${collapsed ? "text-center" : ""}`}>
        <div className={`${collapsed ? "opacity-0 h-0" : "opacity-100"} transition-all`}>
          © {year} Admin
        </div>
      </div>
    </aside>
  );
}
