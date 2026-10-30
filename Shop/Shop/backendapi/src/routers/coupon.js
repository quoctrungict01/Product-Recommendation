// Mã giảm giá. Công khai: POST /coupons/preview (chỉ xem trước, không trừ lượt — khách chưa đăng nhập vẫn dùng được).
// Chỉ admin: /coupons/admin (danh sách, xem, tạo, sửa, bật/vô hiệu hóa).
const express = require("express");
const router = express.Router();
const CouponController = require("../apps/controllers/apis/coupon");
const OrderController = require("../apps/controllers/apis/order");
const { asyncHandler } = require("../libs/async-handler");
const { requireAdmin } = require("../apps/middlewares/auth");
const { couponPreviewLimit } = require("../libs/rate-limit");

router.post("/preview", couponPreviewLimit, asyncHandler(OrderController.previewCoupon));
router.get("/admin", requireAdmin, asyncHandler(CouponController.list));
router.post("/admin", requireAdmin, asyncHandler(CouponController.create));
router.get("/admin/:id", requireAdmin, asyncHandler(CouponController.show));
router.put("/admin/:id", requireAdmin, asyncHandler(CouponController.update));
router.patch("/admin/:id/status", requireAdmin, asyncHandler(CouponController.setStatus));

module.exports = router;
