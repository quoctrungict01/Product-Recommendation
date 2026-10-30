// M1 — Gợi ý từ luật kết hợp đa mức (chỉ dùng trong module nghiên cứu offline; KHÔNG dùng cho API/website).
//
// Với sản phẩm đang xem p (danh mục C = cha(p)), dùng các luật một-vế-trái-một-vế-phải, lift > 1:
//   (a) {p} ⇒ {q}   sản phẩm ⇒ sản phẩm       (chính là luật của hệ thống hiện tại)
//   (b) {p} ⇒ {D}   sản phẩm ⇒ danh mục       (luật trộn cấp)
//   (c) {C} ⇒ {q}   danh mục ⇒ sản phẩm       (luật trộn cấp)
//   (d) {C} ⇒ {D}   danh mục ⇒ danh mục       (luật cấp 1)
// Luật tầm thường (p ⇒ C, C ⇒ p, ...) đã bị loại khi khai phá, nên D ≠ C và q ∉ C trong (c).
//
// Ánh xạ luật có vế phải là danh mục D về sản phẩm cụ thể q ∈ D:
//     score(q) = conf(X ⇒ D) × w(q | X, D),   w(q | X, D) = sup(X ∪ {q}) / sup(X ∪ {D})
// tức P(q | X, D) ước lượng từ chính các tập phổ biến trộn cấp đã khai phá trên dữ liệu học.
// Nếu X ∪ {q} không phổ biến (X là sản phẩm ít giao dịch), lùi lên cấp trên theo hệ phân cấp:
//     X = p  ->  X = cha(p);  nếu ở cấp danh mục vẫn không phổ biến thì w = 0 (không đủ bằng chứng).
// Khi X ∪ {q} phổ biến, score(q) = sup(X∪{q})/sup(X) = conf(X ⇒ q) — khớp với luật cụ thể tương ứng.
//
// Thứ tự (policy):
//   "specific-first": luật cụ thể hơn trước (số nút cấp sản phẩm trong luật: (a) 2 > (b),(c) 1 > (d) 0),
//                     cùng độ cụ thể thì theo score → lift → support → _id;
//   "score"         : theo score trước, hòa thì độ cụ thể → lift → support → _id.
// Sau đó loại chính p, trùng, hết hàng; nếu chưa đủ K thì dùng ĐÚNG fallback của website
// (rankRecommendations: cùng danh mục → bán chạy), đánh dấu source = "fallback".

const { hierarchyFromCatalog, isProductNode, productIdOf } = require("./hierarchy");
const { mineMultilevel } = require("./mining");
const { rankRecommendations } = require("../../src/apps/services/recommendation/ranking");
const { toPlainProduct } = require("../../src/apps/services/recommendation/service");
const { itemCountsOf } = require("../evaluation/recommenders");

const SOURCE_RULE = "association-rule";
const POLICIES = ["specific-first", "score"];
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Tham số M1 -> tùy chọn của mineMultilevel. categoryMinSupport = productMinSupport nghĩa là uniform support. */
function miningOptionsOf({ algorithm = "fpgrowth", productMinSupport, categoryMinSupport }) {
    const cat = categoryMinSupport ?? productMinSupport;
    if (cat < productMinSupport) throw new RangeError("Ngưỡng cấp danh mục phải ≥ ngưỡng cấp sản phẩm (reduced support: cấp sâu hơn ngưỡng nhỏ hơn).");
    return cat === productMinSupport
        ? { algorithm, strategy: "uniform", minSupport: productMinSupport }
        : { algorithm, strategy: "reduced", levelMinSupport: { 1: cat, 2: productMinSupport } };
}

/**
 * Khai phá đa mức trên lịch sử (chỉ lịch sử được phép học). Tách khỏi buildModel để khi chọn tham số,
 * một lần khai phá dùng được cho nhiều (minConfidence, policy).
 */
function fitMultilevel(history, products, params, { constraintsFor = null, constraintMode = "push" } = {}) {
    const catalog = hierarchyFromCatalog(products);
    const transactions = history.map((o) => o.items);
    // M2 (tùy chọn): ràng buộc tập mục theo các nút của hệ phân cấp, cắt tỉa ("push") hoặc hậu lọc ("post").
    const constraints = constraintsFor ? constraintsFor(catalog) : null;
    // Chỉ cần luật 1 ⇒ 1 cho gợi ý theo một sản phẩm đang xem: sinh luật từ tập ≤ 2 item (kết quả các luật này không đổi).
    const mining = mineMultilevel(transactions, catalog.hierarchy, { ...miningOptionsOf(params), minConfidence: 0, toNode: catalog.toNode, maxRuleItemsetSize: 2, constraints, constraintMode });
    return { catalog, mining, itemCounts: itemCountsOf(history), productsById: new Map(products.map(toPlainProduct).map((p) => [p._id, p])) };
}

function specificityOf(rule) {
    return [...rule.antecedent, ...rule.consequent].filter(isProductNode).length;
}

// Điểm bằng nhau về toán học (vd. conf(p ⇒ q) và conf(p ⇒ D) × w) có thể lệch 1 ulp do làm tròn -> coi là hòa.
const byScore = (a, b) => (Math.abs(b.score - a.score) > 1e-12 ? b.score - a.score : 0);

function compareCandidates(policy) {
    return (a, b) =>
        (policy === "specific-first" ? b.specificity - a.specificity || byScore(a, b) : byScore(a, b) || b.specificity - a.specificity) ||
        b.lift - a.lift ||
        b.support - a.support ||
        byId(a.productId, b.productId);
}

/**
 * @param {ReturnType<typeof fitMultilevel>} fitted
 * @param {{minConfidence?: number, policy?: string, k?: number, fallback?: boolean, minLift?: number}} options
 */
/**
 * candidateFilter(query, productId) / fallbackFilter(query, productId): ràng buộc luật M2-A (tùy chọn; mặc định không lọc).
 */
function buildModel(fitted, { minConfidence = 0, policy = "specific-first", k = 5, fallback = true, minLift = 1, candidateFilter = null, fallbackFilter = null } = {}) {
    if (!POLICIES.includes(policy)) throw new RangeError(`policy không hỗ trợ: ${policy}`);
    const { catalog, mining, itemCounts, productsById } = fitted;
    const { hierarchy } = catalog;
    const sup = (items) => mining.supportCount(items);

    // Chỉ mục luật 1 ⇒ 1 theo vế trái.
    const byAntecedent = new Map();
    let usableRules = 0;
    for (const r of mining.rules) {
        if (r.antecedent.length !== 1 || r.consequent.length !== 1) continue;
        if (!(r.lift > minLift) || r.confidence + 1e-12 < minConfidence) continue;
        usableRules++;
        const key = r.antecedent[0];
        if (!byAntecedent.has(key)) byAntecedent.set(key, []);
        byAntecedent.get(key).push(r);
    }

    const productsOf = new Map(catalog.categoryNodes.map((c) => [c, hierarchy.childrenOf(c)]));
    /**
     * P(q | X, D) với lùi cấp theo hệ phân cấp (X = p -> cha(p)); chỉ dùng tập PHỔ BIẾN đã khai phá.
     * Nếu ở cả cấp danh mục X ∪ {q} cũng không phổ biến thì không có bằng chứng -> w = 0
     * (không lùi lên "toàn bộ", vì như vậy sẽ gợi ý phụ kiện bán chạy nói chung, vd. ốp iPhone cho máy Samsung).
     */
    function weight(x, q, d) {
        for (let ctx = x; ctx; ctx = hierarchy.parentOf(ctx)) {
            const joint = sup([ctx, q]);
            const base = sup([ctx, d]);
            if (joint !== undefined && base) return { w: joint / base, context: ctx };
        }
        return { w: 0, context: null };
    }

    const cache = new Map();
    function ruleCandidates(query) {
        const pNode = catalog.toNode(query);
        if (!hierarchy.has(pNode)) return [];
        const contexts = [pNode, hierarchy.parentOf(pNode)].filter(Boolean);
        const best = new Map();
        const order = compareCandidates(policy);
        const offer = (cand) => {
            const old = best.get(cand.productId);
            if (!old || order(cand, old) < 0) best.set(cand.productId, cand);
        };
        for (const x of contexts) {
            for (const rule of byAntecedent.get(x) || []) {
                const y = rule.consequent[0];
                const specificity = specificityOf(rule);
                const base = { specificity, lift: rule.lift, support: rule.support, rule };
                if (isProductNode(y)) {
                    offer({ ...base, productId: productIdOf(y), score: rule.confidence, mapped: null });
                } else {
                    for (const qNode of productsOf.get(y) || []) {
                        const { w, context } = weight(x, qNode, y);
                        if (w > 0) offer({ ...base, productId: productIdOf(qNode), score: rule.confidence * w, mapped: { category: y, weight: w, context } });
                    }
                }
            }
        }
        return [...best.values()].filter((c) => c.productId !== query).sort(order);
    }

    return {
        stats: { ...mining.stats, usableRules, policy, minConfidence },
        /**
         * Toàn bộ ứng viên từ luật (chưa cắt Top-K), đã bỏ chính sản phẩm đang xem, sản phẩm hết hàng/không tồn tại
         * và ứng viên không qua candidateFilter. Dùng cho bộ xếp hạng lại M3; không ảnh hưởng explain()/recommend().
         */
        candidates(query) {
            return ruleCandidates(query).filter((c) => {
                const p = productsById.get(c.productId);
                return p && p.is_stock !== false && (!candidateFilter || candidateFilter(query, c.productId));
            });
        },
        supportOf: (node) => mining.supportCount([node]),
        transactionCount: mining.transactionCount,
        /** Gợi ý kèm chi tiết luật (dùng để phân tích); recommend() trả về dạng gọn cho bộ đánh giá. */
        explain(query) {
            if (cache.has(query)) return cache.get(query);
            const items = [];
            const chosen = new Set([query]);
            for (const c of ruleCandidates(query)) {
                if (items.length >= k) break;
                const p = productsById.get(c.productId);
                if (!p || p.is_stock === false || chosen.has(c.productId)) continue;
                if (candidateFilter && !candidateFilter(query, c.productId)) continue;
                chosen.add(c.productId);
                items.push({
                    productId: c.productId,
                    source: SOURCE_RULE,
                    level: c.specificity === 2 ? "product" : "hierarchy",
                    score: c.score,
                    rule: { antecedent: c.rule.antecedent, consequent: c.rule.consequent, type: c.rule.type, confidence: c.rule.confidence, lift: c.rule.lift, support: c.rule.support },
                    mapped: c.mapped,
                });
            }
            if (fallback && items.length < k) {
                // Fallback của website; bỏ khỏi danh mục các sản phẩm đã chọn (giữ sản phẩm đang xem để biết danh mục).
                const remaining = new Map([...productsById].filter(([id]) => id === query || (!chosen.has(id) && (!fallbackFilter || fallbackFilter(query, id)))));
                const filled = rankRecommendations({ productId: query, ruleIndex: new Map(), productsById: remaining, itemCounts }, { limit: k - items.length, fallback: true }).items;
                for (const f of filled) items.push({ productId: f.productId, source: f.source, level: null, fallbackReason: f.fallbackReason });
            }
            cache.set(query, items);
            return items;
        },
        recommend(query) {
            return this.explain(query).map((x) => ({ productId: x.productId, source: x.source }));
        },
    };
}

/**
 * Factory cùng giao diện với research/evaluation/recommenders.js: fit(history, products) -> {recommend}.
 * @param {{algorithm?: string, productMinSupport: number, categoryMinSupport?: number, minConfidence?: number,
 *          policy?: string, fallback?: boolean, k?: number, label?: string}} params
 */
function multilevelRecommender(params) {
    const { algorithm = "fpgrowth", productMinSupport, categoryMinSupport = productMinSupport, minConfidence = 0, policy = "specific-first", fallback = true, k = 5, label } = params;
    miningOptionsOf({ algorithm, productMinSupport, categoryMinSupport }); // kiểm tra tham số sớm
    return {
        name: `m1-${algorithm}-${fallback ? "with-fallback" : "rules-only"}`,
        label: label || `M1 đa mức ${algorithm} (sup sản phẩm ${productMinSupport}, sup danh mục ${categoryMinSupport}, conf ${minConfidence}, ${policy})${fallback ? " + fallback" : ", chỉ luật"}`,
        params: { algorithm, productMinSupport, categoryMinSupport, minConfidence, policy, fallback },
        fit(history, products) {
            return buildModel(fitMultilevel(history, products, { algorithm, productMinSupport, categoryMinSupport }), { minConfidence, policy, k, fallback });
        },
    };
}

module.exports = { SOURCE_RULE, POLICIES, miningOptionsOf, fitMultilevel, buildModel, multilevelRecommender };
