// Tính giá bán của sản phẩm — nguồn sự thật duy nhất cho giá hiển thị và giá đặt hàng.
//
// Dùng schema hiện có, KHÔNG thêm trường:
//   price      (String) — giá gốc, số nguyên VND. Chấp nhận dấu phân cách: "19990000", "19.990.000", "19 990 000".
//   promotion  (String) — nếu là số tiền hợp lệ thì là SỐ TIỀN GIẢM (VND), vd. "500000"; "0" = không giảm.
//                         Nếu là chữ (vd. "Tặng ốp lưng") thì là quà tặng/mô tả, KHÔNG làm thay đổi giá.
//
// Quy tắc:
//   1. Giá gốc hợp lệ khi là số nguyên 1 .. MAX_PRICE. Không hợp lệ -> không bán được (final_price = null).
//   2. Ưu đãi hợp lệ khi 0 < số tiền giảm < giá gốc. Ngược lại (0, chữ, âm, >= giá gốc) -> không giảm.
//   3. Giá bán = giá gốc - số tiền giảm (luôn >= 1, không âm, không NaN).
//   4. Phần trăm giảm = làm tròn(giảm / gốc * 100), kẹp trong 1..99 (không bao giờ 0% hay >= 100%).

const MAX_PRICE = 1e12; // 1.000 tỷ VND — chặn giá trị vô lý/tràn số

/** Chuỗi/số tiền -> số nguyên >= 0, hoặc null nếu không phải số tiền hợp lệ. */
function parseMoney(value) {
    let n;
    if (typeof value === "number") n = value;
    else if (typeof value === "string") {
        const digits = value.trim().replace(/[., ]/g, "");
        if (!/^\d{1,13}$/.test(digits)) return null;
        n = Number(digits);
    } else return null;
    if (!Number.isSafeInteger(n) || n < 0 || n > MAX_PRICE) return null;
    return n;
}

/**
 * @param {{price?: unknown, promotion?: unknown}} product
 * @returns {{original_price: number|null, final_price: number|null, discount_amount: number, discount_percent: number, has_discount: boolean, promotion_text: string|null}}
 */
function productPricing(product) {
    const p = product || {};
    const original = parseMoney(p.price);
    const promoAmount = parseMoney(p.promotion);
    const rawPromo = typeof p.promotion === "string" ? p.promotion.trim() : "";
    // Khuyến mại dạng chữ (quà tặng) — chỉ để hiển thị.
    const promotionText = promoAmount === null && rawPromo ? rawPromo.slice(0, 200) : null;
    if (original === null || original < 1) {
        return { original_price: null, final_price: null, discount_amount: 0, discount_percent: 0, has_discount: false, promotion_text: promotionText };
    }
    const hasDiscount = promoAmount !== null && promoAmount > 0 && promoAmount < original;
    const discount = hasDiscount ? promoAmount : 0;
    const percent = hasDiscount ? Math.min(99, Math.max(1, Math.round((discount * 100) / original))) : 0;
    return {
        original_price: original,
        final_price: original - discount,
        discount_amount: discount,
        discount_percent: percent,
        has_discount: hasDiscount,
        promotion_text: promotionText,
    };
}

/** Sản phẩm (document hoặc object thường) -> object thường kèm các trường giá đã tính. */
function withPricing(product) {
    if (!product) return product;
    const plain = typeof product.toObject === "function" ? product.toObject() : { ...product };
    return { ...plain, is_stock: plain.is_stock !== false, ...productPricing(plain) };
}

module.exports = { MAX_PRICE, parseMoney, productPricing, withPricing };
