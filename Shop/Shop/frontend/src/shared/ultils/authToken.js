// Tiện ích token đăng nhập phía trình duyệt (chỉ đọc phần payload để biết hạn dùng — KHÔNG xác thực).
// Việc xác thực thật sự luôn do backend làm; ở đây chỉ để giao diện không hiển thị "đã đăng nhập" khi token đã hết hạn.

export const TOKEN_KEY = "token";
export const USER_KEY = "user";

/** Giải mã phần payload của JWT; trả về null nếu sai định dạng. */
export function decodeTokenPayload(token) {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const json = decodeURIComponent(
            atob(padded)
                .split("")
                .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
                .join("")
        );
        const payload = JSON.parse(json);
        return payload && typeof payload === "object" ? payload : null;
    } catch (_) {
        return null;
    }
}

/** Token hết hạn (hoặc không đọc được) -> true. Có thể chừa `skewSeconds` để đăng xuất sớm hơn một chút. */
export function isTokenExpired(token, nowMs = Date.now(), skewSeconds = 0) {
    const payload = decodeTokenPayload(token);
    if (!payload || typeof payload.exp !== "number") return true;
    return payload.exp - skewSeconds <= Math.floor(nowMs / 1000);
}

/** Đọc phiên đăng nhập đã lưu; xóa luôn nếu token hết hạn hoặc dữ liệu hỏng. */
export function loadStoredSession(storage = window.localStorage, nowMs = Date.now()) {
    let token = null;
    let user = null;
    try {
        token = storage.getItem(TOKEN_KEY);
        user = JSON.parse(storage.getItem(USER_KEY) || "null");
    } catch (_) {
        token = null;
    }
    if (!token || isTokenExpired(token, nowMs) || !user) {
        clearStoredSession(storage);
        return { token: null, user: null };
    }
    return { token, user };
}

export function clearStoredSession(storage = window.localStorage) {
    try {
        storage.removeItem(TOKEN_KEY);
        storage.removeItem(USER_KEY);
    } catch (_) {
        /* bộ nhớ trình duyệt bị chặn */
    }
}
