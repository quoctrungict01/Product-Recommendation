// user.js — quản lý tài khoản: CHỈ ADMIN cho mọi route.
// Người dùng thường xem thông tin của chính mình qua GET /auth/me (không qua ID trên URL).
const express = require("express");
const router = express.Router();
const UserController = require("../apps/controllers/apis/user");
const { asyncHandler } = require("../libs/async-handler");
const { requireAdmin } = require("../apps/middlewares/auth");

router.use(requireAdmin);
router.post("/create", asyncHandler(UserController.create));
router.put("/update/:id", asyncHandler(UserController.update));
router.delete("/delete/:id", asyncHandler(UserController.delete));
router.get("/", asyncHandler(UserController.index));
router.get("/:id", asyncHandler(UserController.getById));

module.exports = router;
