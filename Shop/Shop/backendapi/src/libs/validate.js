// Kiểm tra và chuẩn hóa dữ liệu đầu vào dùng chung (không phụ thuộc thư viện ngoài).

const { badRequest } = require("./http-error");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128; // bcrypt chỉ dùng 72 byte đầu; giới hạn để tránh request quá lớn
const ROLES = Object.freeze(["member", "admin"]);

/** Email: bỏ khoảng trắng hai đầu, chữ thường. Trả về null nếu không phải chuỗi. */
function normalizeEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function isEmail(value) {
    return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

function isObjectId(value) {
    return typeof value === "string" && OBJECT_ID_RE.test(value);
}

/** Ném 400 nếu id không phải ObjectId hợp lệ. */
function assertObjectId(value, name = "id") {
    if (!isObjectId(value)) throw badRequest(`${name} không hợp lệ.`);
    return value;
}

/** Chuỗi bắt buộc: bỏ khoảng trắng, độ dài [min, max]. */
function requiredString(value, name, { min = 1, max = 200 } = {}) {
    if (typeof value !== "string") throw badRequest(`${name} là bắt buộc.`);
    const v = value.trim();
    if (v.length < min) throw badRequest(`${name} là bắt buộc.`);
    if (v.length > max) throw badRequest(`${name} không được dài quá ${max} ký tự.`);
    return v;
}

function optionalString(value, name, { max = 200 } = {}) {
    if (value === undefined || value === null || value === "") return undefined;
    return requiredString(value, name, { max });
}

/** Mật khẩu mới: 8–128 ký tự, có ít nhất một chữ cái và một chữ số. */
function validateNewPassword(value) {
    if (typeof value !== "string" || value.length < PASSWORD_MIN) throw badRequest(`Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự.`);
    if (value.length > PASSWORD_MAX) throw badRequest(`Mật khẩu không được dài quá ${PASSWORD_MAX} ký tự.`);
    if (!/\p{L}/u.test(value) || !/\d/.test(value)) throw badRequest("Mật khẩu phải có cả chữ cái và chữ số.");
    return value;
}

// Số điện thoại Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx (bỏ khoảng trắng, dấu chấm, gạch ngang).
const PHONE_RE = /^(\+84|0)\d{8,10}$/;

/** Số điện thoại bắt buộc; trả về dạng đã bỏ ký tự phân cách. */
function validatePhone(value, name = "Số điện thoại") {
    const phone = requiredString(value, name, { max: 20 }).replace(/[\s.-]/g, "");
    if (!PHONE_RE.test(phone)) throw badRequest(`${name} không hợp lệ.`);
    return phone;
}

const ADDRESS_FIELDS = Object.freeze(["province", "province_code", "district", "ward", "ward_code", "detail"]);

/** Mã đơn vị hành chính (tùy chọn): số nguyên dương. */
function optionalCode(value, name) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0 || n > 1e7) throw badRequest(`${name} không hợp lệ.`);
    return n;
}

/**
 * Địa chỉ giao hàng có cấu trúc (địa giới 2 cấp: tỉnh/thành – phường/xã).
 *  - province, ward, detail: bắt buộc.
 *  - district: tùy chọn, chỉ để giữ được địa chỉ cũ còn ghi quận/huyện.
 *  - province_code, ward_code: tùy chọn (mã danh mục khi người dùng chọn từ danh sách).
 * Không nhận trường lạ.
 */
function validateAddress(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("Địa chỉ không hợp lệ.");
    const unknown = Object.keys(value).filter((k) => !ADDRESS_FIELDS.includes(k));
    if (unknown.length) throw badRequest(`Địa chỉ có trường không hợp lệ: ${unknown.join(", ")}.`);
    return {
        province: requiredString(value.province, "Tỉnh/thành phố", { max: 100 }),
        province_code: optionalCode(value.province_code, "Mã tỉnh/thành phố"),
        district: optionalString(value.district, "Quận/huyện", { max: 100 }) ?? null,
        ward: requiredString(value.ward, "Phường/xã", { max: 100 }),
        ward_code: optionalCode(value.ward_code, "Mã phường/xã"),
        detail: requiredString(value.detail, "Địa chỉ chi tiết", { max: 200 }),
    };
}

/** Ghép địa chỉ có cấu trúc thành một dòng (lưu vào trường Order.address cũ). */
function formatAddress(a) {
    return [a.detail, a.ward, a.district, a.province].filter(Boolean).join(", ");
}

/** Email bắt buộc, đã chuẩn hóa. */
function validateEmail(value) {
    const email = normalizeEmail(value);
    if (!email) throw badRequest("Email là bắt buộc.");
    if (!isEmail(email)) throw badRequest("Email không hợp lệ.");
    return email;
}

/** Thoát các ký tự đặc biệt của biểu thức chính quy (dùng khi tìm email không phân biệt hoa/thường). */
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
    PASSWORD_MIN,
    PASSWORD_MAX,
    ROLES,
    normalizeEmail,
    isEmail,
    isObjectId,
    assertObjectId,
    requiredString,
    optionalString,
    validateNewPassword,
    validateEmail,
    validatePhone,
    validateAddress,
    formatAddress,
    PHONE_RE,
    escapeRegex,
};
