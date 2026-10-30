// Integration test với MongoDB GR2 trên localhost — CHỈ ĐỌC.
// Mặc định bị bỏ qua; chạy bằng:  RECO_DB_IT=1 node --test test/
// (PowerShell: $env:RECO_DB_IT=1; node --test test/)
//
// Dùng kết nối riêng (autoIndex/autoCreate tắt) và kiểm tra số bản ghi trước/sau không đổi.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const enabled = process.env.RECO_DB_IT === "1";

test("GR2 thật: gợi ý cho iPhone 15 bằng Apriori và FP-Growth (chỉ đọc)", { skip: !enabled && "đặt RECO_DB_IT=1 để chạy" }, async (t) => {
    process.env.NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR || path.join(__dirname, "..", "..", "config");
    const config = require("config");
    const { assertSafeDemoTarget } = require("../../scripts/seed-demo/safety");
    const { loadModelsOffline, mongoose } = require("../../scripts/seed-demo/models");
    const { createModelLoaders } = require("../../src/apps/services/recommendation/loaders");
    const { createRecommendationService } = require("../../src/apps/services/recommendation/service");

    const uri = config.get("db.mongodb.uri");
    assertSafeDemoTarget(uri); // chỉ localhost + GR2

    const schemas = loadModelsOffline();
    const conn = await mongoose.createConnection(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 }).asPromise();
    t.after(() => conn.close());

    const OrderModel = conn.model("Orders", schemas.OrderModel.schema, "orders");
    const ProductModel = conn.model("Products", schemas.ProductModel.schema, "products");
    const counts = async () => ({
        orders: await conn.db.collection("orders").countDocuments(),
        products: await conn.db.collection("products").countDocuments(),
        categories: await conn.db.collection("categories").countDocuments(),
    });
    const before = await counts();

    const service = createRecommendationService(createModelLoaders({ OrderModel, ProductModel }));
    const iphone = await ProductModel.findOne({ name: "iPhone 15 128GB" }).lean();
    assert.ok(iphone, "cần dữ liệu demo đã seed");

    const a = await service.recommend(String(iphone._id), { algorithm: "apriori" });
    const f = await service.recommend(String(iphone._id), { algorithm: "fpgrowth" });
    assert.equal(f.meta.transactionCount, before.orders);
    assert.deepEqual(
        a.items.map((i) => [i.product._id, i.source, i.rule?.confidence]),
        f.items.map((i) => [i.product._id, i.source, i.rule?.confidence])
    );
    assert.ok(f.meta.ruleItemCount >= 1, "phải có ít nhất một gợi ý từ luật kết hợp");
    assert.equal(f.items[0].source, "association-rule");
    assert.ok(f.items.length <= 5);
    assert.ok(!f.items.some((i) => i.product._id === String(iphone._id)));

    t.diagnostic(`Apriori ${a.meta.miningMs} ms, FP-Growth ${f.meta.miningMs} ms, ${f.meta.ruleCount} luật`);
    for (const item of f.items) {
        t.diagnostic(
            `${item.source.padEnd(16)} ${item.product.name}` +
                (item.rule ? ` conf=${item.rule.confidence.toFixed(2)} lift=${item.rule.lift.toFixed(2)} sup=${item.rule.support.toFixed(3)}` : ` (${item.fallbackReason})`)
        );
    }

    assert.deepEqual(await counts(), before, "không được ghi gì vào database");
});
