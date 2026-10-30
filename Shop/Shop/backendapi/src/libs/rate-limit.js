// Giới hạn tần suất request, lưu trong bộ nhớ của tiến trình (không cần thư viện ngoài).
//
// Hạn chế: bộ đếm nằm trong RAM của MỘT tiến trình Node. Chạy nhiều instance (cluster, PM2 nhiều tiến trình,
// nhiều máy sau load balancer) thì mỗi instance đếm riêng, và bộ đếm mất khi khởi động lại.
// Khi đó cần kho dùng chung (vd. Redis). Đủ cho demo chạy một backend trên localhost.
//
// Khóa mặc định là địa chỉ IP (req.ip). Nếu đặt sau reverse proxy, cần bật app.set("trust proxy", ...)
// để req.ip là IP thật của khách; nếu không, mọi khách sẽ dùng chung một bộ đếm.
//
// Không ghi log gì: khóa có thể chứa email, và request có thể chứa mật khẩu hoặc mã giảm giá.

const crypto = require("crypto");
const { HttpError } = require("./http-error");

const limiters = new Set();

/** Băm khóa để bộ nhớ không giữ email/mã giảm giá ở dạng rõ. */
const hashKey = (key) => crypto.createHash("sha256").update(String(key)).digest("base64url");

/**
 * @param {object} options
 * @param {number} options.windowMs           độ dài cửa sổ đếm (ms)
 * @param {number} options.max                số request tối đa trong một cửa sổ
 * @param {string} options.message            thông báo khi vượt giới hạn
 * @param {(req) => string} [options.key]     khóa đếm (mặc định req.ip)
 * @param {boolean} [options.skipSuccessful]  không tính request thành công (status < 400)
 * @param {number} [options.maxKeys]          số khóa tối đa giữ trong bộ nhớ
 * @param {() => number} [options.now]        đồng hồ (tiêm được để test)
 */
function createRateLimiter({ windowMs, max, message, key = (req) => req.ip, skipSuccessful = false, maxKeys = 10000, now = Date.now }) {
    if (!(windowMs > 0) || !(max > 0)) throw new TypeError("windowMs và max phải là số dương.");
    const hits = new Map(); // khóa đã băm -> { count, resetAt }

    function sweep(t) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
        // Vẫn quá nhiều khóa (bị dội request từ nhiều IP): bỏ khóa cũ nhất để giới hạn bộ nhớ.
        while (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
    }

    function middleware(req, res, next) {
        const t = now();
        const k = hashKey(key(req) || "unknown");
        let entry = hits.get(k);
        if (!entry || entry.resetAt <= t) {
            if (!entry && hits.size >= maxKeys) sweep(t);
            entry = { count: 0, resetAt: t + windowMs };
            hits.set(k, entry);
        }
        const retryAfter = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
        if (entry.count >= max) {
            res.set("Retry-After", String(retryAfter));
            res.set("RateLimit-Limit", String(max));
            res.set("RateLimit-Remaining", "0");
            res.set("RateLimit-Reset", String(retryAfter));
            const minutes = Math.ceil(retryAfter / 60);
            const wait = retryAfter < 60 ? `${retryAfter} giây` : `${minutes} phút`;
            return next(new HttpError(429, `${message} Vui lòng thử lại sau ${wait}.`, "RATE_LIMITED", { retry_after: retryAfter }));
        }
        entry.count += 1;
        res.set("RateLimit-Limit", String(max));
        res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
        res.set("RateLimit-Reset", String(retryAfter));
        if (skipSuccessful) {
            res.on("finish", () => {
                // Chỉ trả lại lượt nếu vẫn là cửa sổ cũ (tránh trừ nhầm cửa sổ mới).
                if (res.statusCode < 400 && hits.get(k) === entry && entry.count > 0) entry.count -= 1;
            });
        }
        next();
    }

    const limiter = { middleware, reset: () => hits.clear(), size: () => hits.size };
    limiters.add(limiter);
    return limiter;
}

/** Xóa mọi bộ đếm (dùng trong test). */
function resetAllRateLimits() {
    for (const l of limiters) l.reset();
}

const MINUTE = 60 * 1000;
const emailKey = (req) => {
    const email = req.body && typeof req.body.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
    return `${req.ip}|${email}`;
};

// Đăng nhập: chỉ tính lần SAI. Người nhập đúng không bị ảnh hưởng.
//  - 10 lần sai / 15 phút cho cùng một email từ một IP (chống dò mật khẩu một tài khoản),
//  - 30 lần sai / 15 phút cho một IP (chống dò nhiều tài khoản).
const loginPerAccount = createRateLimiter({ windowMs: 15 * MINUTE, max: 10, key: emailKey, skipSuccessful: true, message: "Bạn đã đăng nhập sai quá nhiều lần." });
const loginPerIp = createRateLimiter({ windowMs: 15 * MINUTE, max: 30, skipSuccessful: true, message: "Có quá nhiều lần đăng nhập sai từ thiết bị này." });
// Đăng ký: 10 lần / giờ / IP (tính cả lần thành công, để chặn tạo tài khoản hàng loạt).
const register = createRateLimiter({ windowMs: 60 * MINUTE, max: 10, message: "Bạn đã gửi quá nhiều yêu cầu đăng ký." });
// Xem trước mã giảm giá: 30 lần / 10 phút / IP (chống dò mã).
const couponPreview = createRateLimiter({ windowMs: 10 * MINUTE, max: 30, message: "Bạn đã kiểm tra mã giảm giá quá nhiều lần." });

module.exports = {
    createRateLimiter,
    resetAllRateLimits,
    loginLimit: [loginPerIp.middleware, loginPerAccount.middleware],
    registerLimit: register.middleware,
    couponPreviewLimit: couponPreview.middleware,
};
