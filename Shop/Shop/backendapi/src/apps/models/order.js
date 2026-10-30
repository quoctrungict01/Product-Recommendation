// Đơn hàng.
// Trường bổ sung ở Giai đoạn 5 – đợt 2 đều TÙY CHỌN để 1.000 đơn demo cũ vẫn hợp lệ:
//   user_id           — tài khoản đặt đơn (chỉ backend gán từ JWT; đơn của khách và đơn demo không có).
//   shipping_address  — địa chỉ giao hàng có cấu trúc; trường `address` (chuỗi) vẫn luôn được lưu.
//   status            — trạng thái đơn; đơn cũ không có trường này được hiểu là "pending".
//   status_history    — (đợt 4) nhật ký đổi trạng thái do admin thực hiện; chỉ ghi khi admin đổi trạng thái.
//   (đợt 5) Chi tiết giá — chỉ đơn mới có; đơn cũ không có các trường này và KHÔNG được tính lại:
//   subtotal_original — tổng giá gốc; product_discount — tổng khuyến mãi sản phẩm;
//   subtotal          — tổng giá bán (sau khuyến mãi, trước coupon); coupon / coupon_discount — mã đã áp dụng;
//   totalPrice        — số tiền khách trả = subtotal - coupon_discount;
//   delivered_at      — thời điểm admin chuyển sang "Đã giao" (mốc ghi nhận doanh thu thực tế).
const mongoose = require("../../common/database")();
const addressSchema = require("./address");

const ORDER_STATUSES = ["pending", "confirmed", "shipping", "delivered", "cancelled"];

const orderSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
    default: null,
  },
  fullName: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  shipping_address: {
    type: addressSchema,
    default: null,
  },
  status: {
    type: String,
    enum: ORDER_STATUSES,
    default: "pending",
  },
  subtotal_original: { type: Number, default: undefined },
  product_discount: { type: Number, default: undefined },
  subtotal: { type: Number, default: undefined },
  coupon: {
    type: new mongoose.Schema(
      {
        coupon_id: { type: mongoose.Schema.Types.ObjectId, ref: "Coupons", required: true },
        code: { type: String, required: true },
        type: { type: String, enum: ["fixed", "percent"], required: true },
        value: { type: Number, required: true },
        discount: { type: Number, required: true },
      },
      { _id: false }
    ),
    default: undefined,
  },
  coupon_discount: { type: Number, default: undefined },
  delivered_at: { type: Date, default: undefined },
  status_history: {
    type: [
      new mongoose.Schema(
        {
          from: { type: String, enum: ORDER_STATUSES, required: true },
          to: { type: String, enum: ORDER_STATUSES, required: true },
          at: { type: Date, required: true },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "Users", default: null },
        },
        { _id: false }
      ),
    ],
    default: undefined, // không tự thêm mảng rỗng vào đơn cũ
  },
  totalPrice: {
    type: Number,
    default: 0,
  },
  items: [
    {
      prd_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Products",
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
      // (đợt 5) giá gốc lúc đặt; price là giá bán sau khuyến mãi sản phẩm (trước coupon).
      original_price: {
        type: Number,
        default: undefined,
      },
      qty: {
        type: Number,
        required: true,
      },
    },
  ],
}, {timestamps: true});

const OrderModel = mongoose.model("Orders", orderSchema, "orders");
module.exports = OrderModel;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
