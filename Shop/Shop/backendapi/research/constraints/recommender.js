// M2 — gợi ý từ luật kết hợp có ràng buộc (chỉ nghiên cứu offline; KHÔNG dùng cho API/website).
//
//   M2-B: tập mục được khai phá với ràng buộc B1–B3 (business.js). mode "push" = cắt tỉa trong Apriori/FP-Growth
//         (miners.js), mode "post" = thuật toán gốc rồi hậu lọc. Hai mode cho cùng tập mục (có test và kiểm tra lúc chạy).
//   M2-A: luật {p} ⇒ {q} chỉ được dùng khi thỏa A2–A4; fallback cũng chỉ chọn sản phẩm thỏa A2–A4.
// Xếp hạng và fallback dùng ĐÚNG rankRecommendations() của website, chỉ thu hẹp đầu vào theo ràng buộc.

const { performance } = require("perf_hooks");
const { apriori, fpGrowth, generateRules } = require("../../src/apps/services/mining");
const { indexSingleItemRules, rankRecommendations } = require("../../src/apps/services/recommendation/ranking");
const { toPlainProduct } = require("../../src/apps/services/recommendation/service");
const { itemCountsOf } = require("../evaluation/recommenders");
const { assertMiningBudget } = require("../evaluation/budget");
const { buildBusinessRules } = require("./business");
const { CONSTRAINED, postFilter } = require("./miners");
const { fitMultilevel, buildModel } = require("../multilevel/recommender");
const { productIdOf, isProductNode } = require("../multilevel/hierarchy");

const ORIGINAL = { apriori, fpgrowth: fpGrowth };
const MODES = ["push", "post"];

/** Khai phá luật một cấp có ràng buộc tập mục B1–B3. */
function fitConstrainedFlat(history, products, { algorithm = "fpgrowth", minSupport, mode = "push" }) {
    if (!MODES.includes(mode)) throw new RangeError(`mode phải là push hoặc post: ${mode}`);
    const business = buildBusinessRules(products);
    const constraints = business.itemsetConstraints();
    const transactions = history.map((o) => o.items);
    assertMiningBudget(transactions, minSupport);
    const t0 = performance.now();
    let mined;
    let postFilteredOut = 0;
    if (mode === "push") mined = CONSTRAINED[algorithm](transactions, { minSupport, constraints });
    else {
        const raw = ORIGINAL[algorithm](transactions, { minSupport });
        mined = { itemsets: postFilter(raw.itemsets, constraints), stats: raw.stats };
        postFilteredOut = raw.itemsets.length - mined.itemsets.length;
    }
    const miningMs = performance.now() - t0;
    const rules = generateRules(mined.itemsets, { transactionCount: transactions.length, minConfidence: 0 });
    return {
        business,
        rules,
        itemsets: mined.itemsets,
        itemCounts: itemCountsOf(history),
        productsById: new Map(products.map(toPlainProduct).map((p) => [p._id, p])),
        stats: { mode, algorithm, miningMs, itemsets: mined.itemsets.length, rules: rules.length, postFilteredOut, algorithmStats: mined.stats },
    };
}

/** Mô hình gợi ý từ kết quả fitConstrainedFlat: luật thỏa A2–A4, xếp hạng và fallback của website. */
function constrainedFlatModel(fitted, { minConfidence = 0, k = 5, fallback = true } = {}) {
    const { business, itemCounts, productsById } = fitted;
    const ruleIndex = indexSingleItemRules(fitted.rules.filter((r) => r.confidence + 1e-12 >= minConfidence));
    const cache = new Map();
    return {
        stats: { ...fitted.stats, usableRules: [...ruleIndex.values()].reduce((s, l) => s + l.length, 0) },
        recommend(query) {
            if (cache.has(query)) return cache.get(query);
            const allowed = (id) => id === query || (productsById.has(id) && business.ruleAllowed(query, id));
            const rules = (ruleIndex.get(query) || []).filter((r) => allowed(r.consequent[0]));
            const pool = new Map([...productsById].filter(([id]) => allowed(id)));
            const items = rankRecommendations({ productId: query, ruleIndex: new Map([[query, rules]]), productsById: pool, itemCounts }, { limit: k, fallback }).items.map((i) => ({ productId: i.productId, source: i.source }));
            cache.set(query, items);
            return items;
        },
    };
}

/** Factory theo giao diện bộ đánh giá. */
function constrainedFlatRecommender({ algorithm = "fpgrowth", minSupport, minConfidence = 0, fallback = true, mode = "push", k = 5, label } = {}) {
    return {
        name: `m2-flat-${fallback ? "with-fallback" : "rules-only"}`,
        label: label || `M2 luật một cấp có ràng buộc (sup ${minSupport}, conf ${minConfidence}, ${mode})${fallback ? " + fallback có ràng buộc" : ", chỉ luật"}`,
        params: { algorithm, minSupport, minConfidence, fallback, mode },
        fit: (history, products) => constrainedFlatModel(fitConstrainedFlat(history, products, { algorithm, minSupport, mode }), { minConfidence, k, fallback }),
    };
}

/** Ràng buộc B1–B3 trên các nút của hệ phân cấp M1. */
function multilevelConstraintsFor(products) {
    const business = buildBusinessRules(products);
    const resolve = (node) => (isProductNode(node) ? { type: "product", id: productIdOf(node) } : { type: "category", id: node.slice(2) });
    return { business, constraintsFor: () => business.itemsetConstraints(resolve) };
}

/** M1 + M2: khai phá đa mức có ràng buộc, rồi lọc ứng viên/fallback theo A2–A4. */
function fitConstrainedMultilevel(history, products, params, mode = "push") {
    const { business, constraintsFor } = multilevelConstraintsFor(products);
    return { business, fitted: fitMultilevel(history, products, params, { constraintsFor, constraintMode: mode }) };
}

function constrainedMultilevelModel({ business, fitted }, { minConfidence = 0, policy = "specific-first", k = 5, fallback = true } = {}) {
    const allowed = (q, id) => business.ruleAllowed(q, id);
    return buildModel(fitted, { minConfidence, policy, k, fallback, candidateFilter: allowed, fallbackFilter: allowed });
}

function constrainedMultilevelRecommender({ algorithm = "fpgrowth", productMinSupport, categoryMinSupport = productMinSupport, minConfidence = 0, policy = "specific-first", fallback = true, mode = "push", k = 5, label } = {}) {
    return {
        name: `m2-m1-${fallback ? "with-fallback" : "rules-only"}`,
        label: label || `M2 + M1 (sp ${productMinSupport}, dm ${categoryMinSupport}, conf ${minConfidence}, ${policy}, ${mode})${fallback ? " + fallback có ràng buộc" : ", chỉ luật"}`,
        params: { algorithm, productMinSupport, categoryMinSupport, minConfidence, policy, fallback, mode },
        fit: (history, products) => constrainedMultilevelModel(fitConstrainedMultilevel(history, products, { algorithm, productMinSupport, categoryMinSupport }, mode), { minConfidence, policy, k, fallback }),
    };
}

module.exports = {
    MODES,
    fitConstrainedFlat,
    constrainedFlatModel,
    constrainedFlatRecommender,
    multilevelConstraintsFor,
    fitConstrainedMultilevel,
    constrainedMultilevelModel,
    constrainedMultilevelRecommender,
};
