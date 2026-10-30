// product.js
// Công khai: xem sản phẩm, bình luận, gợi ý cũ. Thành viên: viết bình luận. Chỉ admin: tạo/sửa/xóa sản phẩm, xóa bình luận.
const express = require("express");
const router = express.Router();
const ProductController = require("../apps/controllers/apis/product");
const ProductSuggestionsController = require("../apps/controllers/apis/productsuggestions");
const { asyncHandler } = require("../libs/async-handler");
const { requireAuth, requireAdmin } = require("../apps/middlewares/auth");

// Route tĩnh "/create" phải đứng trước "/:id" để không bị hiểu là id.
router.post("/create", requireAdmin, asyncHandler(ProductController.addProduct));
router.post("/upload-image", requireAdmin, ProductController.uploadImage);
router.get("/", asyncHandler(ProductController.index));
router.get("/:id", asyncHandler(ProductController.show));
router.get("/:id/comments", asyncHandler(ProductController.comments));
router.post("/:id/comments", requireAuth, asyncHandler(ProductController.storeComments));
router.delete("/:id/comments/:commentId", requireAdmin, asyncHandler(ProductController.deleteComment));
router.put("/:id/update", requireAdmin, asyncHandler(ProductController.updateProduct));
router.delete("/:id/delete", requireAdmin, asyncHandler(ProductController.deleteProduct));
router.get("/:id/product-suggestions", asyncHandler(ProductSuggestionsController.getProductSuggestions));

module.exports = router;
