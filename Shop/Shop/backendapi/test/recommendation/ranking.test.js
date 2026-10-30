const test = require("node:test");
const assert = require("node:assert/strict");

const { indexSingleItemRules, rankRecommendations, SOURCE_RULE, SOURCE_FALLBACK } = require("../../src/apps/services/recommendation/ranking");
const { toPlainProduct } = require("../../src/apps/services/recommendation/service");
const { P, products } = require("./fixtures");

const rule = (a, c, confidence, lift, support, supportCount = 10) => ({
    antecedent: Array.isArray(a) ? a : [a],
    consequent: Array.isArray(c) ? c : [c],
    confidence,
    lift,
    support,
    supportCount,
    kulczynski: 0,
    imbalanceRatio: 0,
});

const productsById = new Map(products.map(toPlainProduct).map((p) => [p._id, p]));

test("Chỉ dùng luật {P} ⇒ {Q}: bỏ luật nhiều vế trái hoặc nhiều vế phải", () => {
    const index = indexSingleItemRules([
        rule(P.phone, P.caseA, 0.8, 2, 0.3),
        rule([P.phone, P.caseA], P.glass, 0.9, 3, 0.2),
        rule(P.phone, [P.caseA, P.glass], 0.6, 3, 0.2),
    ]);
    assert.deepEqual([...index.keys()], [P.phone]);
    assert.equal(index.get(P.phone).length, 1);
});

test("Xếp hạng: confidence → lift → support → _id", () => {
    const index = indexSingleItemRules([
        rule(P.phone, P.charger, 0.5, 2.0, 0.1),
        rule(P.phone, P.glass, 0.5, 3.0, 0.1), // cùng confidence, lift cao hơn
        rule(P.phone, P.caseA, 0.9, 1.5, 0.3), // confidence cao nhất
        rule(P.phone, P.phone2, 0.5, 2.0, 0.2), // cùng conf & lift với charger, support cao hơn
    ]);
    const { items } = rankRecommendations({ productId: P.phone, ruleIndex: index, productsById }, { fallback: false });
    assert.deepEqual(items.map((i) => i.productId), [P.caseA, P.glass, P.phone2, P.charger]);
    assert.ok(items.every((i) => i.source === SOURCE_RULE && i.rule && i.explanation.includes("%")));
});

test("Loại sản phẩm hết hàng, không tồn tại, lift <= 1 và chính sản phẩm đang xem", () => {
    const ghost = "f".repeat(24);
    const index = indexSingleItemRules([
        rule(P.phone, P.soldOut, 0.95, 4, 0.3),
        rule(P.phone, ghost, 0.9, 4, 0.3),
        rule(P.phone, P.popular, 0.85, 0.9, 0.3), // tương quan âm
        rule(P.phone, P.popular, 0.6, 1.0, 0.3), // độc lập (lift = 1)
        rule(P.phone, P.phone, 0.99, 9, 0.5), // không thể xảy ra, nhưng vẫn phải loại
        rule(P.phone, P.caseA, 0.5, 2, 0.2),
    ]);
    const { items, skipped } = rankRecommendations({ productId: P.phone, ruleIndex: index, productsById }, { fallback: false });
    assert.deepEqual(items.map((i) => i.productId), [P.caseA]);
    assert.deepEqual(skipped, { outOfStock: 1, missing: 1, lowLift: 2, duplicate: 1 });
});

test("Tối đa `limit` sản phẩm, không trùng", () => {
    const ids = [P.caseA, P.glass, P.charger, P.popular, P.phone2, P.phone3, P.lonely];
    const index = indexSingleItemRules(ids.map((id, i) => rule(P.phone, id, 0.9 - i * 0.1, 2, 0.1)));
    const { items } = rankRecommendations({ productId: P.phone, ruleIndex: index, productsById }, { limit: 5 });
    assert.equal(items.length, 5);
    assert.equal(new Set(items.map((i) => i.productId)).size, 5);
    assert.ok(items.every((i) => i.source === SOURCE_RULE));
});

test("Fallback: cùng danh mục (bán chạy trước) rồi tới bán chạy toàn shop, đánh dấu rõ nguồn", () => {
    const itemCounts = new Map([
        [P.phone3, 3],
        [P.phone2, 1],
        [P.popular, 22],
        [P.charger, 7],
    ]);
    const index = indexSingleItemRules([rule(P.phone, P.caseA, 0.8, 2.6, 0.3)]);
    const { items } = rankRecommendations({ productId: P.phone, ruleIndex: index, productsById, itemCounts }, { limit: 5 });
    assert.deepEqual(items.map((i) => [i.productId, i.source, i.fallbackReason]), [
        [P.caseA, SOURCE_RULE, undefined],
        [P.phone3, SOURCE_FALLBACK, "same-category"],
        [P.phone2, SOURCE_FALLBACK, "same-category"],
        [P.popular, SOURCE_FALLBACK, "best-seller"],
        [P.charger, SOURCE_FALLBACK, "best-seller"],
    ]);
    for (const i of items.filter((x) => x.source === SOURCE_FALLBACK)) {
        assert.equal(i.rule, null, "fallback không được mang chỉ số luật");
        assert.match(i.explanation, /Không đủ luật kết hợp/);
    }
    assert.ok(!items.some((i) => i.productId === P.soldOut), "fallback cũng không gợi ý hàng hết");
});

test("Không có luật nào: toàn bộ là fallback", () => {
    const { items, matchedRuleCount } = rankRecommendations({ productId: P.lonely, ruleIndex: new Map(), productsById, itemCounts: new Map() });
    assert.equal(matchedRuleCount, 0);
    assert.equal(items.length, 5);
    assert.ok(items.every((i) => i.source === SOURCE_FALLBACK));
    assert.ok(!items.some((i) => i.productId === P.lonely));
});

test("fallback=false không bổ sung gì", () => {
    const { items } = rankRecommendations({ productId: P.lonely, ruleIndex: new Map(), productsById }, { fallback: false });
    assert.deepEqual(items, []);
});
