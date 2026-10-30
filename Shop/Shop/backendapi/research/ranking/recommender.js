// M3: dựng "nền" ứng viên từ các phương pháp đã có rồi xếp hạng lại (strategies.js).
//
// Nền (base):
//   flat    — luật một cấp của website: mine() gốc, luật {p} ⇒ {q}, lift > 1, thứ tự native = conf → lift → support
//   m2-flat — như flat nhưng khai phá có ràng buộc (M2-B) và chỉ giữ luật thỏa A2–A4 (M2-A)
//   m1      — luật đa mức (M1), thứ tự native = policy của M1
//   m2-m1   — M1 + ràng buộc M2
// Mỗi ứng viên mang: luật nguồn, J (số đơn chứa cả ngữ cảnh và q), sup(ngữ cảnh), sup(q) -> đủ để tính
// confidence, lift, Kulczynski, IR, độ phổ biến và giải thích được từng gợi ý.
// Fallback dùng đúng rankRecommendations() của website (với M2: chỉ sản phẩm thỏa A2–A4), luôn đứng SAU
// các gợi ý từ luật và mang source = "fallback".

const { mine } = require("../../src/apps/services/mining");
const { indexSingleItemRules, rankRecommendations } = require("../../src/apps/services/recommendation/ranking");
const { toPlainProduct } = require("../../src/apps/services/recommendation/service");
const { itemCountsOf } = require("../evaluation/recommenders");
const { assertMiningBudget } = require("../evaluation/budget");
const { fitMultilevel, buildModel } = require("../multilevel/recommender");
const { productIdOf } = require("../multilevel/hierarchy");
const C = require("../constraints/recommender");
const { buildBusinessRules } = require("../constraints/business");
const { rankCandidates, diversifiedTopK } = require("./strategies");

const BASES = ["flat", "m2-flat", "m1", "m2-m1"];
const SOURCE_RULE = "association-rule";

/** Ứng viên từ luật một cấp (danh sách đã theo thứ tự website). */
function flatCandidateFn(rules, minConfidence, itemCounts, productsById, allowed) {
    const index = indexSingleItemRules(rules.filter((r) => r.confidence + 1e-12 >= minConfidence && r.lift > 1));
    return (query) => {
        const seen = new Set([query]);
        const out = [];
        for (const r of index.get(query) || []) {
            const q = r.consequent[0];
            const p = productsById.get(q);
            if (seen.has(q) || !p || p.is_stock === false || (allowed && !allowed(query, q))) continue;
            seen.add(q);
            out.push({
                productId: q,
                joint: r.supportCount,
                supX: r.supportCount / r.confidence,
                supQ: itemCounts.get(q) || 0,
                rule: { antecedent: r.antecedent, consequent: r.consequent, type: "level-2", support: r.support, confidence: r.confidence, lift: r.lift, kulczynski: r.kulczynski, imbalanceRatio: r.imbalanceRatio },
                mapped: null,
            });
        }
        return out;
    };
}

/** Ứng viên từ mô hình M1 (đã theo thứ tự policy của M1). */
function multilevelCandidateFn(model, itemCounts) {
    return (query) =>
        model.candidates(query).map((c) => {
            const x = c.rule.antecedent[0];
            const supX = model.supportOf(x);
            return {
                productId: c.productId,
                joint: c.score * supX,
                supX,
                supQ: itemCounts.get(c.productId) || 0,
                rule: { antecedent: c.rule.antecedent.map((n) => productIdOf(n) || n), consequent: c.rule.consequent.map((n) => productIdOf(n) || n), type: c.rule.type, support: c.rule.support, confidence: c.rule.confidence, lift: c.rule.lift },
                mapped: c.mapped,
            };
        });
}

/**
 * Học "nền" một lần trên lịch sử; sau đó buildRanked() tạo nhiều mô hình xếp hạng khác nhau rất rẻ.
 * @param {"flat"|"m2-flat"|"m1"|"m2-m1"} base
 * @param {object} params tham số của nền (đã chọn trên validation ở các bước trước)
 */
function fitBase(base, history, products, params) {
    if (!BASES.includes(base)) throw new RangeError(`Nền không hỗ trợ: ${base}`);
    const itemCounts = itemCountsOf(history);
    const productsById = new Map(products.map(toPlainProduct).map((p) => [p._id, p]));
    const business = base.startsWith("m2") ? buildBusinessRules(products) : null;
    const allowed = business ? (q, id) => business.ruleAllowed(q, id) : null;
    let candidatesOf;
    if (base === "flat") {
        const transactions = history.map((o) => o.items);
        assertMiningBudget(transactions, params.minSupport);
        candidatesOf = flatCandidateFn(mine(transactions, { algorithm: params.algorithm || "fpgrowth", minSupport: params.minSupport, minConfidence: 0 }).rules, params.minConfidence || 0, itemCounts, productsById, null);
    } else if (base === "m2-flat") {
        const fitted = C.fitConstrainedFlat(history, products, { algorithm: params.algorithm || "fpgrowth", minSupport: params.minSupport, mode: "push" });
        candidatesOf = flatCandidateFn(fitted.rules, params.minConfidence || 0, itemCounts, productsById, allowed);
    } else if (base === "m1") {
        const model = buildModel(fitMultilevel(history, products, params), { minConfidence: params.minConfidence, policy: params.policy, fallback: false });
        candidatesOf = multilevelCandidateFn(model, itemCounts);
    } else {
        const model = C.constrainedMultilevelModel(C.fitConstrainedMultilevel(history, products, params, "push"), { minConfidence: params.minConfidence, policy: params.policy, fallback: false });
        candidatesOf = multilevelCandidateFn(model, itemCounts);
    }
    const cache = new Map();
    return {
        base,
        params,
        n: history.length,
        itemCounts,
        productsById,
        allowed,
        categoryOf: (id) => (productsById.get(id) || {}).category_id || null,
        candidatesOf(query) {
            if (!cache.has(query)) cache.set(query, candidatesOf(query));
            return cache.get(query);
        },
    };
}

/**
 * Mô hình gợi ý M3 trên một nền.
 * @param {{strategy?: string, beta?: number, gamma?: number, lambda?: number, k?: number, fallback?: boolean}} rank
 */
function buildRanked(fittedBase, { strategy = "native", beta = 0, gamma = 0, lambda = 1, k = 5, fallback = true } = {}) {
    const { productsById, itemCounts, allowed, categoryOf, n } = fittedBase;
    const cache = new Map();
    function explain(query) {
        if (cache.has(query)) return cache.get(query);
        const ranked = rankCandidates(fittedBase.candidatesOf(query), n, { strategy, beta, gamma });
        const picked = diversifiedTopK(ranked, k, lambda, categoryOf);
        const items = picked.map((c) => ({
            productId: c.productId,
            source: SOURCE_RULE,
            strategy: { name: strategy, beta, gamma, lambda },
            score: c.score,
            nativeRank: c.nativeRank,
            diversityPenalty: c.diversityPenalty,
            measures: c.measures,
            rule: c.rule,
            mapped: c.mapped,
            category: categoryOf(c.productId),
        }));
        if (fallback && items.length < k) {
            const chosen = new Set([query, ...items.map((x) => x.productId)]);
            const pool = new Map([...productsById].filter(([id]) => id === query || (!chosen.has(id) && (!allowed || allowed(query, id)))));
            // Thứ tự fallback của website (cùng danh mục → bán chạy). Khi λ < 1, phần fallback cũng được đa dạng hóa
            // (tham lam như trên, phạt danh mục đã có trong danh sách, kể cả danh mục của các gợi ý từ luật).
            const order = rankRecommendations({ productId: query, ruleIndex: new Map(), productsById: pool, itemCounts }, { limit: lambda === 1 ? k - items.length : pool.size, fallback: true }).items;
            const used = new Set(items.map((x) => x.category));
            const m = order.length;
            const left = order.map((f, rank) => ({ f, rank }));
            while (items.length < k && left.length) {
                let best = 0;
                let bestValue = -Infinity;
                for (let j = 0; j < left.length; j++) {
                    const value = lambda * (1 - left[j].rank / m) - (1 - lambda) * (used.has(categoryOf(left[j].f.productId)) ? 1 : 0);
                    if (value > bestValue + 1e-12) {
                        bestValue = value;
                        best = j;
                    }
                }
                const [{ f }] = left.splice(best, 1);
                const category = categoryOf(f.productId);
                used.add(category);
                items.push({ productId: f.productId, source: f.source, fallbackReason: f.fallbackReason, rule: null, measures: null, category });
            }
        }
        cache.set(query, items);
        return items;
    }
    return {
        params: { base: fittedBase.base, strategy, beta, gamma, lambda, fallback },
        explain,
        recommend: (query) => explain(query).map((x) => ({ productId: x.productId, source: x.source })),
    };
}

/** Factory theo giao diện bộ đánh giá (fit(history, products) -> {recommend}). */
function rankedRecommender({ base, baseParams, rank = {}, k = 5, label, key }) {
    return {
        name: key || `m3-${base}`,
        label: label || `M3 trên ${base} (${JSON.stringify(rank)})`,
        params: { base, baseParams, rank },
        fit: (history, products) => buildRanked(fitBase(base, history, products, baseParams), { ...rank, k }),
    };
}

module.exports = { BASES, SOURCE_RULE, fitBase, buildRanked, rankedRecommender };
