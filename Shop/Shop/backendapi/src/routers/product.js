// product.js
const express = require("express");
const router = express.Router();
const ProductController = require("../apps/controllers/apis/product");
const ProductSuggestionsController = require("../apps/controllers/apis/productsuggestions");


router.get("/", ProductController.index);
router.get("/:id", ProductController.show);
// router.get("/:id", ProductController.getProductById); 
router.get("/:id/comments", ProductController.comments);
router.post("/:id/comments", ProductController.storeComments);
router.delete("/:id/comments/:commentId", ProductController.deleteComment); 
router.post("/create", ProductController.addProduct);
router.put("/:id/update", ProductController.updateProduct);
router.delete("/:id/delete", ProductController.deleteProduct); 
router.get('/:id/product-suggestions', ProductSuggestionsController.getProductSuggestions);




module.exports = router;
