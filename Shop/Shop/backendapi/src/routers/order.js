// order.js
// Công khai: POST /order — khách chưa đăng nhập vẫn đặt được. Nếu có gửi Bearer token thì token phải hợp lệ
//   (sai/hết hạn -> 401) và đơn được gắn vào tài khoản đó; user_id do frontend gửi luôn bị bỏ qua.
// Thành viên: GET /order/my — chỉ đơn của chính mình.
// Chỉ admin: danh sách/chi tiết đơn (dữ liệu cá nhân), đổi trạng thái, thống kê cặp sản phẩm.
const express = require("express");
const router = express.Router();
const OrderController = require("../apps/controllers/apis/order");
const { asyncHandler } = require("../libs/async-handler");
const { optionalAuth, requireAuth, requireAdmin } = require("../apps/middlewares/auth");

router.post("/", optionalAuth, asyncHandler(OrderController.order));
router.get("/my", requireAuth, asyncHandler(OrderController.myOrders));
router.get("/getAll", requireAdmin, asyncHandler(OrderController.getAllOrders));
router.get("/topProductPairs", requireAdmin, asyncHandler(OrderController.getTopProductPairsNames));
router.get("/admin", requireAdmin, asyncHandler(OrderController.adminList));
router.get("/admin/:id", requireAdmin, asyncHandler(OrderController.adminDetail));
router.patch("/admin/:id/status", requireAdmin, asyncHandler(OrderController.updateStatus));

module.exports = router;
