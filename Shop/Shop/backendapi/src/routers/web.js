const express = require("express");
const router = express.Router();
const productRouter = require("./product");
const categoryRouter = require("./category");
const orderRouter = require("./order");
const userRouter = require("./user");
const authRouter = require("./auth"); // THÊM DÒNG NÀY



router.use("/products", productRouter);
router.use("/categories", categoryRouter);
router.use("/order", orderRouter);
router.use("/users", userRouter);
router.use("/auth", authRouter); // THÊM DÒNG NÀY








module.exports = router;
