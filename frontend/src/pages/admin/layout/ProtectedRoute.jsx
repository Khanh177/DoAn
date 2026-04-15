import { Navigate, Outlet, useLocation } from "react-router-dom";

const isExpired = (token) => {
    try {
        const { exp } = JSON.parse(atob(token.split(".")[1]));
        return Date.now() >= exp * 1000;
    } catch {
        return false; // nếu không phải JWT thì bỏ qua
    }
};

export default function ProtectedRoute({ children, allowedRoles }) {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("role"); // nếu có lưu vai trò
    const location = useLocation();

    if (!token || isExpired(token) || (allowedRoles && !allowedRoles.includes(role))) {
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    // Hỗ trợ bọc children hoặc dùng như parent route
    return children ?? <Outlet />;
}
