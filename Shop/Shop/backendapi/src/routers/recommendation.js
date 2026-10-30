// Router gợi ý sản phẩm, gắn tại /api/v1/recommendations (xem routers/web.js).
const express = require("express");
const { createRecommendationController } = require("../apps/controllers/apis/recommendation");
const { createRecommendationService } = require("../apps/services/recommendation/service");
const { createModelLoaders } = require("../apps/services/recommendation/loaders");

function createRecommendationRouter(getService, options) {
    const router = express.Router();
    const controller = createRecommendationController(getService, options);
    router.get("/products/:id", controller.forProduct);
    router.get("/status", controller.status);
    router.post("/refresh", controller.refresh);
    return router;
}

// Service mặc định dùng model của backend, tạo lười ở request đầu tiên.
let defaultService = null;
function getDefaultService() {
    if (!defaultService) {
        defaultService = createRecommendationService(
            createModelLoaders({
                OrderModel: require("../apps/models/order"),
                ProductModel: require("../apps/models/product"),
            })
        );
    }
    return defaultService;
}

// Giá hiển thị trên thẻ gợi ý = giá bán sau ưu đãi (cùng quy tắc với trang sản phẩm và đơn hàng).
const loadPricing = (ids) => require("../apps/models/product").find({ _id: { $in: ids } }, "price promotion is_stock").lean();
const router = createRecommendationRouter(getDefaultService, { loadPricing });
router.createRecommendationRouter = createRecommendationRouter;
router.getDefaultService = getDefaultService;

module.exports = router;
