import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { loadAdminSession } from "./session";

/**
 * Chặn route quản trị khi chưa đăng nhập admin hoặc token đã hết hạn (chuyển về /login).
 * Chỉ để cải thiện trải nghiệm: backend luôn tự kiểm tra quyền admin ở từng API.
 */
const RequireAdmin = ({ children, loadSession = loadAdminSession }) => {
    const location = useLocation();
    const session = loadSession();
    if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return children;
};

export default RequireAdmin;
