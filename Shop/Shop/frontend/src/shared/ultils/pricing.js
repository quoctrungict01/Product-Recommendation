// Đọc giá đã được BACKEND tính (original_price, final_price, discount_percent, has_discount — xem backendapi/src/libs/pricing.js).
// Giao diện không tự tính ưu đãi; chỉ kiểm tra lại để không bao giờ hiển thị giá âm, NaN hay % giảm vô lý.
// Dữ liệu cũ chưa có các trường này (vd. giỏ hàng lưu từ trước) -> hiển thị `price` như giá bán, không có giảm giá.

const isMoney = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Chuỗi/số tiền -> số, hoặc null. "19.990.000" -> 19990000. */
export const toMoney = (value) => {
    if (typeof value === "number") return isMoney(value) ? value : null;
    if (typeof value !== "string") return null;
    const digits = value.trim().replace(/[., ]/g, "");
    return /^\d{1,13}$/.test(digits) ? Number(digits) : null;
};

/**
 * @returns {{ price: number|null, original: number|null, percent: number, hasDiscount: boolean, promotionText: string|null }}
 *   price = giá bán (hiển thị nổi bật); original/percent chỉ có nghĩa khi hasDiscount.
 */
export const getPricing = (product) => {
    const p = product || {};
    const promotionText = typeof p.promotion_text === "string" && p.promotion_text.trim() ? p.promotion_text.trim() : null;
    const hasBackend = "final_price" in p;
    const price = hasBackend ? (isMoney(p.final_price) ? p.final_price : null) : toMoney(p.price);
    const original = isMoney(p.original_price) ? p.original_price : null;
    const percent = Number.isInteger(p.discount_percent) ? p.discount_percent : 0;
    const hasDiscount = Boolean(p.has_discount) && price !== null && original !== null && original > price && percent > 0 && percent < 100;
    return { price, original: hasDiscount ? original : null, percent: hasDiscount ? percent : 0, hasDiscount, promotionText };
};

/** 19490000 -> "19.490.000"; không phải số hợp lệ -> "". */
export const formatMoney = (n) => (isMoney(n) ? new Intl.NumberFormat("vi-VN").format(n) : "");
