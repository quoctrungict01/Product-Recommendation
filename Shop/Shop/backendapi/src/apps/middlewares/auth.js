// Xác thực JWT và phân quyền.
//
//   optionalAuth  — KHÔNG gửi header Authorization -> khách (req.user = null).
//                   CÓ gửi Bearer token -> token phải hợp lệ, nếu không trả 401 (không âm thầm coi là khách).
//                   Dùng cho API công khai nhưng biết thêm người dùng nếu có (vd. đặt hàng).
//   requireAuth   — bắt buộc đăng nhập: thiếu/sai/hết hạn token hoặc user không còn tồn tại -> 401.
//   requireAdmin  — bắt buộc đăng nhập VÀ role hiện tại trong DB là "admin" -> nếu không: 403.
//
// Không tin role trong token hay do frontend gửi: mỗi request tra lại user trong DB (bỏ trường password),
// nên user bị hạ quyền hoặc bị xóa sẽ mất quyền ngay, kể cả khi token cũ còn hạn.

const { verifyAuthToken } = require("../../libs/jwt");
const { unauthorized, forbidden } = require("../../libs/http-error");
const { isObjectId } = require("../../libs/validate");

/** Địa chỉ dạng object thường (bỏ phần nội bộ của Mongoose), hoặc null. */
function plainAddress(a) {
    if (!a || !a.province) return null;
    return {
        province: a.province,
        province_code: a.province_code ?? null,
        district: a.district ?? null,
        ward: a.ward,
        ward_code: a.ward_code ?? null,
        detail: a.detail,
    };
}

/** Đối tượng người dùng an toàn để trả cho client (không bao giờ có password). */
function publicUser(user) {
    if (!user) return null;
    return {
        _id: String(user._id),
        full_name: user.full_name ?? null,
        email: user.email,
        role: user.role,
        phone: user.phone ?? null,
        address: plainAddress(user.address),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

/** Lấy token từ header "Authorization: Bearer <token>". undefined = không có header; null = sai định dạng. */
function bearerToken(req) {
    const header = req.headers && req.headers.authorization;
    if (header === undefined) return undefined;
    const match = /^Bearer\s+([A-Za-z0-9\-_.]+)$/.exec(String(header).trim());
    return match ? match[1] : null;
}

/**
 * @param {{findUserById?: (id: string) => Promise<object|null>, verify?: Function}} deps — tiêm được để test.
 */
function createAuthMiddleware(deps = {}) {
    const verify = deps.verify || verifyAuthToken;
    const findUserById =
        deps.findUserById ||
        ((id) => {
            const UserModel = require("../models/user");
            return UserModel.findById(id, "-password");
        });

    /** Trả về user (đã tra DB) hoặc ném HttpError 401. */
    async function resolveUser(req) {
        const token = bearerToken(req);
        if (token === undefined) throw unauthorized();
        if (token === null) throw unauthorized("Token không đúng định dạng.", "INVALID_TOKEN");
        let payload;
        try {
            payload = verify(token);
        } catch (err) {
            if (err && err.name === "TokenExpiredError") throw unauthorized("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.", "TOKEN_EXPIRED");
            if (err && (err.name === "JsonWebTokenError" || err.name === "NotBeforeError")) throw unauthorized("Token không hợp lệ.", "INVALID_TOKEN");
            throw err; // vd. thiếu JWT_SECRET -> lỗi server, không phải lỗi của người dùng
        }
        if (!payload || !isObjectId(String(payload._id))) throw unauthorized("Token không hợp lệ.", "INVALID_TOKEN");
        const user = await findUserById(String(payload._id));
        if (!user) throw unauthorized("Tài khoản không còn tồn tại.", "USER_NOT_FOUND");
        // Token phát hành trước lần đổi mật khẩu gần nhất không còn dùng được.
        if (user.password_changed_at && typeof payload.iat === "number" && payload.iat < Math.floor(new Date(user.password_changed_at).getTime() / 1000)) {
            throw unauthorized("Mật khẩu đã được đổi, vui lòng đăng nhập lại.", "TOKEN_REVOKED");
        }
        return publicUser(user);
    }

    const requireAuth = (req, res, next) => {
        resolveUser(req)
            .then((user) => {
                req.user = user;
                next();
            })
            .catch(next);
    };

    const requireAdmin = (req, res, next) => {
        resolveUser(req)
            .then((user) => {
                req.user = user;
                if (user.role !== "admin") return next(forbidden("Chỉ quản trị viên mới được thực hiện thao tác này."));
                next();
            })
            .catch(next);
    };

    const optionalAuth = (req, res, next) => {
        if (bearerToken(req) === undefined) {
            req.user = null;
            return next();
        }
        resolveUser(req)
            .then((user) => {
                req.user = user;
                next();
            })
            .catch(next); // đã gửi token mà token sai/hết hạn -> 401, để giao diện biết phiên đã hết
    };

    return { requireAuth, requireAdmin, optionalAuth, resolveUser };
}

const defaults = createAuthMiddleware();

module.exports = { createAuthMiddleware, publicUser, plainAddress, bearerToken, ...defaults };
