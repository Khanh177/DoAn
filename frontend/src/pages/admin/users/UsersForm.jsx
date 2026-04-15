import React, { useEffect, useMemo, useState } from "react";
import api from "../../../api/axios";
import UsersAddEditForm from "./UsersAddEditForm";
import UsersBlockToggleModal from "./UsersBlockUnBlockForm";
import SuccessModal from "../../admin/components/SuccessModal";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import {
  FiEdit2,
  FiUserX,
  FiUserCheck,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";

export default function UsersForm() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [showBlockToggle, setShowBlockToggle] = useState(false);
  const [blockTargetUser, setBlockTargetUser] = useState(null);

  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [sortField, setSortField] = useState("id");
  const [sortOrder, setSortOrder] = useState("desc");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/auth", { params: { skip: 0, limit: 1000 } });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "Lỗi tải users";
      setError(msg);
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const { data } = await api.get("/auth/roles", { params: { skip: 0, limit: 1000 } });
      setRoles(Array.isArray(data) ? data : []);
    } catch {
      setShowErrorModal(true);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const roleName = (role_id) => roles.find((r) => r.id === role_id)?.name || `#${role_id}`;

  const toggleSort = (field) => {
    if (sortField === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const iconFor = (field) =>
    sortField !== field ? (
      <FaSort className="inline ml-1 text-gray-400" />
    ) : sortOrder === "asc" ? (
      <FaSortUp className="inline ml-1" />
    ) : (
      <FaSortDown className="inline ml-1" />
    );

  const sortedUsers = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      const av =
        sortField === "role_id"
          ? roleName(a.role_id).toLowerCase()
          : sortField === "full_name"
            ? `${a.last_name || ""} ${a.first_name || ""}`.trim().toLowerCase()
            : a[sortField];
      const bv =
        sortField === "role_id"
          ? roleName(b.role_id).toLowerCase()
          : sortField === "full_name"
            ? `${b.last_name || ""} ${b.first_name || ""}`.trim().toLowerCase()
            : b[sortField];

      if (typeof av === "number" && typeof bv === "number")
        return sortOrder === "asc" ? av - bv : bv - av;

      const as = String(av ?? "").toLowerCase();
      const bs = String(bv ?? "").toLowerCase();
      if (as < bs) return sortOrder === "asc" ? -1 : 1;
      if (as > bs) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [users, sortField, sortOrder, roles]);

  const totalPages = Math.ceil(sortedUsers.length / pageSize) || 1;

  const currentItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedUsers.slice(start, start + pageSize);
  }, [sortedUsers, page, pageSize]);

  const pageRange = (current, total, delta = 1) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const left = Math.max(2, current - delta);
    const right = Math.min(total - 1, current + delta);
    const range = [1];
    if (left > 2) range.push("…");
    for (let i = left; i <= right; i++) range.push(i);
    if (right < total - 1) range.push("…");
    range.push(total);
    return range;
  };

  const openAdd = () => {
    setEditingUser(null);
    setShowAddEdit(true);
  };
  const openEdit = (u) => {
    setEditingUser(u);
    setShowAddEdit(true);
  };
  const openToggleBlock = (user) => {
    setBlockTargetUser(user);
    setShowBlockToggle(true);
  };

  const onToggleDone = (evt) => {
    if (!evt?.type || !evt?.userId) return;
    if (evt.type === "block") {
      setUsers((prev) => prev.map((u) => (u.id === evt.userId ? { ...u, banned: 1 } : u)));
      setSuccessMsg("Đã chặn user!");
    } else {
      setUsers((prev) => prev.map((u) => (u.id === evt.userId ? { ...u, banned: 0 } : u)));
      setSuccessMsg("Đã bỏ chặn user!");
    }
    setShowSuccess(true);
  };

  // CHỈ set message + mở modal; KHÔNG fetch ở đây
  const onSaved = (evt) => {
    if (evt?.type === "add") setSuccessMsg("Đã thêm thành công người dùng mới");
    else if (evt?.type === "edit") setSuccessMsg("Đã cập nhật người dùng thành công");
    else setSuccessMsg("Thành công");
    setShowSuccess(true);
  };

  // Bấm OK thì reload dữ liệu (loading spinner sẽ hiện)
  const handleSuccessOk = async () => {
    setShowSuccess(false);
    await fetchUsers();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-yellow-500" />
      </div>
    );
  }
  if (error && !showErrorModal) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-red-50 border border-red-200 text-red-700 rounded">
        {error}
      </div>
    );
  }

  const indexOfFirstItem = (page - 1) * pageSize;
  const indexOfLastItem = Math.min(indexOfFirstItem + pageSize, sortedUsers.length);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Quản lý tài khoản người dùng</h1>
            <p className="text-gray-500 text-sm">Xem và quản lý danh sách người dùng</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2 rounded-lg shadow-md"
            >
              + Thêm User
            </button>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-gray-800">
              <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left w-20">
                    <button
                      onClick={() => toggleSort("id")}
                      className="inline-flex items-center gap-1 font-semibold tracking-wide"
                    >
                      ID {iconFor("id")}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left">Họ tên</th>
                  <th className="px-6 py-3 text-left w-56">
                    <button
                      onClick={() => toggleSort("username")}
                      className="inline-flex items-center gap-1 font-semibold tracking-wide"
                    >
                      Username {iconFor("username")}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left w-40">
                    <button
                      onClick={() => toggleSort("role_id")}
                      className="inline-flex items-center gap-1 font-semibold tracking-wide"
                    >
                      Role {iconFor("role_id")}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left w-40">Trạng thái</th>
                  <th className="px-6 py-3 text-right w-44">Hành động</th>
                </tr>
              </thead>

              <tbody className="[&>tr]:transition-colors">
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-gray-400">
                      Không có user nào.
                    </td>
                  </tr>
                ) : (
                  currentItems.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-6 py-3 font-semibold text-gray-700 tabular-nums">#{user.id}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gray-100 grid place-items-center">
                            <span className="text-sm font-medium text-gray-700">
                              {(user.last_name || user.username || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="font-medium text-gray-900 max-w-[32ch] truncate">
                            {(user.last_name || "") + " " + (user.first_name || "")}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-800">{user.username}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {roleName(user.role_id)}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {user.banned === 1 ? (
                          <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            Đã chặn
                          </span>
                        ) : (
                          <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Hoạt động
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition"
                            aria-label="Sửa"
                          >
                            <FiEdit2 className="text-[18px]" />
                          </button>
                          <button
                            onClick={() => openToggleBlock(user)}
                            className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border transition ${user.banned === 1
                                ? "border-green-300 text-green-700 hover:bg-green-50"
                                : "border-red-300 text-red-700 hover:bg-red-50"
                              }`}
                            aria-label={user.banned === 1 ? "Bỏ chặn" : "Chặn"}
                          >
                            {user.banned === 1 ? (
                              <FiUserCheck className="text-[18px]" />
                            ) : (
                              <FiUserX className="text-[18px]" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-4 py-4 border-t bg-gray-50">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span>
                  Trang <span className="font-semibold">{page}</span> / {totalPages}
                </span>
                <div className="hidden sm:flex items-center gap-2">
                  <span>Hiển thị</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="border rounded-lg px-2 py-1 bg-white"
                  >
                    {[8, 12, 16, 24].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span>bài/trang</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                  aria-label="Trang đầu"
                >
                  <FiChevronsLeft />
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                  aria-label="Trang trước"
                >
                  <FiChevronLeft />
                </button>

                {pageRange(page, totalPages, 1).map((p, i) =>
                  p === "…" ? (
                    <span key={`dots-${i}`} className="px-2 text-gray-500">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-9 px-3 rounded-lg border text-sm font-medium transition ${page === p
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      aria-current={page === p ? "page" : undefined}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                  aria-label="Trang sau"
                >
                  <FiChevronRight />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="h-9 w-9 rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                  aria-label="Trang cuối"
                >
                  <FiChevronsRight />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <UsersAddEditForm
        open={showAddEdit}
        onClose={() => setShowAddEdit(false)}
        onSaved={onSaved}
        roles={roles}
        user={editingUser}
      />

      <UsersBlockToggleModal
        open={showBlockToggle}
        user={blockTargetUser}
        onClose={() => setShowBlockToggle(false)}
        onDone={onToggleDone}
      />

      <SuccessModal open={showSuccess} message={successMsg} onOk={handleSuccessOk} />

      {showErrorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-2">Lỗi!</h3>
            <button
              onClick={() => setShowErrorModal(false)}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
