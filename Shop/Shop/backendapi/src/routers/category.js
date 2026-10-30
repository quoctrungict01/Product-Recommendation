// category.js
// Công khai: xem danh mục và sản phẩm theo danh mục. Chỉ admin: tạo/sửa/xóa.
const express = require("express");
const router = express.Router();
const CategoryController = require("../apps/controllers/apis/category");
const ProductController = require("../apps/controllers/apis/product");
const { asyncHandler } = require("../libs/async-handler");
const { requireAdmin } = require("../apps/middlewares/auth");

router.post("/create", requireAdmin, asyncHandler(CategoryController.create));
router.put("/update/:id", requireAdmin, asyncHandler(CategoryController.update));
router.delete("/delete/:id", requireAdmin, asyncHandler(CategoryController.delete));
router.get("/", asyncHandler(CategoryController.index));
router.get("/:id", asyncHandler(CategoryController.show));
router.get("/:id/products", asyncHandler(ProductController.getProductsByCategoryId));

module.exports = router;
