// Chính sách CORS: chỉ trình duyệt mở từ các origin được phép mới đọc được response của API.
//
//  - Danh sách lấy từ biến môi trường CORS_ORIGINS (phân tách bằng dấu phẩy), vd.
//      CORS_ORIGINS=http://localhost:3000,http://localhost:3001
//    Không khai báo -> mặc định Shop (3000) và Admin (3001) chạy trên localhost / 127.0.0.1.
//  - Request KHÔNG có header Origin (curl, Postman, test, server gọi server) vẫn được phục vụ bình thường:
//    CORS chỉ là cơ chế của trình duyệt.
//  - Request từ chính origin của backend (vd. trang tĩnh do backend phục vụ) cũng được phép.
//  - Origin không được phép -> 403 JSON (không xử lý tiếp, kể cả request "simple" như form POST).

const cors = require("cors");
const { HttpError } = require("./http-error");

const DEFAULT_ORIGINS = Object.freeze(["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);

/** "http://localhost:3000/" -> "http://localhost:3000"; giá trị không phải URL http(s) -> null. */
function normalizeOrigin(value) {
    try {
        const u = new URL(String(value).trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        return u.origin;
    } catch (_) {
        return null;
    }
}

/** Danh sách origin được phép từ chuỗi cấu hình (bỏ mục sai, bỏ trùng). Trống -> mặc định. */
function parseAllowedOrigins(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === "") return [...DEFAULT_ORIGINS];
    const list = String(raw)
        .split(",")
        .map(normalizeOrigin)
        .filter(Boolean);
    return [...new Set(list)];
}

function createCorsMiddleware({ origins = parseAllowedOrigins(process.env.CORS_ORIGINS) } = {}) {
    const allowed = new Set(origins);
    const corsHandler = cors({
        origin: (origin, callback) => callback(null, true), // đã lọc ở dưới; tới đây là được phép
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposedHeaders: ["Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
        maxAge: 600,
    });

    function middleware(req, res, next) {
        const origin = req.headers.origin;
        if (origin === undefined) return next(); // không phải request CORS của trình duyệt
        const normalized = normalizeOrigin(origin);
        const self = req.headers.host ? `${req.protocol}://${req.headers.host}` : null;
        if (normalized && (allowed.has(normalized) || normalized === self)) return corsHandler(req, res, next);
        res.vary("Origin");
        return next(new HttpError(403, "Origin này không được phép gọi API.", "CORS_FORBIDDEN"));
    }

    return { middleware, origins: [...allowed] };
}

module.exports = { DEFAULT_ORIGINS, normalizeOrigin, parseAllowedOrigins, createCorsMiddleware };
