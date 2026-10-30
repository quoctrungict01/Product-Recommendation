// BackendAPI/src/apps/controllers/apis/auth.js
// Đăng ký, đăng nhập, hồ sơ của chính người đăng nhập (xem/sửa/đổi mật khẩu).
//  - Email được chuẩn hóa (bỏ khoảng trắng, chữ thường) trước khi lưu/tìm.
//  - Mật khẩu luôn băm bcrypt; KHÔNG còn đăng nhập bằng mật khẩu dạng thô.
//  - Đăng ký luôn tạo role "member"; role do client gửi bị bỏ qua.
//  - Không response nào chứa password/hash.
const UserModel = require("../../models/user");
const bcrypt = require("bcrypt");
const { signAuthToken } = require("../../../libs/jwt"); // khóa lấy từ JWT_SECRET, không có giá trị mặc định
const { publicUser } = require("../../middlewares/auth");
const { validateEmail, validateNewPassword, optionalString, normalizeEmail, validatePhone, validateAddress, PASSWORD_MAX } = require("../../../libs/validate");
const { HttpError, badRequest, conflict, notFound } = require("../../../libs/http-error");

const BCRYPT_ROUNDS = 10;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;
const INVALID_LOGIN = "Email hoặc mật khẩu không đúng.";

const fail = (res, status, message) => res.status(status).json({ status: "error", message });
const isPublicError = (err) => err instanceof HttpError && err.status < 500;

exports.login = async (req, res) => {
    try {
        const body = req.body || {};
        const email = normalizeEmail(body.email);
        const password = body.password;
        if (!email || typeof password !== "string" || password.length === 0) {
            return fail(res, 400, "Email và mật khẩu là bắt buộc.");
        }
        if (password.length > PASSWORD_MAX) return fail(res, 401, INVALID_LOGIN);

        const user = await UserModel.findOne({ email });
        // Chỉ chấp nhận mật khẩu đã băm bcrypt. Tài khoản lưu mật khẩu thô (dữ liệu cũ) không đăng nhập được.
        const isMatch = Boolean(user && typeof user.password === "string" && BCRYPT_HASH_RE.test(user.password) && (await bcrypt.compare(password, user.password)));
        if (!isMatch) return fail(res, 401, INVALID_LOGIN);

        const token = signAuthToken(user);
        res.status(200).json({
            status: "success",
            message: "Đăng nhập thành công.",
            data: { token, user: publicUser(user) },
        });
    } catch (error) {
        console.error("Login error:", error && error.name);
        fail(res, 500, "Lỗi server.");
    }
};

exports.register = async (req, res) => {
    try {
        const body = req.body || {};
        let email;
        let password;
        let fullName;
        try {
            email = validateEmail(body.email);
            password = validateNewPassword(body.password);
            fullName = optionalString(body.full_name, "Họ tên", { max: 100 }) ?? null;
        } catch (err) {
            if (isPublicError(err)) return fail(res, err.status, err.message);
            throw err;
        }

        const existing = await UserModel.findOne({ email });
        if (existing) return fail(res, 400, "Email đã tồn tại.");

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        let newUser;
        try {
            newUser = await UserModel.create({ full_name: fullName, email, password: hashedPassword, role: "member" });
        } catch (err) {
            if (err && err.code === 11000) return fail(res, 400, "Email đã tồn tại.");
            throw err;
        }

        const token = signAuthToken(newUser);
        res.status(201).json({
            status: "success",
            message: "Đăng ký thành công.",
            data: { token, user: publicUser(newUser) },
        });
    } catch (error) {
        console.error("Register error:", error && error.name);
        fail(res, 500, "Lỗi server.");
    }
};

/** GET /auth/me — cần requireAuth; req.user đã được tra lại trong DB và không có password. */
exports.me = async (req, res) => {
    res.status(200).json({ status: "success", data: { user: req.user } });
};

// Trường người dùng được tự sửa. Mọi trường khác (role, password, _id, email_verified...) bị từ chối 400.
const PROFILE_FIELDS = ["full_name", "phone", "email", "address", "current_password"];

async function checkCurrentPassword(userId, password) {
    if (typeof password !== "string" || password.length === 0 || password.length > PASSWORD_MAX) return false;
    const user = await UserModel.findById(userId);
    if (!user) throw notFound("Tài khoản không còn tồn tại.");
    return Boolean(typeof user.password === "string" && BCRYPT_HASH_RE.test(user.password) && (await bcrypt.compare(password, user.password)));
}

/**
 * PUT /auth/me — cần requireAuth. Chỉ sửa tài khoản của CHÍNH người gửi (id lấy từ token, không từ body/URL).
 * Body (đều tùy chọn): full_name, phone ("" hoặc null để xóa), address (object hoặc null để xóa),
 *   email (đổi email đăng nhập: bắt buộc kèm current_password, email mới phải chưa có ai dùng).
 */
exports.updateMe = async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Thiếu dữ liệu cập nhật.");
    const forbiddenKeys = Object.keys(body).filter((k) => !PROFILE_FIELDS.includes(k));
    if (forbiddenKeys.length) throw new HttpError(400, `Không được sửa các trường: ${forbiddenKeys.join(", ")}.`, "FIELD_NOT_ALLOWED");

    const set = {};
    if ("full_name" in body) set.full_name = optionalString(body.full_name, "Họ tên", { max: 100 }) ?? null;
    if ("phone" in body) set.phone = body.phone === null || body.phone === "" ? null : validatePhone(body.phone);
    if ("address" in body) set.address = body.address === null ? null : validateAddress(body.address);
    if ("email" in body) {
        const email = validateEmail(body.email);
        if (email !== req.user.email) {
            if (!(await checkCurrentPassword(req.user._id, body.current_password))) {
                throw new HttpError(400, "Mật khẩu hiện tại không đúng (cần để đổi email).", "WRONG_PASSWORD");
            }
            const taken = await UserModel.findOne({ email }, "_id");
            if (taken && String(taken._id) !== String(req.user._id)) throw conflict("Email đã được tài khoản khác sử dụng.");
            set.email = email;
        }
    }
    if (Object.keys(set).length === 0) return res.status(200).json({ status: "success", message: "Không có thay đổi.", data: { user: req.user } });

    let updated;
    try {
        updated = await UserModel.findByIdAndUpdate(req.user._id, { $set: set }, { new: true, runValidators: true, projection: "-password" });
    } catch (err) {
        if (err && err.code === 11000) throw conflict("Email đã được tài khoản khác sử dụng.");
        throw err;
    }
    if (!updated) throw notFound("Tài khoản không còn tồn tại.");
    // Email nằm trong token: phát hành token mới để giao diện không giữ thông tin cũ.
    const data = { user: publicUser(updated) };
    if (set.email) data.token = signAuthToken(updated);
    res.status(200).json({ status: "success", message: "Đã cập nhật hồ sơ.", data });
};

/**
 * PUT /auth/me/password — cần requireAuth. Body: { current_password, new_password }.
 * Sai mật khẩu hiện tại -> 400 (không dùng 401 để giao diện không tự đăng xuất).
 * Đổi xong: mọi token cũ bị vô hiệu (password_changed_at), trả token mới cho phiên hiện tại.
 */
exports.changePassword = async (req, res) => {
    const body = req.body || {};
    const unknown = Object.keys(body).filter((k) => !["current_password", "new_password"].includes(k));
    if (unknown.length) throw new HttpError(400, `Không được gửi các trường: ${unknown.join(", ")}.`, "FIELD_NOT_ALLOWED");
    if (typeof body.current_password !== "string" || body.current_password.length === 0) throw badRequest("Vui lòng nhập mật khẩu hiện tại.");
    const newPassword = validateNewPassword(body.new_password);
    if (!(await checkCurrentPassword(req.user._id, body.current_password))) throw new HttpError(400, "Mật khẩu hiện tại không đúng.", "WRONG_PASSWORD");
    if (newPassword === body.current_password) throw badRequest("Mật khẩu mới phải khác mật khẩu hiện tại.");

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    // Làm tròn xuống giây (iat của JWT tính theo giây) để token mới phát hành ngay sau đây vẫn hợp lệ.
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const updated = await UserModel.findByIdAndUpdate(req.user._id, { $set: { password: hashed, password_changed_at: changedAt } }, { new: true, projection: "-password" });
    if (!updated) throw notFound("Tài khoản không còn tồn tại.");
    res.status(200).json({ status: "success", message: "Đã đổi mật khẩu.", data: { token: signAuthToken(updated), user: publicUser(updated) } });
};

module.exports.BCRYPT_ROUNDS = BCRYPT_ROUNDS;
