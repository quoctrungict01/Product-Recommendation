// Controller API gợi ý sản phẩm mua kèm (Apriori / FP-Growth).

const { RecommendationError } = require("../../services/recommendation/service");
const { productPricing } = require("../../../libs/pricing");

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function sendError(res, err) {
    if (err instanceof RecommendationError) {
        if (err.status >= 500) console.error("Recommendation error:", err.cause || err);
        return res.status(err.status).json({ status: "error", code: err.code, message: err.message });
    }
    console.error("Recommendation error:", err);
    return res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "Internal Server Error" });
}

/**
 * Gắn giá bán sau ưu đãi vào từng sản phẩm gợi ý (chỉ phục vụ hiển thị; không đổi kết quả khai phá).
 * Lỗi khi tra giá -> trả nguyên dữ liệu gợi ý, không làm hỏng API.
 */
async function attachPricing(data, loadPricing) {
    if (!loadPricing || !data || !Array.isArray(data.items) || data.items.length === 0) return data;
    try {
        const ids = data.items.map((item) => item.product && item.product._id).filter(Boolean);
        const docs = await loadPricing(ids);
        const byId = new Map(docs.map((d) => [String(d._id), d]));
        const items = data.items.map((item) => {
            const doc = item.product && byId.get(String(item.product._id));
            if (!doc) return item;
            return { ...item, product: { ...item.product, is_stock: doc.is_stock !== false, ...productPricing(doc) } };
        });
        return { ...data, items };
    } catch (err) {
        console.error("Recommendation pricing error:", err && err.message);
        return data;
    }
}

/**
 * @param {() => object} getService trả về service (tạo lười khi cần)
 * @param {{ loadPricing?: (ids: string[]) => Promise<object[]> }} [options] tra price/promotion/is_stock theo id
 */
function createRecommendationController(getService, options = {}) {
    return {
        // GET /recommendations/products/:id?algorithm=fpgrowth&minSupport=0.01&minConfidence=0.2&limit=5
        async forProduct(req, res) {
            try {
                const data = await attachPricing(await getService().recommend(req.params.id, req.query), options.loadPricing);
                res.status(200).json({ status: "success", data });
            } catch (err) {
                sendError(res, err);
            }
        },

        // GET /recommendations/status : tình trạng cache
        status(req, res) {
            res.status(200).json({ status: "success", data: getService().status() });
        },

        // POST /recommendations/refresh : xóa cache, lần gọi sau sẽ khai phá lại.
        // Chỉ nhận request từ chính máy chạy backend.
        refresh(req, res) {
            const remote = req.socket?.remoteAddress;
            if (!LOOPBACK.has(remote)) {
                return res.status(403).json({ status: "error", code: "FORBIDDEN", message: "Chỉ được gọi từ localhost." });
            }
            res.status(200).json({ status: "success", data: getService().invalidate("manual") });
        },
    };
}

module.exports = { createRecommendationController, attachPricing, LOOPBACK };
