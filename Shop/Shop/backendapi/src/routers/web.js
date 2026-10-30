const express = require("express");
const router = express.Router();
const productRouter = require("./product");
const categoryRouter = require("./category");
const orderRouter = require("./order");
const userRouter = require("./user");
const authRouter = require("./auth"); // THÊM DÒNG NÀY
const recommendationRouter = require("./recommendation"); // Giai đoạn 3: gợi ý Apriori / FP-Growth



router.use("/products", productRouter);
router.use("/categories", categoryRouter);
router.use("/order", orderRouter);
router.use("/users", userRouter);
router.use("/auth", authRouter); // THÊM DÒNG NÀY
router.use("/recommendations", recommendationRouter);
router.use("/coupons", require("./coupon")); // Giai đoạn 5 – đợt 5
router.use("/stats", require("./stats"));
router.use("/comments", require("./comment")); // Giai đoạn 5 – đợt 6B: admin quản lý bình luận








module.exports = router;
