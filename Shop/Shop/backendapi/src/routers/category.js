// category.js
const express = require("express");
const router = express.Router();
const CategoryController = require("../apps/controllers/apis/category");
const ProductController = require("../apps/controllers/apis/product");


router.post("/create", CategoryController.create);
router.put("/update/:id", CategoryController.update);
router.delete("/delete/:id", CategoryController.delete);
router.get("/", CategoryController.index);
router.get("/:id", CategoryController.show);
router.get("/:id/products", ProductController.getProductsByCategoryId);


module.exports = router;
