// Đánh giá M2 (khai phá có ràng buộc) bằng ĐÚNG giao thức Bước 1–3:
// chia theo thời gian, chọn tham số trên validation (học trên train), học lại trên train ∪ validation, chấm test một lần,
// bootstrap theo cụm đơn hàng. So sánh với hệ thống hiện tại, luật một cấp (validation) và M1 (validation).
// Thêm: mức hợp lý theo nghiệp vụ của danh sách gợi ý (A2–A4) và phép thử cắt tỉa ↔ hậu lọc trên cùng dữ liệu.

const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { temporalSplit, assertNoTemporalLeak, DEFAULT_RATIOS } = require("../evaluation/split");
const { buildQueries, describeQueries } = require("../evaluation/protocol");
const { evaluateRecommender, bootstrapCI, pairedBootstrapDiff, mean } = require("../evaluation/metrics");
const { DEFAULT_GRID, frozenCopy, tuneAssociationRules } = require("../evaluation/runner");
const { associationRuleRecommender } = require("../evaluation/recommenders");
const { rareProductsOf } = require("../evaluation/aggregate");
const { DEFAULTS: WEBSITE_DEFAULTS } = require("../../src/apps/services/recommendation/service");
const { DEFAULT_M1_GRID, supportPairs, tuneMultilevel, subgroupMetrics } = require("../multilevel/evaluate");
const { multilevelRecommender } = require("../multilevel/recommender");
const { buildBusinessRules } = require("./business");
const R = require("./recommender");

const pick = (s) => ({ precision: s.precision, recall: s.recall, hitRate: s.hitRate, coverage: s.coverage, ruleQueryRate: s.ruleQueryRate });
const sortKey = (w) => (a, b) => b.s.recall - a.s.recall || b.s.hitRate - a.s.hitRate || b.s.precision - a.s.precision || w(a, b);

/** Chọn (minSupport, minConfidence) cho M2 trên luật một cấp; mỗi minSupport khai phá một lần (cắt tỉa). */
function tuneConstrainedFlat({ history, products, queries, grid = DEFAULT_GRID, k, catalogSize, observeFit }) {
    const rows = [];
    for (const minSupport of grid.minSupport) {
        if (observeFit) observeFit("tuning", "m2-flat", history);
        const fitted = R.fitConstrainedFlat(history, products, { minSupport, mode: "push" });
        for (const minConfidence of grid.minConfidence) {
            const model = R.constrainedFlatModel(fitted, { minConfidence, k, fallback: true });
            rows.push({ minSupport, minConfidence, s: evaluateRecommender(model, queries, { k, catalogSize }).summary });
        }
    }
    const best = [...rows].sort(sortKey((a, b) => b.minSupport - a.minSupport || b.minConfidence - a.minConfidence))[0];
    return { selected: { minSupport: best.minSupport, minConfidence: best.minConfidence }, onGridEdge: best.minSupport === Math.min(...grid.minSupport) ? ["minSupport ở giá trị nhỏ nhất của lưới"] : [], rows: rows.map((r) => ({ minSupport: r.minSupport, minConfidence: r.minConfidence, ...pick(r.s) })) };
}

/** Chọn tham số cho M2 + M1 trên validation (cùng lưới và tiêu chí với M1). */
function tuneConstrainedMultilevel({ history, products, queries, grid = DEFAULT_M1_GRID, k, catalogSize, observeFit, onProgress }) {
    const rows = [];
    const pairs = supportPairs(grid);
    pairs.forEach((pair, i) => {
        if (onProgress && i % 10 === 0) onProgress(`M2 + M1: chọn tham số trên validation ${i}/${pairs.length} cặp ngưỡng`);
        if (observeFit) observeFit("tuning", "m2-m1", history);
        const fitted = R.fitConstrainedMultilevel(history, products, pair, "push");
        for (const minConfidence of grid.minConfidence) {
            for (const policy of grid.policy) {
                const model = R.constrainedMultilevelModel(fitted, { minConfidence, policy, k, fallback: true });
                rows.push({ ...pair, minConfidence, policy, s: evaluateRecommender(model, queries, { k, catalogSize }).summary });
            }
        }
    });
    const best = [...rows].sort(sortKey((a, b) => b.productMinSupport - a.productMinSupport || b.categoryMinSupport - a.categoryMinSupport || b.minConfidence - a.minConfidence || grid.policy.indexOf(a.policy) - grid.policy.indexOf(b.policy)))[0];
    return {
        selected: { productMinSupport: best.productMinSupport, categoryMinSupport: best.categoryMinSupport, minConfidence: best.minConfidence, policy: best.policy },
        onGridEdge: best.productMinSupport === Math.min(...grid.productMinSupport) ? ["sup sản phẩm ở giá trị nhỏ nhất của lưới"] : [],
        rows: rows.map((r) => ({ productMinSupport: r.productMinSupport, categoryMinSupport: r.categoryMinSupport, minConfidence: r.minConfidence, policy: r.policy, ...pick(r.s) })),
    };
}

/** Chấm một phương pháp trên test; thêm mức hợp lý nghiệp vụ theo truy vấn. */
function evaluateMethod(key, factory, history, products, queries, { k, catalogSize, bootstrap, seed, rare, business, observeFit }) {
    if (observeFit) observeFit("final", factory.name, history);
    const t0 = performance.now();
    const model = factory.fit(history, products);
    const fitMs = performance.now() - t0;
    const { perQuery, summary } = evaluateRecommender(model, queries, { k, catalogSize });
    const violations = {};
    queries.forEach((q, i) => {
        const ids = model.recommend(q.query).slice(0, k).map((x) => x.productId);
        const bad = ids.map((id) => business.violation(q.query, id)).filter(Boolean);
        bad.forEach((v) => (violations[v] = (violations[v] || 0) + 1));
        Object.assign(perQuery[i], { ids, hierarchyItems: 0, plausible: ids.length ? (ids.length - bad.length) / ids.length : 1, allPlausible: bad.length ? 0 : 1 });
    });
    const totalItems = perQuery.reduce((s, r) => s + r.ids.length, 0);
    summary.plausibleItemRate = totalItems ? 1 - Object.values(violations).reduce((s, v) => s + v, 0) / totalItems : 1;
    summary.allPlausibleQueryRate = mean(perQuery.map((r) => r.allPlausible));
    const ci = {};
    for (const field of ["precision", "recall", "hit", "plausible"]) ci[field] = bootstrapCI(perQuery, field, { resamples: bootstrap, seed });
    const rarePQ = perQuery.filter((r) => rare.has(r.query));
    const recommendedAnywhere = new Set(perQuery.flatMap((r) => r.ids));
    const rareSummary = {
        ...subgroupMetrics(rarePQ, catalogSize),
        plausibleItemRate: rarePQ.length ? mean(rarePQ.map((r) => r.plausible)) : null,
        ci: rarePQ.length ? { recall: bootstrapCI(rarePQ, "recall", { resamples: bootstrap, seed }), hit: bootstrapCI(rarePQ, "hit", { resamples: bootstrap, seed }) } : null,
        rareProductsRecommended: rare.size ? [...rare].filter((id) => recommendedAnywhere.has(id)).length / rare.size : null,
    };
    return { key, name: factory.name, label: factory.label, params: factory.params || null, fitMs, summary, ci, rare: rareSummary, violations, perQuery };
}

const listsOf = (model, queries) => queries.map((q) => model.recommend(q.query).map((x) => `${x.productId}:${x.source}`).join(","));
const sha = (x) => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex");

/**
 * Phép thử M2-B: cùng giao dịch, cùng ngưỡng, cùng ràng buộc; "push" (cắt tỉa) vs "post" (hậu lọc), Apriori và FP-Growth.
 * Kết quả tập mục và danh sách gợi ý phải giống hệt; đo thời gian khai phá (trung vị) và số candidate.
 */
function pushVsPost({ history, products, queries, flatParams, m1Params, k, timingRuns = 5 }) {
    const out = { flat: {}, multilevel: {} };
    for (const algorithm of ["apriori", "fpgrowth"]) {
        for (const mode of ["push", "post"]) {
            // luật một cấp
            let fitted;
            const t = [];
            for (let i = 0; i < timingRuns; i++) {
                fitted = R.fitConstrainedFlat(history, products, { algorithm, minSupport: flatParams.minSupport, mode });
                t.push(fitted.stats.miningMs);
            }
            t.sort((a, b) => a - b);
            const model = R.constrainedFlatModel(fitted, { minConfidence: flatParams.minConfidence, k });
            out.flat[`${algorithm}-${mode}`] = { itemsetsSha: sha(fitted.itemsets), itemsets: fitted.itemsets.length, rules: fitted.rules.length, listsSha: sha(listsOf(model, queries)), medianMiningMs: t[Math.floor(t.length / 2)], stats: summarizeAlgStats(fitted.stats.algorithmStats) };
            // M1 + M2
            let fm;
            const t2 = [];
            for (let i = 0; i < timingRuns; i++) {
                fm = R.fitConstrainedMultilevel(history, products, { algorithm, productMinSupport: m1Params.productMinSupport, categoryMinSupport: m1Params.categoryMinSupport }, mode);
                t2.push(fm.fitted.mining.stats.miningMs);
            }
            t2.sort((a, b) => a - b);
            const mm = R.constrainedMultilevelModel(fm, { minConfidence: m1Params.minConfidence, policy: m1Params.policy, k });
            out.multilevel[`${algorithm}-${mode}`] = { itemsetsSha: sha(fm.fitted.mining.itemsets), itemsets: fm.fitted.mining.itemsets.length, rules: fm.fitted.mining.rules.length, listsSha: sha(listsOf(mm, queries)), medianMiningMs: t2[Math.floor(t2.length / 2)], stats: summarizeAlgStats(fm.fitted.mining.stats.algorithmStats) };
        }
    }
    const same = (part) => new Set(Object.values(out[part]).map((x) => `${x.itemsetsSha}|${x.listsSha}`)).size === 1;
    return { identical: { flat: same("flat"), multilevel: same("multilevel") }, results: out, timingRuns };
}

function summarizeAlgStats(s) {
    return {
        totalCandidates: s.totalCandidates ?? null,
        candidatesGenerated: s.candidatesGenerated ?? null,
        prunedByConstraint: s.prunedByConstraint ?? null,
        conditionalTrees: s.conditionalTrees ?? null,
        prunedPatterns: s.prunedPatterns ?? null,
        prunedBaseItems: s.prunedBaseItems ?? null,
    };
}

/**
 * @param {{name: string, products: object[], orders: object[]}} dataset
 */
function runConstraintEvaluation(dataset, options = {}) {
    const { k = 5, ratios = DEFAULT_RATIOS, grid = DEFAULT_GRID, m1Grid = DEFAULT_M1_GRID, bootstrap = 1000, bootstrapSeed = 20261026, rareThreshold = 0.005, observeFit, onProgress } = options;
    const products = dataset.products;
    const catalogSize = products.length;
    const business = buildBusinessRules(products);

    const split = temporalSplit(dataset.orders, ratios);
    const tuningHistory = frozenCopy(split.train);
    const finalHistory = frozenCopy([...split.train, ...split.validation]);
    assertNoTemporalLeak(tuningHistory, split.validation);
    assertNoTemporalLeak(finalHistory, split.test);
    const validationQueries = buildQueries(split.validation);
    const testQueries = buildQueries(split.test);
    const rare = rareProductsOf(dataset, { ratios, rareThreshold });

    const common = { history: tuningHistory, products, queries: validationQueries, k, catalogSize, observeFit };
    if (onProgress) onProgress("chọn tham số trên validation: luật một cấp, M1, M2 một cấp");
    const flatTuning = tuneAssociationRules({ ...common, grid });
    const m1Tuning = tuneMultilevel({ ...common, grid: m1Grid });
    const m2FlatTuning = tuneConstrainedFlat({ ...common, grid });
    const m2M1Tuning = tuneConstrainedMultilevel({ ...common, grid: m1Grid, onProgress });

    if (onProgress) onProgress(`chấm 7 phương pháp trên ${testQueries.length} truy vấn test`);
    const website = { minSupport: WEBSITE_DEFAULTS.minSupport, minConfidence: WEBSITE_DEFAULTS.minConfidence };
    const methods = [
        ["current-with-fallback", associationRuleRecommender({ ...website, fallback: true, k, label: "Hệ thống hiện tại – luật + fallback" })],
        ["tuned-with-fallback", associationRuleRecommender({ ...flatTuning.selected, fallback: true, k, label: "Luật một cấp + fallback (validation)" })],
        ["m1-with-fallback", multilevelRecommender({ ...m1Tuning.selected, fallback: true, k, label: "M1 + fallback (validation)" })],
        ["m2-flat-rules-only", R.constrainedFlatRecommender({ ...m2FlatTuning.selected, fallback: false, k, label: "M2 một cấp – chỉ luật (validation)" })],
        ["m2-flat-with-fallback", R.constrainedFlatRecommender({ ...m2FlatTuning.selected, fallback: true, k, label: "M2 một cấp + fallback có ràng buộc (validation)" })],
        ["m2-m1-rules-only", R.constrainedMultilevelRecommender({ ...m2M1Tuning.selected, fallback: false, k, label: "M2 + M1 – chỉ luật (validation)" })],
        ["m2-m1-with-fallback", R.constrainedMultilevelRecommender({ ...m2M1Tuning.selected, fallback: true, k, label: "M2 + M1 + fallback có ràng buộc (validation)" })],
    ];
    const evalOptions = { k, catalogSize, bootstrap, seed: bootstrapSeed, rare: rare.rare, business, observeFit };
    const results = methods.map(([key, f]) => evaluateMethod(key, f, finalHistory, products, testQueries, evalOptions));
    const get = (key) => results.find((r) => r.key === key);

    const pairKeys = [
        ["m2-flat-with-fallback", "tuned-with-fallback"],
        ["m2-m1-with-fallback", "m1-with-fallback"],
        ["m2-m1-with-fallback", "tuned-with-fallback"],
        ["m2-flat-with-fallback", "current-with-fallback"],
    ];
    const paired = (a, b, filter) => {
        const A = get(a).perQuery.filter(filter);
        const B = get(b).perQuery.filter(filter);
        if (!A.length) return null;
        const o = { queries: A.length };
        for (const f of ["recall", "hit", "precision", "plausible"]) o[f] = pairedBootstrapDiff(A, B, f, { resamples: bootstrap, seed: bootstrapSeed });
        return o;
    };
    const comparisons = pairKeys.map(([a, b]) => ({ a, b, all: paired(a, b, () => true), rare: paired(a, b, (r) => rare.rare.has(r.query)) }));

    if (onProgress) onProgress("M2-B: cắt tỉa ↔ hậu lọc (Apriori, FP-Growth) trên train ∪ validation");
    const constraintCheck = pushVsPost({ history: finalHistory, products, queries: [...validationQueries, ...testQueries], flatParams: m2FlatTuning.selected, m1Params: m2M1Tuning.selected, k });

    return {
        dataset: { name: dataset.name, generatorVersion: dataset.generatorVersion || null, profile: dataset.profile || null, seed: dataset.seed, checksum: dataset.checksum, orders: dataset.orders.length, products: catalogSize },
        settings: { k, ratios, grid, m1Grid, bootstrap, bootstrapSeed, rareThreshold, websiteDefaults: website },
        split: { train: describeQueries(split.train, buildQueries(split.train)), validation: describeQueries(split.validation, validationQueries), test: describeQueries(split.test, testQueries) },
        rare: { products: [...rare.rare].sort(), count: rare.rare.size, limit: rare.limit },
        tuning: {
            flat: { selected: flatTuning.selected, onGridEdge: flatTuning.selectedOnGridEdge },
            m1: { selected: m1Tuning.selected, onGridEdge: m1Tuning.selectedOnGridEdge },
            m2Flat: { selected: m2FlatTuning.selected, onGridEdge: m2FlatTuning.onGridEdge },
            m2M1: { selected: m2M1Tuning.selected, onGridEdge: m2M1Tuning.onGridEdge },
        },
        results: results.map(({ perQuery, ...rest }) => rest),
        comparisons,
        constraintCheck,
        perQuery: Object.fromEntries(results.map((r) => [r.key, r.perQuery])),
    };
}

module.exports = { tuneConstrainedFlat, tuneConstrainedMultilevel, pushVsPost, runConstraintEvaluation };
