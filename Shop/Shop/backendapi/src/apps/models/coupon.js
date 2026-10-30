// Mã giảm giá (Giai đoạn 5 – đợt 5). Áp dụng trên tạm tính SAU khuyến mãi sản phẩm; mỗi đơn tối đa một mã.
//   code          — chữ in hoa/số/-/_ (3–30 ký tự), duy nhất (kiểm tra ở controller, không phân biệt hoa/thường).
//   type          — "fixed": giảm số tiền cố định (value VND) | "percent": giảm value% (1–100).
//   min_order     — tạm tính tối thiểu để dùng mã (VND, 0 = không yêu cầu).
//   max_discount  — trần số tiền giảm (thường dùng với percent); null = không giới hạn.
//   starts_at/ends_at — thời gian hiệu lực; null = không giới hạn phía đó.
//   usage_limit   — tổng số lượt dùng tối đa; null = không giới hạn. used_count tăng/giảm nguyên tử khi đặt đơn.
//   is_active     — admin vô hiệu hóa mã bằng cách đặt false (không xóa, để giữ lịch sử đơn).
const mongoose = require("../../common/database")();

const COUPON_TYPES = ["fixed", "percent"];

const couponSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, trim: true, uppercase: true },
        description: { type: String, default: "" },
        type: { type: String, enum: COUPON_TYPES, required: true },
        value: { type: Number, required: true, min: 1 },
        min_order: { type: Number, default: 0, min: 0 },
        max_discount: { type: Number, default: null, min: 1 },
        starts_at: { type: Date, default: null },
        ends_at: { type: Date, default: null },
        usage_limit: { type: Number, default: null, min: 1 },
        used_count: { type: Number, default: 0, min: 0 },
        is_active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

const CouponModel = mongoose.model("Coupons", couponSchema, "coupons");
module.exports = CouponModel;
module.exports.COUPON_TYPES = COUPON_TYPES;
