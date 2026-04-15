// Header.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaUserCircle, FaSignOutAlt, FaSearch, FaBell, FaChevronDown } from "react-icons/fa";

export default function Header() {
  const [username, setUsername] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const name = localStorage.getItem("username") || "";
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }
    setUsername(name);
  }, [navigate]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const mask = (n) => (!n ? "" : n.length <= 4 ? n : n.slice(0, 2) + "*".repeat(n.length - 4) + n.slice(-2));
  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    window.location.href = "/admin/login";
  };

  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-100">
      <div className="h-16 px-4 sm:px-6 lg:px-8 mx-auto flex items-center justify-between">
        <div className="text-base font-semibold tracking-tight text-gray-800">
          Bảng điều khiển
        </div>

        <div className="flex-1 max-w-xl mx-4">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm nhanh…"
              className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 bg-white
                         focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3" ref={ref}>
          <button className="relative p-2 rounded-full hover:bg-gray-100">
            <FaBell className="text-gray-600" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-red-500 rounded-full" />
          </button>

          <button
            onClick={() => setShowMenu(v => !v)}
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white pl-2 pr-3 py-1.5 hover:shadow-sm"
          >
            <FaUserCircle className="text-gray-600" size={20} />
            <span className="text-sm font-medium text-gray-700 hidden sm:block">{mask(username) || "Admin"}</span>
            <FaChevronDown className="text-gray-400 hidden sm:block" size={12} />
          </button>

          {showMenu && (
            <div className="absolute right-4 top-14 w-56 bg-white border border-gray-100 rounded-xl shadow-xl py-2 z-30">
              <div className="px-4 py-2 text-sm font-semibold text-gray-800 border-b border-gray-100 truncate">
                {mask(username) || "Admin"}
              </div>
              <button
                onClick={logout}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
              >
                <FaSignOutAlt /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
