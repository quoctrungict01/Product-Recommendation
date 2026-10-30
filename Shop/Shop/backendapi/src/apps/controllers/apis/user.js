// Quản lý tài khoản — CHỈ ADMIN (router đặt requireAdmin cho mọi route).
//  - Không response nào chứa password/hash (truy vấn loại trường password, kết quả qua publicUser).
//  - Mật khẩu luôn được băm bcrypt trước khi lưu.
//  - Không thể tạo hoặc nâng tài khoản thành "admin" qua API; admin đầu tiên tạo bằng scripts/create-admin.js.
//  - Admin không thể tự hạ quyền hoặc tự xóa chính mình (tránh khóa hệ thống).
//  - Không xóa được tài khoản admin qua API (đợt 6B): muốn xóa phải hạ quyền trước.
//  - Admin đặt lại mật khẩu cho thành viên -> mọi phiên đăng nhập cũ của người đó bị thu hồi.
const bcrypt = require("bcrypt");
const UserModel = require("../../models/user");
const pagination = require("../../../libs/pagination");
const { publicUser } = require("../../middlewares/auth");
const { badRequest, forbidden, notFound, conflict } = require("../../../libs/http-error");
const { assertObjectId, validateEmail, validateNewPassword, validatePhone, optionalString, escapeRegex, ROLES } = require("../../../libs/validate");
const { keywordRegexes } = require("../../../libs/product-query");
const { BCRYPT_ROUNDS } = require("./auth");

const ADMIN_VIA_API = "Không thể cấp quyền admin qua API. Dùng scripts/create-admin.js.";

function pageParams(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    return { page, limit, skip: (page - 1) * limit };
}

/**
 * Bộ lọc danh sách: q (tìm trong họ tên không phân biệt dấu, email, số điện thoại), role (member|admin).
 * Tham số dạng mảng/đối tượng (vd. ?q[$ne]=) -> 400.
 */
function listFilter(query = {}) {
    for (const k of ["q", "role"]) if (query[k] !== undefined && typeof query[k] !== "string") throw badRequest(`Tham số ${k} không hợp lệ.`);
    const q = (query.q || "").trim();
    if (q.length > 100) throw badRequest("Từ khóa tối đa 100 ký tự.");
    const role = (query.role || "").trim();
    if (role && !ROLES.includes(role)) throw badRequest("Vai trò không hợp lệ.");
    const filter = {};
    if (role) filter.role = role;
    if (q) {
        const or = [{ email: new RegExp(escapeRegex(q.toLowerCase()), "i") }];
        const regexes = keywordRegexes(q);
        if (regexes.length) or.push({ $and: regexes.map((r) => ({ full_name: r })) });
        const digits = q.replace(/[\s.-]/g, "");
        if (/^\+?\d{3,}$/.test(digits)) or.push({ phone: new RegExp(escapeRegex(digits)) });
        filter.$or = or;
    }
    return { q, role, filter };
}

function checkRole(role) {
    if (role === undefined || role === null || role === "") return undefined;
    if (!ROLES.includes(role)) throw badRequest("Vai trò không hợp lệ.");
    if (role === "admin") throw forbidden(ADMIN_VIA_API);
    return role;
}

// Danh sách tài khoản
exports.index = async (req, res) => {
    const { page, limit, skip } = pageParams(req.query);
    const { q, role, filter } = listFilter(req.query);
    const users = await UserModel.find(filter, "-password").sort({ _id: -1 }).skip(skip).limit(limit);
    const pages = await pagination(UserModel, filter, limit, page);
    res.status(200).json({
        status: "success",
        filter: { page, limit, q, role: role || null },
        data: { docs: users.map(publicUser), total: pages.totalRows, totalPages: pages.totalPages, page, limit },
        pages,
    });
};

// Thêm tài khoản (luôn là member)
exports.create = async (req, res) => {
    const body = req.body || {};
    checkRole(body.role);
    const email = validateEmail(body.email);
    const password = validateNewPassword(body.password);
    const full_name = optionalString(body.full_name, "Họ tên", { max: 100 }) ?? null;
    if (await UserModel.findOne({ email })) throw conflict("Email đã tồn tại.");
    const created = await UserModel.create({ full_name, email, password: await bcrypt.hash(password, BCRYPT_ROUNDS), role: "member" });
    res.status(201).json({ status: "success", data: publicUser(created) });
};

// Sửa tài khoản
exports.update = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const body = req.body || {};
    const role = checkRole(body.role);
    const updated = {};
    if (body.full_name !== undefined) updated.full_name = optionalString(body.full_name, "Họ tên", { max: 100 }) ?? null;
    if (body.email !== undefined) {
        updated.email = validateEmail(body.email);
        const other = await UserModel.findOne({ email: updated.email });
        if (other && String(other._id) !== id) throw conflict("Email đã tồn tại.");
    }
    if (body.phone !== undefined) updated.phone = body.phone === null || body.phone === "" ? null : validatePhone(body.phone);
    if (body.password !== undefined && body.password !== "") {
        updated.password = await bcrypt.hash(validateNewPassword(body.password), BCRYPT_ROUNDS);
        updated.password_changed_at = new Date(); // token cũ của người này hết hiệu lực
    }
    if (role) {
        if (id === req.user._id) throw forbidden("Không thể tự thay đổi vai trò của chính mình.");
        updated.role = role; // chỉ có thể là "member" (hạ quyền)
    }
    if (!Object.keys(updated).length) throw badRequest("Không có dữ liệu cần cập nhật.");
    const user = await UserModel.findByIdAndUpdate(id, updated, { new: true, runValidators: true, projection: "-password" });
    if (!user) throw notFound("Không tìm thấy tài khoản.");
    res.status(200).json({ status: "success", data: publicUser(user) });
};

// Xóa tài khoản
exports.delete = async (req, res) => {
    const id = assertObjectId(req.params.id);
    if (id === req.user._id) throw forbidden("Không thể tự xóa tài khoản của chính mình.");
    const target = await UserModel.findById(id, "-password");
    if (!target) throw notFound("Không tìm thấy tài khoản.");
    if (target.role === "admin") throw forbidden("Không thể xóa tài khoản quản trị viên. Hãy hạ quyền tài khoản này trước.");
    const deleted = await UserModel.findByIdAndDelete(id, { projection: "-password" });
    if (!deleted) throw notFound("Không tìm thấy tài khoản.");
    res.status(200).json({ status: "success", data: publicUser(deleted) });
};

// Xem một tài khoản
exports.listFilter = listFilter;

exports.getById = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const user = await UserModel.findById(id, "-password");
    if (!user) throw notFound("Không tìm thấy tài khoản.");
    res.status(200).json({ status: "success", data: publicUser(user) });
};
