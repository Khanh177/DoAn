import React, { useEffect, useMemo, useState } from "react";
import api from "../../../api/axios";
import NewsAddEditForm from "./NewsAddEditForm";
import NewsDeleteForm from "./NewsDeleteForm";
import SuccessModal from "../../admin/components/SuccessModal";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import {
  FiEdit2,
  FiTrash2,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";

export default function NewsForm() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const [sortField, setSortField] = useState("id");
  const [sortOrder, setSortOrder] = useState("desc");

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/news", { params: { skip: 0, limit: 1000 } });
      setArticles(Array.isArray(data) ? data : []);
    } catch {
      setErr("Lỗi tải danh sách bài viết");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchArticles();
  }, []);

  const sorted = useMemo(() => {
    const arr = [...articles];
    arr.sort((a, b) => {
      const A = a[sortField];
      const B = b[sortField];
      if (sortField === "id") return sortOrder === "asc" ? A - B : B - A;
      if (sortField === "published_date")
        return sortOrder === "asc"
          ? new Date(A) - new Date(B)
          : new Date(B) - new Date(A);
      return sortOrder === "asc"
        ? String(A ?? "").localeCompare(String(B ?? ""))
        : String(B ?? "").localeCompare(String(A ?? ""));
    });
    return arr;
  }, [articles, sortField, sortOrder]);

  const totalPages = Math.ceil(sorted.length / pageSize) || 1;

  const currentItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

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

  const handleDeleteConfirm = async () => {
    try {
      await api.delete(`/news/${deleteId}`);
      setSuccessMsg(`Đã xóa bài #${deleteId}`);
      setShowSuccess(true);
    } catch {
      setSuccessMsg(`Xóa bài #${deleteId} thất bại`);
      setShowSuccess(true);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleSuccessOk = async () => {
    setShowSuccess(false);
    await fetchArticles();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-yellow-500" />
      </div>
    );
  }
  if (err) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-red-50 border border-red-200 text-red-700 rounded">
        {err}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Quản lý tin tức</h1>
            <p className="text-gray-500 text-sm">Xem và quản lý danh sách tin tức</p>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2 rounded-lg shadow-md"
          >
            + Thêm bài viết
          </button>
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
                  <th className="px-6 py-3 text-left w-20">Ảnh</th>
                  <th className="px-6 py-3 text-left">Tiêu đề</th>
                  <th className="px-6 py-3 text-left w-40">Tác giả</th>
                  <th className="px-6 py-3 text-left w-40">
                    <button
                      onClick={() => toggleSort("published_date")}
                      className="inline-flex items-center gap-1 font-semibold tracking-wide"
                    >
                      Ngày đăng {iconFor("published_date")}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right w-44">Hành động</th>
                </tr>
              </thead>

              <tbody className="[&>tr]:transition-colors">
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-gray-400">
                      Không có bài viết nào.
                    </td>
                  </tr>
                ) : (
                  currentItems.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-6 py-3 font-semibold text-gray-700 tabular-nums">
                        #{a.id}
                      </td>
                      <td className="px-6 py-3">
                        {a.image ? (
                          <img
                            src={a.image}
                            alt=""
                            className="w-12 h-12 object-cover rounded-lg ring-1 ring-gray-200"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-200 rounded-lg grid place-items-center text-gray-400 text-xs">
                            No
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 font-medium max-w-[42ch] truncate">
                        {a.title}
                      </td>
                      <td className="px-6 py-3 text-gray-700 truncate">
                        {a.author || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {a.published_date
                          ? new Date(a.published_date).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditing(a);
                              setShowForm(true);
                            }}
                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition"
                            aria-label="Sửa"
                          >
                            <FiEdit2 className="text-[18px]" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteId(a.id);
                              setShowDeleteConfirm(true);
                            }}
                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition"
                            aria-label="Xóa"
                          >
                            <FiTrash2 className="text-[18px]" />
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

      <NewsAddEditForm
        open={showForm}
        onClose={() => setShowForm(false)}
        initial={editing}
        onSaved={async (evt) => {
          if (evt?.type === "add") setSuccessMsg("Đã thêm bài thành công");
          else if (evt?.type === "edit") setSuccessMsg("Đã cập nhật bài thành công");
          setShowSuccess(true);
        }}
      />

      <NewsDeleteForm
        open={showDeleteConfirm}
        deleteId={deleteId}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      <SuccessModal
        open={showSuccess}
        message={successMsg}
        onOk={handleSuccessOk}
      />
    </div>
  );
}