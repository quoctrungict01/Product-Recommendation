// Đánh giá M1 (luật kết hợp đa mức) bằng ĐÚNG giao thức của Bước 1–2:
//  1. Chia theo thời gian train | validation | test (split.js), kiểm tra rò rỉ.
//  2. Chọn tham số trên VALIDATION (học trên train): cả luật một cấp (tuneAssociationRules, như Bước 1–2)
//     và M1 (lưới riêng: sup sản phẩm × sup danh mục × conf × policy). Test không được dùng.
//  3. Học lại trên train ∪ validation, chấm MỘT LẦN trên test; KTC bootstrap theo cụm đơn hàng.
//  4. Nhóm sản phẩm ít giao dịch (xác định chỉ từ lịch sử) được báo cáo riêng.
//  5. Apriori và FP-Growth phải cho cùng gợi ý M1.

const { performance } = require("perf_hooks");
const { temporalSplit, assertNoTemporalLeak, DEFAULT_RATIOS } = require("../evaluation/split");
const { buildQueries, describeQueries } = require("../evaluation/protocol");
const { evaluateRecommender, bootstrapCI, pairedBootstrapDiff, mean } = require("../evaluation/metrics");
const { DEFAULT_GRID, frozenCopy, tuneAssociationRules } = require("../evaluation/runner");
const { categoryBasedRecommender, associationRuleRecommender } = require("../evaluation/recommenders");
const { rareProductsOf } = require("../evaluation/aggregate");
const { DEFAULTS: WEBSITE_DEFAULTS } = require("../../src/apps/services/recommendation/service");
const { POLICIES, fitMultilevel, buildModel, multilevelRecommender } = require("./recommender");
const { findRedundantRules } = require("./mining");

const M1_CATEGORY_SUPPORT = [0.01, 0.02, 0.05, 0.1];
const DEFAULT_M1_GRID = Object.freeze({
    productMinSupport: DEFAULT_GRID.minSupport,
    // null = bằng ngưỡng sản phẩm (uniform support); các giá trị khác ≥ ngưỡng sản phẩm (reduced support).
    categoryMinSupport: [null, ...M1_CATEGORY_SUPPORT],
    minConfidence: DEFAULT_GRID.minConfidence,
    policy: POLICIES,
});

const pick = (s) => ({ precision: s.precision, recall: s.recall, hitRate: s.hitRate, coverage: s.coverage, ruleQueryRate: s.ruleQueryRate });

/** Cặp (sup sản phẩm, sup danh mục) hợp lệ của lưới: sup danh mục ≥ sup sản phẩm, không trùng. */
function supportPairs(grid) {
    const pairs = [];
    for (const ps of grid.productMinSupport) {
        const seen = new Set();
        for (const c of grid.categoryMinSupport) {
            const cs = c === null ? ps : c;
            if (cs < ps || seen.has(cs)) continue;
            seen.add(cs);
            pairs.push({ productMinSupport: ps, categoryMinSupport: cs });
        }
    }
    return pairs;
}

/**
 * Chọn tham số M1: Recall@K của M1 + fallback trên validation cao nhất; hòa thì HitRate, Precision,
 * rồi ngưỡng sản phẩm lớn hơn, ngưỡng danh mục lớn hơn, confidence lớn hơn, policy "specific-first".
 * Mỗi cặp ngưỡng khai phá MỘT lần (minConfidence chỉ lọc luật, nên kết quả giống hệt khai phá lại).
 */
function tuneMultilevel({ history, products, queries, grid = DEFAULT_M1_GRID, k, catalogSize, algorithm = "fpgrowth", observeFit, onProgress }) {
    const rows = [];
    const pairs = supportPairs(grid);
    pairs.forEach((pair, i) => {
        if (onProgress && i % 5 === 0) onProgress(`M1: chọn tham số trên validation ${i}/${pairs.length} cặp ngưỡng`);
        if (observeFit) observeFit("tuning", "m1", history);
        const fitted = fitMultilevel(history, products, { algorithm, ...pair });
        for (const minConfidence of grid.minConfidence) {
            for (const policy of grid.policy) {
                const model = buildModel(fitted, { minConfidence, policy, k, fallback: true });
                rows.push({ ...pair, minConfidence, policy, usableRules: model.stats.usableRules, withFallback: evaluateRecommender(model, queries, { k, catalogSize }).summary });
            }
        }
    });
    const policyRank = (p) => grid.policy.indexOf(p);
    const ranked = [...rows].sort(
        (a, b) =>
            b.withFallback.recall - a.withFallback.recall ||
            b.withFallback.hitRate - a.withFallback.hitRate ||
            b.withFallback.precision - a.withFallback.precision ||
            b.productMinSupport - a.productMinSupport ||
            b.categoryMinSupport - a.categoryMinSupport ||
            b.minConfidence - a.minConfidence ||
            policyRank(a.policy) - policyRank(b.policy)
    );
    const best = ranked[0];
    const edge = [];
    const ps = grid.productMinSupport;
    if (best.productMinSupport === Math.min(...ps)) edge.push("sup sản phẩm ở giá trị nhỏ nhất của lưới");
    if (best.productMinSupport === Math.max(...ps)) edge.push("sup sản phẩm ở giá trị lớn nhất của lưới");
    if (best.categoryMinSupport === Math.max(...M1_CATEGORY_SUPPORT)) edge.push("sup danh mục ở giá trị lớn nhất của lưới");
    if (best.minConfidence === Math.min(...grid.minConfidence)) edge.push("minConfidence ở giá trị nhỏ nhất của lưới");
    if (best.minConfidence === Math.max(...grid.minConfidence)) edge.push("minConfidence ở giá trị lớn nhất của lưới");
    const selected = { productMinSupport: best.productMinSupport, categoryMinSupport: best.categoryMinSupport, minConfidence: best.minConfidence, policy: best.policy };
    return {
        objective: "Recall@K của M1 + fallback trên validation (hòa: HitRate, Precision, ngưỡng lớn hơn, policy specific-first)",
        configurations: rows.length,
        miningRuns: pairs.length,
        selected,
        strategy: selected.categoryMinSupport === selected.productMinSupport ? "uniform" : "reduced",
        selectedOnGridEdge: edge,
        top5: ranked.slice(0, 5).map((r) => ({ productMinSupport: r.productMinSupport, categoryMinSupport: r.categoryMinSupport, minConfidence: r.minConfidence, policy: r.policy, ...pick(r.withFallback) })),
        rows: rows.map((r) => ({ productMinSupport: r.productMinSupport, categoryMinSupport: r.categoryMinSupport, minConfidence: r.minConfidence, policy: r.policy, usableRules: r.usableRules, ...pick(r.withFallback) })),
    };
}

/** Chỉ số của một nhóm truy vấn con (vd. sản phẩm đang xem là sản phẩm ít giao dịch). */
function subgroupMetrics(perQuery, catalogSize) {
    if (!perQuery.length) return { queries: 0, orders: 0, precision: null, recall: null, hitRate: null, ruleQueryRate: null, hierarchyRuleQueryRate: null, coverage: null };
    return {
        queries: perQuery.length,
        orders: new Set(perQuery.map((r) => r.orderId)).size,
        precision: mean(perQuery.map((r) => r.precision)),
        recall: mean(perQuery.map((r) => r.recall)),
        hitRate: mean(perQuery.map((r) => r.hit)),
        ruleQueryRate: mean(perQuery.map((r) => (r.ruleItems > 0 ? 1 : 0))),
        hierarchyRuleQueryRate: mean(perQuery.map((r) => (r.hierarchyItems > 0 ? 1 : 0))),
        // Coverage trong nhóm: số sản phẩm khác nhau xuất hiện trong danh sách gợi ý của nhóm / số sản phẩm của danh mục.
        coverage: new Set(perQuery.flatMap((r) => r.ids)).size / catalogSize,
    };
}

function evaluateMethod(key, factory, history, products, queries, { k, catalogSize, bootstrap, seed, rare, observeFit }) {
    if (observeFit) observeFit("final", factory.name, history);
    const t0 = performance.now();
    const model = factory.fit(history, products);
    const fitMs = performance.now() - t0;
    const { perQuery, summary } = evaluateRecommender(model, queries, { k, catalogSize });
    // Bổ sung danh sách id và số gợi ý từ luật có nút danh mục (chỉ M1 có), để phân tích nhóm hiếm.
    queries.forEach((q, i) => {
        const list = model.explain ? model.explain(q.query).slice(0, k) : model.recommend(q.query).slice(0, k);
        perQuery[i].ids = list.map((x) => x.productId);
        perQuery[i].hierarchyItems = list.filter((x) => x.level === "hierarchy").length;
    });
    summary.hierarchyRuleQueryRate = mean(perQuery.map((r) => (r.hierarchyItems > 0 ? 1 : 0)));
    const ci = {};
    for (const field of ["precision", "recall", "hit"]) ci[field] = bootstrapCI(perQuery, field, { resamples: bootstrap, seed });
    const rarePerQuery = perQuery.filter((r) => rare.has(r.query));
    const rareTargets = [...rare];
    const recommendedAnywhere = new Set(perQuery.flatMap((r) => r.ids));
    const rareSummary = {
        ...subgroupMetrics(rarePerQuery, catalogSize),
        ci: rarePerQuery.length ? { recall: bootstrapCI(rarePerQuery, "recall", { resamples: bootstrap, seed }), hit: bootstrapCI(rarePerQuery, "hit", { resamples: bootstrap, seed }) } : null,
        // Tỷ lệ sản phẩm hiếm từng được gợi ý (ở bất kỳ truy vấn test nào) — chúng có được "nhìn thấy" không.
        rareProductsRecommended: rareTargets.length ? rareTargets.filter((id) => recommendedAnywhere.has(id)).length / rareTargets.length : null,
    };
    return { key, name: factory.name, label: factory.label, params: factory.params || null, fitMs, modelStats: model.stats || null, summary, ci, rare: rareSummary, perQuery };
}

/** Apriori và FP-Growth phải cho cùng gợi ý M1 cho mọi truy vấn (cùng giao dịch, cùng ngưỡng). */
function compareM1Algorithms({ history, products, queries, params, k, timingRuns = 5 }) {
    const lists = {};
    const timings = {};
    const ruleKeys = {};
    for (const algorithm of ["apriori", "fpgrowth"]) {
        const times = [];
        let fitted;
        for (let i = 0; i < timingRuns; i++) {
            const t0 = performance.now();
            fitted = fitMultilevel(history, products, { algorithm, ...params });
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        const model = buildModel(fitted, { minConfidence: params.minConfidence, policy: params.policy, k, fallback: true });
        timings[algorithm] = { medianFitMs: times[Math.floor(times.length / 2)], itemsets: fitted.mining.itemsets.length, rules: fitted.mining.rules.length };
        ruleKeys[algorithm] = fitted.mining.rules.map((r) => `${r.antecedent}=>${r.consequent}:${r.supportCount}`).sort().join("|");
        lists[algorithm] = queries.map((q) => model.recommend(q.query).map((x) => `${x.productId}:${x.source}`).join(","));
    }
    const mismatches = queries.filter((_, i) => lists.apriori[i] !== lists.fpgrowth[i]).length;
    return { params, queries: queries.length, identical: mismatches === 0 && ruleKeys.apriori === ruleKeys.fpgrowth, rulesIdentical: ruleKeys.apriori === ruleKeys.fpgrowth, mismatches, timings, timingRuns };
}

/**
 * @param {{name: string, products: object[], orders: object[]}} dataset
 * @param {{k?: number, ratios?: object, grid?: object, m1Grid?: object, bootstrap?: number, bootstrapSeed?: number,
 *          rareThreshold?: number, observeFit?: Function, onProgress?: Function}} options
 */
function runMultilevelEvaluation(dataset, options = {}) {
    const { k = 5, ratios = DEFAULT_RATIOS, grid = DEFAULT_GRID, m1Grid = DEFAULT_M1_GRID, bootstrap = 1000, bootstrapSeed = 20261026, rareThreshold = 0.005, observeFit, onProgress } = options;
    const products = dataset.products;
    const catalogSize = products.length;

    const split = temporalSplit(dataset.orders, ratios);
    const tuningHistory = frozenCopy(split.train);
    const finalHistory = frozenCopy([...split.train, ...split.validation]);
    assertNoTemporalLeak(tuningHistory, split.validation);
    assertNoTemporalLeak(finalHistory, split.test);
    const validationQueries = buildQueries(split.validation);
    const testQueries = buildQueries(split.test);
    // Sản phẩm ít giao dịch: chỉ đếm trên lịch sử (train ∪ validation), không dùng test.
    const rare = rareProductsOf(dataset, { ratios, rareThreshold });

    // Chọn tham số trên validation.
    if (onProgress) onProgress("luật một cấp: chọn tham số trên validation");
    const flatTuning = tuneAssociationRules({ history: tuningHistory, products, queries: validationQueries, grid, k, catalogSize, observeFit: observeFit && ((phase, name, h) => observeFit(phase, name, h)) });
    const m1Tuning = tuneMultilevel({ history: tuningHistory, products, queries: validationQueries, grid: m1Grid, k, catalogSize, observeFit, onProgress });

    // Chấm trên test.
    if (onProgress) onProgress(`chấm 9 phương pháp trên ${testQueries.length} truy vấn test`);
    const website = { minSupport: WEBSITE_DEFAULTS.minSupport, minConfidence: WEBSITE_DEFAULTS.minConfidence };
    const m1Website = { productMinSupport: website.minSupport, categoryMinSupport: website.minSupport, minConfidence: website.minConfidence, policy: "specific-first" };
    const sel = m1Tuning.selected;
    const methods = [
        ["category-based", categoryBasedRecommender({ k })],
        ["current-rules-only", associationRuleRecommender({ ...website, fallback: false, k, label: `Hệ thống hiện tại – chỉ luật (sup ${website.minSupport}, conf ${website.minConfidence})` })],
        ["current-with-fallback", associationRuleRecommender({ ...website, fallback: true, k, label: "Hệ thống hiện tại – luật + fallback" })],
        ["tuned-rules-only", associationRuleRecommender({ ...flatTuning.selected, fallback: false, k, label: "Luật một cấp – chỉ luật (tham số validation)" })],
        ["tuned-with-fallback", associationRuleRecommender({ ...flatTuning.selected, fallback: true, k, label: "Luật một cấp + fallback (tham số validation)" })],
        ["m1-website-rules-only", multilevelRecommender({ ...m1Website, fallback: false, k, label: `M1 – chỉ luật (tham số website, uniform ${website.minSupport})` })],
        ["m1-website-with-fallback", multilevelRecommender({ ...m1Website, fallback: true, k, label: "M1 + fallback (tham số website, uniform)" })],
        ["m1-rules-only", multilevelRecommender({ ...sel, fallback: false, k, label: "M1 – chỉ luật (tham số validation)" })],
        ["m1-with-fallback", multilevelRecommender({ ...sel, fallback: true, k, label: "M1 + fallback (tham số validation)" })],
    ];
    const evalOptions = { k, catalogSize, bootstrap, seed: bootstrapSeed, rare: rare.rare, observeFit };
    const results = methods.map(([key, f]) => evaluateMethod(key, f, finalHistory, products, testQueries, evalOptions));
    const get = (key) => results.find((r) => r.key === key);

    // So sánh cặp trên cùng truy vấn, bootstrap theo cụm đơn hàng (toàn bộ và nhóm hiếm).
    const pairKeys = [
        ["m1-with-fallback", "current-with-fallback"],
        ["m1-with-fallback", "tuned-with-fallback"],
        ["m1-website-with-fallback", "current-with-fallback"],
        ["m1-rules-only", "tuned-rules-only"],
    ];
    const paired = (a, b, filter) => {
        const A = get(a).perQuery.filter(filter);
        const B = get(b).perQuery.filter(filter);
        if (!A.length) return null;
        return {
            queries: A.length,
            recall: pairedBootstrapDiff(A, B, "recall", { resamples: bootstrap, seed: bootstrapSeed }),
            hit: pairedBootstrapDiff(A, B, "hit", { resamples: bootstrap, seed: bootstrapSeed }),
        };
    };
    const comparisons = pairKeys.map(([a, b]) => ({ a, b, all: paired(a, b, () => true), rare: paired(a, b, (r) => rare.rare.has(r.query)) }));

    if (onProgress) onProgress("M1: kiểm tra Apriori = FP-Growth trên mọi truy vấn validation + test");
    const allQueries = [...validationQueries, ...testQueries];
    const algorithmCheck = [m1Website, sel].map((params) => compareM1Algorithms({ history: finalHistory, products, queries: allQueries, params, k }));

    // Thống kê khai phá M1 (tham số đã chọn, học trên train ∪ validation) và luật dư thừa theo Ví dụ 7.2.
    const fitted = fitMultilevel(finalHistory, products, sel);
    const model = buildModel(fitted, { minConfidence: sel.minConfidence, policy: sel.policy, k });
    const usable = fitted.mining.rules.filter((r) => r.lift > 1 && r.confidence + 1e-12 >= sel.minConfidence);
    const redundant = findRedundantRules(usable, fitted.catalog.hierarchy, fitted.mining.supportCount, { tolerance: 0.1 });
    const flatFitted = associationRuleRecommender({ ...flatTuning.selected, fallback: true, k }).fit(finalHistory, products);
    const miningStats = {
        selected: sel,
        thresholds: fitted.mining.thresholds,
        stats: { ...fitted.mining.stats, budget: undefined, algorithmStats: undefined },
        usableRules: model.stats.usableRules,
        usableByType: usable.reduce((o, r) => ((o[r.type] = (o[r.type] || 0) + 1), o), {}),
        redundantRules: redundant.length,
        redundantExamples: redundant.slice(0, 3).map((r) => ({ rule: `${r.rule.antecedent} ⇒ ${r.rule.consequent}`, ancestor: `${r.ancestor.antecedent} ⇒ ${r.ancestor.consequent}`, support: r.rule.support, expectedSupport: r.expectedSupport, confidence: r.rule.confidence, expectedConfidence: r.expectedConfidence })),
        flatRuleCount: flatFitted.stats.ruleCount,
    };

    return {
        dataset: { name: dataset.name, generatorVersion: dataset.generatorVersion || null, profile: dataset.profile || null, seed: dataset.seed, checksum: dataset.checksum, orders: dataset.orders.length, products: catalogSize },
        settings: { k, ratios, grid, m1Grid, bootstrap, bootstrapSeed, rareThreshold, websiteDefaults: website },
        split: {
            train: describeQueries(split.train, buildQueries(split.train)),
            validation: describeQueries(split.validation, validationQueries),
            test: describeQueries(split.test, testQueries),
        },
        rare: { products: [...rare.rare].sort(), count: rare.rare.size, limit: rare.limit, historyOrders: rare.historyOrders },
        tuning: { flat: { selected: flatTuning.selected, selectedOnGridEdge: flatTuning.selectedOnGridEdge }, m1: m1Tuning },
        results: results.map(({ perQuery, ...rest }) => rest),
        comparisons,
        algorithmCheck,
        miningStats,
        perQuery: Object.fromEntries(results.map((r) => [r.key, r.perQuery])),
    };
}

module.exports = { DEFAULT_M1_GRID, supportPairs, tuneMultilevel, subgroupMetrics, compareM1Algorithms, runMultilevelEvaluation };
