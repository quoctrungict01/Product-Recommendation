// Quy tắc coupon: kiểm tra dữ liệu admin nhập, kiểm tra mã còn dùng được và tính số tiền giảm.
//
// Thứ tự tính giá của một đơn (không bao giờ giảm hai lần trên cùng một khoản):
//   1. Giá gốc từng sản phẩm (price)                       -> subtotal_original
//   2. Trừ khuyến mãi sản phẩm (libs/pricing.js)           -> subtotal  (= tổng giá bán)
//   3. Trừ coupon tính trên subtotal                       -> totalPrice = subtotal - coupon_discount (>= 0)
// Coupon fixed: min(value, subtotal). Coupon percent: floor(subtotal * value / 100), không vượt max_discount.
const { badRequest } = require("./http-error");
const { MAX_PRICE } = require("./pricing");

const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

/** Chuẩn hóa mã người dùng nhập: bỏ khoảng trắng, in hoa. Không phải chuỗi -> "". */
function normalizeCode(value) {
    return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function intField(body, field, label, { min, max, nullable = false, def }) {
    const v = body[field];
    if (v === undefined || v === "" || v === null) {
        if (def !== undefined) return def;
        if (nullable) return null;
        throw badRequest(`${label} là bắt buộc.`, { field });
    }
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,13}$/.test(v.trim()) ? Number(v.trim()) : NaN;
    if (!Number.isSafeInteger(n) || n < min || n > max) throw badRequest(`${label} phải là số nguyên từ ${min.toLocaleString("vi-VN")} đến ${max.toLocaleString("vi-VN")}.`, { field });
    return n;
}

function dateField(body, field, label) {
    const v = body[field];
    if (v === undefined || v === null || v === "") return null;
    const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) throw badRequest(`${label} không hợp lệ.`, { field });
    return d;
}

/**
 * Dữ liệu tạo/sửa coupon từ admin. Trường lạ -> 400.
 * @param {object|null} current coupon đang sửa (để chặn usage_limit < used_count và đổi mã đã dùng)
 */
function validateCouponBody(body, current = null) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Thiếu dữ liệu mã giảm giá.");
    const allowed = ["code", "description", "type", "value", "min_order", "max_discount", "starts_at", "ends_at", "usage_limit", "is_active"];
    const extra = Object.keys(body).filter((k) => !allowed.includes(k));
    if (extra.length) throw badRequest(`Trường không được phép: ${extra.join(", ")}.`, { field: extra[0] });

    const code = normalizeCode(body.code);
    if (!CODE_RE.test(code)) throw badRequest("Mã gồm 3–30 ký tự: chữ không dấu, số, - hoặc _.", { field: "code" });
    if (current && current.used_count > 0 && code !== current.code) throw badRequest("Mã đã được dùng trong đơn hàng nên không đổi được mã; hãy tạo mã mới.", { field: "code" });
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 200) throw badRequest("Mô tả tối đa 200 ký tự.", { field: "description" });
    const type = body.type;
    if (type !== "fixed" && type !== "percent") throw badRequest("Loại giảm phải là cố định (fixed) hoặc phần trăm (percent).", { field: "type" });
    const value = type === "percent" ? intField(body, "value", "Phần trăm giảm", { min: 1, max: 100 }) : intField(body, "value", "Số tiền giảm", { min: 1, max: MAX_PRICE });
    const min_order = intField(body, "min_order", "Đơn tối thiểu", { min: 0, max: MAX_PRICE, def: 0 });
    const max_discount = intField(body, "max_discount", "Giảm tối đa", { min: 1, max: MAX_PRICE, nullable: true });
    const starts_at = dateField(body, "starts_at", "Thời gian bắt đầu");
    const ends_at = dateField(body, "ends_at", "Thời gian kết thúc");
    if (starts_at && ends_at && ends_at <= starts_at) throw badRequest("Thời gian kết thúc phải sau thời gian bắt đầu.", { field: "ends_at" });
    const usage_limit = intField(body, "usage_limit", "Giới hạn lượt dùng", { min: 1, max: 10000000, nullable: true });
    if (current && usage_limit !== null && usage_limit < current.used_count) {
        throw badRequest(`Giới hạn lượt dùng không được nhỏ hơn số lượt đã dùng (${current.used_count}).`, { field: "usage_limit" });
    }
    let is_active = current ? current.is_active !== false : true;
    if (body.is_active !== undefined) {
        if (typeof body.is_active !== "boolean") throw badRequest("is_active phải là true hoặc false.", { field: "is_active" });
        is_active = body.is_active;
    }
    return { code, description, type, value, min_order, max_discount, starts_at, ends_at, usage_limit, is_active };
}

/** Số tiền giảm của coupon cho tạm tính `subtotal` (đã trừ khuyến mãi sản phẩm). Luôn 0..subtotal. */
function couponDiscount(coupon, subtotal) {
    if (!coupon || !Number.isFinite(subtotal) || subtotal <= 0) return 0;
    let d = coupon.type === "percent" ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
    if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
    return Math.max(0, Math.min(d, subtotal));
}

/**
 * Lý do mã không dùng được cho đơn này (chuỗi tiếng Việt), hoặc null nếu dùng được.
 * Không kiểm tra lượt còn lại theo cách "đọc rồi tin" — việc giữ lượt làm nguyên tử ở bước đặt hàng.
 */
function couponProblem(coupon, subtotal, now = new Date()) {
    if (!coupon) return "Mã giảm giá không tồn tại.";
    if (coupon.is_active === false) return "Mã giảm giá đã bị vô hiệu hóa.";
    if (coupon.starts_at && now < new Date(coupon.starts_at)) return "Mã giảm giá chưa đến thời gian áp dụng.";
    if (coupon.ends_at && now > new Date(coupon.ends_at)) return "Mã giảm giá đã hết hạn.";
    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && (coupon.used_count || 0) >= coupon.usage_limit) return "Mã giảm giá đã hết lượt sử dụng.";
    if ((coupon.min_order || 0) > subtotal) return `Đơn hàng cần tối thiểu ${coupon.min_order.toLocaleString("vi-VN")}đ (sau khuyến mãi) để dùng mã này.`;
    if (couponDiscount(coupon, subtotal) <= 0) return "Mã giảm giá không áp dụng được cho đơn này.";
    return null;
}

/** Trạng thái hiển thị cho Admin. */
function couponState(coupon, now = new Date()) {
    if (coupon.is_active === false) return "disabled";
    if (coupon.ends_at && now > new Date(coupon.ends_at)) return "expired";
    if (coupon.starts_at && now < new Date(coupon.starts_at)) return "scheduled";
    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && (coupon.used_count || 0) >= coupon.usage_limit) return "used_up";
    return "active";
}

module.exports = { CODE_RE, normalizeCode, validateCouponBody, couponDiscount, couponProblem, couponState };
