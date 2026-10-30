// Chỉ số đánh giá Top-K.
//   Precision@K = số gợi ý trúng / K           (K cố định; danh sách ngắn hơn K bị tính là thiếu)
//   Recall@K    = số gợi ý trúng / |truth|
//   HitRate@K   = 1 nếu có ít nhất một gợi ý trúng, ngược lại 0
//   Coverage    = số sản phẩm khác nhau từng được gợi ý / số sản phẩm trong danh mục
//   RuleQueryRate = tỷ lệ truy vấn có ít nhất một gợi ý đến từ luật kết hợp (source = association-rule)
// Các chỉ số theo truy vấn được lấy trung bình trên mọi truy vấn.

const { createRandom } = require("../../src/apps/services/mining/synthetic");

const SOURCE_RULE = "association-rule";

function scoreList(recommendedIds, truth, k) {
    const truthSet = new Set(truth);
    const hits = recommendedIds.filter((id) => truthSet.has(id)).length;
    return {
        hits,
        precision: hits / k,
        recall: truth.length ? hits / truth.length : 0,
        hit: hits > 0 ? 1 : 0,
    };
}

/**
 * Chạy một recommender trên toàn bộ truy vấn.
 * @param {{recommend: (query: string) => {productId: string, source: string}[]}} recommender
 * @param {object[]} queries kết quả buildQueries()
 * @param {{k?: number, catalogSize: number}} options
 */
function evaluateRecommender(recommender, queries, { k = 5, catalogSize }) {
    if (!Number.isInteger(k) || k < 1) throw new RangeError("k phải là số nguyên >= 1.");
    if (!Number.isInteger(catalogSize) || catalogSize < 1) throw new RangeError("catalogSize phải là số nguyên >= 1.");

    const perQuery = [];
    const recommendedAnywhere = new Set();
    for (const q of queries) {
        const list = recommender.recommend(q.query).slice(0, k);
        const ids = list.map((x) => x.productId);
        if (new Set(ids).size !== ids.length) throw new Error(`Recommender trả về sản phẩm trùng cho truy vấn ${q.query}.`);
        if (ids.includes(q.query)) throw new Error(`Recommender gợi ý chính sản phẩm đang xem ${q.query}.`);
        ids.forEach((id) => recommendedAnywhere.add(id));
        perQuery.push({
            orderId: q.orderId,
            query: q.query,
            listLength: ids.length,
            ruleItems: list.filter((x) => x.source === SOURCE_RULE).length,
            ...scoreList(ids, q.truth, k),
        });
    }
    return { perQuery, summary: summarize(perQuery, recommendedAnywhere, { k, catalogSize }) };
}

function mean(values) {
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function summarize(perQuery, recommendedAnywhere, { k, catalogSize }) {
    return {
        k,
        queries: perQuery.length,
        orders: new Set(perQuery.map((r) => r.orderId)).size,
        precision: mean(perQuery.map((r) => r.precision)),
        recall: mean(perQuery.map((r) => r.recall)),
        hitRate: mean(perQuery.map((r) => r.hit)),
        coverage: recommendedAnywhere.size / catalogSize,
        recommendedProducts: recommendedAnywhere.size,
        ruleQueryRate: mean(perQuery.map((r) => (r.ruleItems > 0 ? 1 : 0))),
        avgListLength: mean(perQuery.map((r) => r.listLength)),
    };
}

/**
 * Khoảng tin cậy bootstrap theo cụm đơn hàng: các truy vấn sinh từ cùng một đơn không độc lập,
 * nên mỗi lần lặp chọn lại ĐƠN (có hoàn lại) rồi lấy trung bình trên mọi truy vấn của các đơn được chọn.
 */
function bootstrapCI(perQuery, field, { resamples = 1000, seed = 1, level = 0.95 } = {}) {
    const byOrder = new Map();
    for (const r of perQuery) {
        if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, []);
        byOrder.get(r.orderId).push(r[field]);
    }
    const groups = [...byOrder.values()];
    const point = mean(perQuery.map((r) => r[field]));
    if (groups.length === 0) return { mean: 0, low: 0, high: 0 };

    const random = createRandom(seed);
    const estimates = [];
    for (let b = 0; b < resamples; b++) {
        let sum = 0;
        let count = 0;
        for (let g = 0; g < groups.length; g++) {
            const group = groups[Math.floor(random() * groups.length)];
            for (const v of group) sum += v;
            count += group.length;
        }
        estimates.push(sum / count);
    }
    estimates.sort((a, b) => a - b);
    const alpha = (1 - level) / 2;
    const at = (p) => estimates[Math.min(estimates.length - 1, Math.max(0, Math.floor(p * estimates.length)))];
    return { mean: point, low: at(alpha), high: at(1 - alpha) };
}

/**
 * So sánh cặp A − B trên cùng truy vấn, bootstrap theo cụm đơn hàng.
 * Trả về chênh lệch trung bình và khoảng tin cậy; nếu khoảng không chứa 0 thì khác biệt có ý nghĩa ở mức đã chọn.
 */
function pairedBootstrapDiff(perQueryA, perQueryB, field, options = {}) {
    if (perQueryA.length !== perQueryB.length) throw new Error("Hai danh sách phải cùng tập truy vấn.");
    const diffs = perQueryA.map((a, i) => {
        const b = perQueryB[i];
        if (a.orderId !== b.orderId || a.query !== b.query) throw new Error("Truy vấn không khớp thứ tự.");
        return { orderId: a.orderId, diff: a[field] - b[field] };
    });
    return bootstrapCI(diffs, "diff", options);
}

module.exports = { SOURCE_RULE, scoreList, evaluateRecommender, summarize, bootstrapCI, pairedBootstrapDiff, mean };
