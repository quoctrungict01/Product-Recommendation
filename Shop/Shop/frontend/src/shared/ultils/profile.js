// Kiểm tra dữ liệu hồ sơ / địa chỉ phía giao diện (cùng quy tắc với backend: src/libs/validate.js).
// Đây chỉ để báo lỗi sớm cho người dùng — backend vẫn luôn tự kiểm tra lại.

export const PHONE_RE = /^(\+84|0)\d{8,10}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emptyAddress = () => ({ province: "", province_code: null, district: "", ward: "", ward_code: null, detail: "" });

export const normalizePhone = (value) => String(value || "").replace(/[\s.-]/g, "");

export function phoneError(value, { required = true } = {}) {
    const phone = normalizePhone(value);
    if (!phone) return required ? "Vui lòng nhập số điện thoại." : "";
    return PHONE_RE.test(phone) ? "" : "Số điện thoại không hợp lệ (vd. 0912345678 hoặc +84912345678).";
}

export function emailError(value) {
    const email = String(value || "").trim();
    if (!email) return "Vui lòng nhập email.";
    return EMAIL_RE.test(email) ? "" : "Email không hợp lệ.";
}

/** Mật khẩu mới: 8–128 ký tự, có cả chữ và số. */
export function newPasswordError(value) {
    const v = String(value || "");
    if (v.length < 8) return "Mật khẩu mới phải có ít nhất 8 ký tự.";
    if (v.length > 128) return "Mật khẩu mới không được dài quá 128 ký tự.";
    if (!/\p{L}/u.test(v) || !/\d/.test(v)) return "Mật khẩu mới phải có cả chữ cái và chữ số.";
    return "";
}

/** Lỗi theo từng ô của địa chỉ; object rỗng = hợp lệ. */
export function addressErrors(address) {
    const a = address || {};
    const errors = {};
    const text = (v) => String(v || "").trim();
    if (!text(a.province)) errors.province = "Vui lòng chọn hoặc nhập tỉnh/thành phố.";
    else if (text(a.province).length > 100) errors.province = "Tối đa 100 ký tự.";
    if (!text(a.ward)) errors.ward = "Vui lòng chọn hoặc nhập phường/xã.";
    else if (text(a.ward).length > 100) errors.ward = "Tối đa 100 ký tự.";
    if (text(a.district).length > 100) errors.district = "Tối đa 100 ký tự.";
    if (!text(a.detail)) errors.detail = "Vui lòng nhập số nhà, tên đường...";
    else if (text(a.detail).length > 200) errors.detail = "Tối đa 200 ký tự.";
    return errors;
}

/** Địa chỉ gửi lên backend: chỉ các trường cho phép, đã bỏ khoảng trắng thừa. */
export function cleanAddress(address) {
    const a = address || {};
    const text = (v) => String(v || "").trim();
    const code = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
    return {
        province: text(a.province),
        province_code: code(a.province_code),
        district: text(a.district) || null,
        ward: text(a.ward),
        ward_code: code(a.ward_code),
        detail: text(a.detail),
    };
}

export const formatAddress = (a) => (a ? [a.detail, a.ward, a.district, a.province].filter(Boolean).join(", ") : "");

export const formatPrice = (n) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(n) || 0);

/** Mã đơn ngắn để hiển thị: 8 ký tự cuối của _id. */
export const orderCode = (id) => `#${String(id || "").slice(-8).toUpperCase()}`;

export const ORDER_STATUS = {
    pending: { label: "Chờ xác nhận", color: "#b7791f", bg: "#fff8e1" },
    confirmed: { label: "Đã xác nhận", color: "#2b6cb0", bg: "#ebf4ff" },
    shipping: { label: "Đang giao", color: "#6b46c1", bg: "#f3ebff" },
    delivered: { label: "Đã giao", color: "#2f855a", bg: "#e6fffa" },
    cancelled: { label: "Đã hủy", color: "#c53030", bg: "#fff5f5" },
};

/** Thông báo lỗi từ response của backend (hoặc câu mặc định). */
export const apiMessage = (err, fallback) => (err && err.response && err.response.data && err.response.data.message) || fallback;
