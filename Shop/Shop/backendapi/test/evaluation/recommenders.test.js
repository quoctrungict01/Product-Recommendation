const test = require("node:test");
const assert = require("node:assert/strict");
const {
    itemCountsOf,
    randomRecommender,
    mostPopularRecommender,
    categoryBasedRecommender,
    cooccurrenceRecommender,
    associationRuleRecommender,
} = require("../../research/evaluation/recommenders");

const hex = (n) => n.toString(16).padStart(24, "0");
const [PH1, PH2, PH3, CASE, GLASS, CABLE, SOLD] = [1, 2, 3, 4, 5, 6, 7].map(hex);
const PHONE = hex(0xa1);
const ACC = hex(0xa2);
const products = [
    { _id: PH1, name: "Phone 1", category_id: PHONE, price: 100, is_stock: true },
    { _id: PH2, name: "Phone 2", category_id: PHONE, price: 90, is_stock: true },
    { _id: PH3, name: "Phone 3", category_id: PHONE, price: 80, is_stock: true },
    { _id: CASE, name: "Case", category_id: ACC, price: 5, is_stock: true },
    { _id: GLASS, name: "Glass", category_id: ACC, price: 3, is_stock: true },
    { _id: CABLE, name: "Cable", category_id: ACC, price: 2, is_stock: true },
    { _id: SOLD, name: "Sold out", category_id: ACC, price: 4, is_stock: false },
];
let t = 0;
const o = (...items) => ({ id: `o${t}`, time: t++, items });
const history = [
    ...Array.from({ length: 6 }, () => o(PH1, CASE, GLASS)),
    ...Array.from({ length: 2 }, () => o(PH1, SOLD)),
    ...Array.from({ length: 8 }, () => o(CABLE)),
    o(PH2, CABLE),
    o(PH3),
    o(PH3),
];
const ids = (list) => list.map((x) => x.productId);

test("itemCountsOf: đếm số đơn chứa sản phẩm, trùng trong đơn tính một lần", () => {
    const c = itemCountsOf([{ items: ["a", "a", "b"] }, { items: ["a"] }]);
    assert.deepEqual([...c.entries()].sort(), [["a", 2], ["b", 1]]);
});

test("Most Popular: theo số đơn trong lịch sử, bỏ hàng hết và sản phẩm đang xem", () => {
    const m = mostPopularRecommender({ k: 5 }).fit(history, products);
    assert.deepEqual(ids(m.recommend(CASE)), [CABLE, PH1, GLASS, PH3, PH2]);
    assert.ok(!ids(m.recommend(PH1)).includes(SOLD));
    assert.ok(m.recommend(PH1).every((x) => x.source === "baseline"));
});

test("Category-Based: cùng danh mục bán chạy trước, sau đó bổ sung bán chạy", () => {
    const m = categoryBasedRecommender({ k: 5 }).fit(history, products);
    assert.deepEqual(ids(m.recommend(PH2)), [PH1, PH3, CABLE, CASE, GLASS]);
});

test("Co-occurrence: xếp theo số đơn mua cùng, áp ngưỡng, không fallback", () => {
    const m = cooccurrenceRecommender({ k: 5, minSupport: 0.01, minConfidence: 0.01 }).fit(history, products);
    assert.deepEqual(ids(m.recommend(PH1)), [CASE, GLASS], "SOLD bị loại vì hết hàng");
    assert.deepEqual(ids(m.recommend(PH3)), [], "không có cặp nào");
    const strict = cooccurrenceRecommender({ k: 5, minSupport: 0.5, minConfidence: 0.01 }).fit(history, products);
    assert.deepEqual(ids(strict.recommend(PH1)), [], "6/19 < 50%");
});

test("Random: tái lập theo seed, không phụ thuộc thứ tự truy vấn, không trùng, không gợi ý chính nó", () => {
    const a = randomRecommender({ seed: 42, k: 5 }).fit(history, products);
    const b = randomRecommender({ seed: 42, k: 5 }).fit(history, products);
    const c = randomRecommender({ seed: 43, k: 5 }).fit(history, products);
    const r1 = ids(a.recommend(PH1));
    b.recommend(CASE); // gọi truy vấn khác trước
    assert.deepEqual(ids(b.recommend(PH1)), r1);
    assert.equal(new Set(r1).size, 5);
    assert.ok(!r1.includes(PH1) && !r1.includes(SOLD));
    const differs = products.some((p) => ids(c.recommend(p._id)).join() !== ids(a.recommend(p._id)).join());
    assert.ok(differs, "seed khác cho kết quả khác");
});

test("Luật kết hợp: dùng đúng code website; chỉ luật vs + fallback; Apriori = FP-Growth", () => {
    const params = { minSupport: 0.1, minConfidence: 0.2, k: 5 };
    const only = associationRuleRecommender({ ...params, fallback: false }).fit(history, products);
    const withFb = associationRuleRecommender({ ...params, fallback: true }).fit(history, products);
    const apriori = associationRuleRecommender({ ...params, algorithm: "apriori", fallback: true }).fit(history, products);

    assert.deepEqual(only.recommend(PH1), [
        { productId: CASE, source: "association-rule" },
        { productId: GLASS, source: "association-rule" },
    ]);
    const fb = withFb.recommend(PH1);
    assert.equal(fb.length, 5);
    assert.deepEqual(fb.slice(0, 2).map((x) => x.source), ["association-rule", "association-rule"]);
    assert.ok(fb.slice(2).every((x) => x.source === "fallback"));
    assert.ok(!ids(fb).includes(SOLD));
    for (const p of products) assert.deepEqual(apriori.recommend(p._id), withFb.recommend(p._id));
    assert.ok(withFb.stats.ruleCount > 0 && withFb.stats.miningMs >= 0);
});
