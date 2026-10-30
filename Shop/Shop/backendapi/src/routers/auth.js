// BackendAPI/src/routers/auth.js
// Công khai: đăng nhập, đăng ký.
// Thành viên (chỉ tài khoản của chính mình, id lấy từ token):
//   GET /auth/me, PUT /auth/me (hồ sơ + địa chỉ mặc định), PUT /auth/me/password.
const express = require("express");
const router = express.Router();
const AuthController = require("../apps/controllers/apis/auth");
const { asyncHandler } = require("../libs/async-handler");
const { requireAuth } = require("../apps/middlewares/auth");
const { loginLimit, registerLimit } = require("../libs/rate-limit");

// Giới hạn tần suất (libs/rate-limit.js): vượt quá -> 429 kèm Retry-After.
router.post("/login", loginLimit, asyncHandler(AuthController.login));
router.post("/register", registerLimit, asyncHandler(AuthController.register));
router.get("/me", requireAuth, asyncHandler(AuthController.me));
router.put("/me", requireAuth, asyncHandler(AuthController.updateMe));
router.put("/me/password", requireAuth, asyncHandler(AuthController.changePassword));

module.exports = router;
