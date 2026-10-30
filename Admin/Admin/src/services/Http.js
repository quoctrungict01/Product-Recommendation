import axios from "axios";
import { BASE_API } from "../shared/constants/app";
import { ADMIN_TOKEN_KEY, clearAdminSession, isTokenExpired } from "../shared/auth/session";

const Http = axios.create({
    baseURL: BASE_API,
});

// Gửi Bearer token của admin trong mọi request.
Http.interceptors.request.use((config) => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (token && !isTokenExpired(token)) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

/** Chuyển về trang đăng nhập kèm lý do (dùng chung cho 401/403). */
export function redirectToLogin(reason) {
    clearAdminSession();
    if (window.location.pathname !== "/login") window.location.assign(`/login?reason=${encodeURIComponent(reason)}`);
}

// 401: token sai/hết hạn/tài khoản không còn. 403: không còn quyền admin (vd. đã bị hạ quyền).
// Cả hai đều đăng xuất khỏi Admin. Riêng request đăng nhập thì để trang Login tự hiển thị lỗi.
Http.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error && error.response && error.response.status;
        const isLogin = error && error.config && String(error.config.url || "").includes("auth/login");
        if (!isLogin && (status === 401 || status === 403)) redirectToLogin(status === 401 ? "expired" : "forbidden");
        return Promise.reject(error);
    }
);

export default Http;
