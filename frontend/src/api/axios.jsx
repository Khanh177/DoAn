import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000", // nhớ CORS allow http://localhost:5173
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // nếu sau này cần cookie
});

// ---- REQUEST INTERCEPTOR ----
// Tự động gắn Authorization cho mọi request nếu có token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---- RESPONSE INTERCEPTOR ----
// Bắt 401/403 toàn cục, có thể điều hướng login hoặc xoá token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      // Token hết hạn / sai -> xử lý chung
      // Ví dụ: xoá token + điều hướng tới /login
      localStorage.removeItem("access_token");
      // window.location.href = "/login"; // bật nếu muốn auto chuyển login
    }

    if (status === 403) {
      // Không đủ quyền
      // Có thể hiện toast/global message tuỳ bạn
    }

    return Promise.reject(error);
  }
);

export default api;
