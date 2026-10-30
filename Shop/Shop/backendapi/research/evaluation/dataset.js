// Dựng bộ dữ liệu đánh giá OFFLINE từ kế hoạch seed (seed mặc định 20261026, 1.000 đơn).
// Không kết nối MongoDB: buildPlan() chỉ tính toán trong bộ nhớ, đúng dữ liệu đã seed vào GR2.

const crypto = require("crypto");
const { buildPlan } = require("../../scripts/seed-demo/plan");
const { CATEGORIES } = require("../../scripts/seed-demo/catalog");

const DEMO_SEED = 20261026;
const DEMO_ORDER_COUNT = 1000;

/**
 * @returns {{
 *   name: string, source: string, seed: number, orderCount: number, checksum: string,
 *   products: {_id: string, name: string, category_id: string, category: string, price: number, is_stock: boolean}[],
 *   orders: {id: string, time: number, items: string[]}[]
 * }}
 */
function datasetFromSeedPlan({ seed = DEMO_SEED, orderCount = DEMO_ORDER_COUNT } = {}) {
    const plan = buildPlan({ seed, orderCount });
    const categoryNameById = new Map(plan.categories.map((c) => [String(c._id), CATEGORIES.find((x) => x.key === c.key).name]));

    const products = plan.products.map((p) => ({
        _id: String(p._id),
        name: p.doc.name,
        category_id: String(p.doc.category_id),
        category: categoryNameById.get(String(p.doc.category_id)),
        price: Number(p.doc.price),
        is_stock: p.doc.is_stock !== false,
    }));

    const orders = plan.orders.map((o) => ({
        id: String(o._id),
        time: o.doc.createdAt.getTime(),
        // Sản phẩm trùng trong một đơn chỉ tính một lần, giống transactionsFromOrders().
        items: [...new Set(o.doc.items.map((i) => String(i.prd_id)))].sort(),
    }));

    const checksum = crypto.createHash("sha1").update(JSON.stringify(orders)).digest("hex");
    return {
        name: seed === DEMO_SEED && orderCount === DEMO_ORDER_COUNT ? "GR2-demo (tái tạo offline)" : `seed-plan-${seed}-${orderCount}`,
        source: "scripts/seed-demo/plan.js (dữ liệu giả lập có luật cài sẵn)",
        seed,
        orderCount,
        checksum,
        products,
        orders,
    };
}

module.exports = { DEMO_SEED, DEMO_ORDER_COUNT, datasetFromSeedPlan };
