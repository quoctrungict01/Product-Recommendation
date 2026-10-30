// Thống kê doanh thu — CHỈ ADMIN.
const express = require("express");
const router = express.Router();
const StatsController = require("../apps/controllers/apis/stats");
const { asyncHandler } = require("../libs/async-handler");
const { requireAdmin } = require("../apps/middlewares/auth");

router.use(requireAdmin);
router.get("/summary", asyncHandler(StatsController.summary));
router.get("/revenue", asyncHandler(StatsController.revenue));
router.get("/top-products", asyncHandler(StatsController.topProducts));

module.exports = router;
