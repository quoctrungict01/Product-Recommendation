// Định dạng dùng chung cho trang quản trị.

const isMoney = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** 19490000 -> "19.490.000đ"; không phải số hợp lệ -> "—". */
export const formatMoney = (n) => (isMoney(n) ? `${new Intl.NumberFormat("vi-VN").format(n)}đ` : "—");

/** Chuỗi/số tiền -> số nguyên >= 0, hoặc null. Chấp nhận "19.990.000". */
export const toMoney = (value) => {
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
    if (typeof value !== "string") return null;
    const digits = value.trim().replace(/[., ]/g, "");
    return /^\d{1,13}$/.test(digits) ? Number(digits) : null;
};

export const formatDate = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Mã đơn ngắn hiển thị cho khách (giống trang Shop): "#" + 8 ký tự cuối của _id, viết hoa. */
export const orderCode = (id) => `#${String(id || "").slice(-8).toUpperCase()}`;

export const ORDER_STATUS = {
    pending: { label: "Chờ xác nhận", className: "label label-warning" },
    confirmed: { label: "Đã xác nhận", className: "label label-info" },
    shipping: { label: "Đang giao", className: "label label-primary" },
    delivered: { label: "Đã giao", className: "label label-success" },
    cancelled: { label: "Đã hủy", className: "label label-danger" },
};
export const ORDER_STATUS_KEYS = Object.keys(ORDER_STATUS);

/** Thông báo lỗi từ backend (hoặc câu mặc định). */
export const apiMessage = (err, fallback) => (err && err.response && err.response.data && err.response.data.message) || fallback;
