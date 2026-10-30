// Quản lý bình luận (đợt 6B) — chỉ admin. Bình luận công khai theo sản phẩm vẫn ở /products/:id/comments.
const express = require("express");
const router = express.Router();
const CommentController = require("../apps/controllers/apis/comment");
const { asyncHandler } = require("../libs/async-handler");
const { requireAdmin } = require("../apps/middlewares/auth");

router.use(requireAdmin);
router.get("/admin", asyncHandler(CommentController.list));
router.delete("/admin/:id", asyncHandler(CommentController.remove));

module.exports = router;
