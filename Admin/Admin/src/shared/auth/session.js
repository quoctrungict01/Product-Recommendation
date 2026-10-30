// Phiên đăng nhập Admin (lưu localStorage, khóa riêng với trang Shop).
// Chỉ đọc payload JWT để biết hạn dùng — việc xác thực/phân quyền thật sự do backend thực thi.

export const ADMIN_TOKEN_KEY = "admin_token";
export const ADMIN_USER_KEY = "admin_user";

export function decodeTokenPayload(token) {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        return payload && typeof payload === "object" ? payload : null;
    } catch (_) {
        return null;
    }
}

export function isTokenExpired(token, nowMs = Date.now()) {
    const payload = decodeTokenPayload(token);
    if (!payload || typeof payload.exp !== "number") return true;
    return payload.exp <= Math.floor(nowMs / 1000);
}

/** Phiên hợp lệ phía giao diện: có token chưa hết hạn và user có role admin; ngược lại xóa và trả null. */
export function loadAdminSession(storage = window.localStorage, nowMs = Date.now()) {
    try {
        const token = storage.getItem(ADMIN_TOKEN_KEY);
        const user = JSON.parse(storage.getItem(ADMIN_USER_KEY) || "null");
        if (token && !isTokenExpired(token, nowMs) && user && user.role === "admin") return { token, user };
    } catch (_) {
        /* dữ liệu hỏng */
    }
    clearAdminSession(storage);
    return null;
}

export function saveAdminSession({ token, user }, storage = window.localStorage) {
    if (!user || user.role !== "admin") throw new Error("Tài khoản không có quyền quản trị.");
    storage.setItem(ADMIN_TOKEN_KEY, token);
    storage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
}

export function clearAdminSession(storage = window.localStorage) {
    try {
        storage.removeItem(ADMIN_TOKEN_KEY);
        storage.removeItem(ADMIN_USER_KEY);
    } catch (_) {
        /* bộ nhớ bị chặn */
    }
}
