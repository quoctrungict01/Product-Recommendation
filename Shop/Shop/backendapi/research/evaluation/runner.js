// Điều phối thí nghiệm Bước 1:
//  1. Chia theo thời gian: train | validation | test.
//  2. Chọn tham số luật kết hợp: học trên TRAIN, chấm trên VALIDATION (không đụng test).
//  3. Học lại mọi phương pháp trên TRAIN ∪ VALIDATION (đều xảy ra trước test), chấm MỘT LẦN trên TEST.
//  4. Kiểm tra Apriori và FP-Growth cho cùng danh sách gợi ý; đo thời gian khai phá (tham khảo).

const { performance } = require("perf_hooks");
const { temporalSplit, assertNoTemporalLeak, DEFAULT_RATIOS } = require("./split");
const { buildQueries, describeQueries } = require("./protocol");
const { evaluateRecommender, bootstrapCI, pairedBootstrapDiff } = require("./metrics");
const {
    randomRecommender,
    mostPopularRecommender,
    categoryBasedRecommender,
    cooccurrenceRecommender,
    associationRuleRecommender,
} = require("./recommenders");
const { DEFAULTS: WEBSITE_DEFAULTS } = require("../../src/apps/services/recommendation/service");

// minSupport thấp nhất = giới hạn dưới mà API website cho phép (LIMITS.minSupport[0] = 0.002).
const DEFAULT_GRID = Object.freeze({
    minSupport: [0.002, 0.003, 0.005, 0.01, 0.015, 0.02, 0.03],
    minConfidence: [0, 0.05, 0.1, 0.2, 0.3, 0.4],
});

const pick = (s) => ({ precision: s.precision, recall: s.recall, hitRate: s.hitRate, coverage: s.coverage, ruleQueryRate: s.ruleQueryRate });

/**
 * Bọc factory để báo cho `observeFit(phase, history)` mỗi lần phương pháp học.
 * Dùng trong test để chứng minh không phương pháp nào học từ đơn đánh giá.
 */
function observed(factory, phase, observeFit) {
    if (!observeFit) return factory;
    return { ...factory, fit: (history, products) => (observeFit(phase, factory.name, history), factory.fit(history, products)) };
}

/** Bản sao chỉ đọc: phương pháp nào lỡ sửa dữ liệu học sẽ báo lỗi ngay. */
function frozenCopy(orders) {
    return Object.freeze(orders.map((o) => Object.freeze({ id: o.id, time: o.time, items: Object.freeze([...o.items]) })));
}

/**
 * Chọn (minSupport, minConfidence) cho luật kết hợp + fallback.
 * Mục tiêu: Recall@K cao nhất trên validation; hòa thì HitRate@K, rồi Precision@K,
 * rồi minSupport lớn hơn, rồi minConfidence lớn hơn (mô hình đơn giản hơn).
 */
function tuneAssociationRules({ history, products, queries, grid = DEFAULT_GRID, k, catalogSize, algorithm = "fpgrowth", observeFit, onProgress }) {
    const rows = [];
    const total = grid.minSupport.length * grid.minConfidence.length;
    for (const minSupport of grid.minSupport) {
        for (const minConfidence of grid.minConfidence) {
            if (onProgress && rows.length % 6 === 0) onProgress(`chọn tham số trên validation ${rows.length}/${total}`);
            const params = { algorithm, minSupport, minConfidence };
            const withFallback = observed(associationRuleRecommender({ ...params, fallback: true, k }), "tuning", observeFit).fit(history, products);
            const rulesOnly = observed(associationRuleRecommender({ ...params, fallback: false, k }), "tuning", observeFit).fit(history, products);
            rows.push({
                minSupport,
                minConfidence,
                minSupportCount: withFallback.stats.minSupportCount,
                ruleCount: withFallback.stats.ruleCount,
                withFallback: evaluateRecommender(withFallback, queries, { k, catalogSize }).summary,
                rulesOnly: evaluateRecommender(rulesOnly, queries, { k, catalogSize }).summary,
            });
        }
    }
    const ranked = [...rows].sort(
        (a, b) =>
            b.withFallback.recall - a.withFallback.recall ||
            b.withFallback.hitRate - a.withFallback.hitRate ||
            b.withFallback.precision - a.withFallback.precision ||
            b.minSupport - a.minSupport ||
            b.minConfidence - a.minConfidence
    );
    const best = ranked[0];
    const edge = [];
    if (best.minSupport === Math.min(...grid.minSupport)) edge.push("minSupport ở giá trị nhỏ nhất của lưới");
    if (best.minSupport === Math.max(...grid.minSupport)) edge.push("minSupport ở giá trị lớn nhất của lưới");
    if (best.minConfidence === Math.min(...grid.minConfidence)) edge.push("minConfidence ở giá trị nhỏ nhất của lưới");
    if (best.minConfidence === Math.max(...grid.minConfidence)) edge.push("minConfidence ở giá trị lớn nhất của lưới");
    return {
        objective: "Recall@K của luật + fallback trên validation (hòa: HitRate, Precision, minSupport lớn, minConfidence lớn)",
        rows,
        selected: { minSupport: best.minSupport, minConfidence: best.minConfidence },
        selectedOnGridEdge: edge,
        top5: ranked.slice(0, 5).map((r) => ({ minSupport: r.minSupport, minConfidence: r.minConfidence, ...pick(r.withFallback) })),
    };
}

function evaluateOnQueries(factory, history, products, queries, { k, catalogSize, bootstrap, seed }) {
    const model = factory.fit(history, products);
    const { perQuery, summary } = evaluateRecommender(model, queries, { k, catalogSize });
    const ci = {};
    for (const field of ["precision", "recall", "hit"]) ci[field] = bootstrapCI(perQuery, field, { resamples: bootstrap, seed });
    return { name: factory.name, label: factory.label, params: factory.params || null, modelStats: model.stats || null, summary, ci, perQuery };
}

/** Apriori và FP-Growth phải cho cùng gợi ý cho mọi truy vấn; đo thời gian khai phá (trung vị). */
function compareAlgorithms({ history, products, queries, params, k, timingRuns = 5, observeFit }) {
    const lists = {};
    const timings = {};
    for (const algorithm of ["apriori", "fpgrowth"]) {
        const factory = observed(associationRuleRecommender({ ...params, algorithm, fallback: true, k }), "final", observeFit);
        const times = [];
        let model;
        for (let i = 0; i < timingRuns; i++) {
            const t0 = performance.now();
            model = factory.fit(history, products);
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        timings[algorithm] = {
            medianFitMs: times[Math.floor(times.length / 2)],
            ruleCount: model.stats.ruleCount,
            itemsetCount: model.stats.itemsetCount,
        };
        lists[algorithm] = queries.map((q) => model.recommend(q.query).map((x) => `${x.productId}:${x.source}`).join(","));
    }
    const mismatches = queries.filter((_, i) => lists.apriori[i] !== lists.fpgrowth[i]).length;
    return { params, queries: queries.length, identical: mismatches === 0, mismatches, timings, timingRuns };
}

/**
 * @param {{name: string, products: object[], orders: object[]}} dataset
 * @param {{k?: number, ratios?: object, grid?: object, bootstrap?: number, bootstrapSeed?: number, randomSeed?: number}} options
 */
function runEvaluation(dataset, options = {}) {
    const { k = 5, ratios = DEFAULT_RATIOS, grid = DEFAULT_GRID, bootstrap = 1000, bootstrapSeed = 20261026, randomSeed = 42, observeFit, onProgress } = options;
    const products = dataset.products;
    const catalogSize = products.length;

    // 1. Chia dữ liệu và kiểm tra rò rỉ thời gian.
    const split = temporalSplit(dataset.orders, ratios);
    const tuningHistory = frozenCopy(split.train);
    const finalHistory = frozenCopy([...split.train, ...split.validation]);
    assertNoTemporalLeak(tuningHistory, split.validation);
    assertNoTemporalLeak(finalHistory, split.test);

    const validationQueries = buildQueries(split.validation);
    const testQueries = buildQueries(split.test);

    // 2. Chọn tham số trên validation.
    const tuning = tuneAssociationRules({ history: tuningHistory, products, queries: validationQueries, grid, k, catalogSize, observeFit, onProgress });
    if (onProgress) onProgress(`chấm 8 phương pháp trên ${testQueries.length} truy vấn test (bootstrap ${bootstrap} lần)`);

    // 3. Đánh giá trên test.
    const website = { minSupport: WEBSITE_DEFAULTS.minSupport, minConfidence: WEBSITE_DEFAULTS.minConfidence };
    const factories = [
        randomRecommender({ seed: randomSeed, k }),
        mostPopularRecommender({ k }),
        categoryBasedRecommender({ k }),
        cooccurrenceRecommender({ k }),
        associationRuleRecommender({ ...website, fallback: false, k, label: `Hệ thống hiện tại – chỉ luật (tham số website: sup ${website.minSupport}, conf ${website.minConfidence})` }),
        associationRuleRecommender({ ...website, fallback: true, k, label: `Hệ thống hiện tại – luật + fallback (tham số website)` }),
        associationRuleRecommender({ ...tuning.selected, fallback: false, k, label: `Luật – chỉ luật (tham số chọn trên validation: sup ${tuning.selected.minSupport}, conf ${tuning.selected.minConfidence})` }),
        associationRuleRecommender({ ...tuning.selected, fallback: true, k, label: `Luật + fallback (tham số chọn trên validation)` }),
    ];
    // Khóa cố định theo vị trí, dùng để gộp kết quả nhiều bộ dữ liệu (Bước 2).
    const keys = ["random", "most-popular", "category-based", "co-occurrence", "current-rules-only", "current-with-fallback", "tuned-rules-only", "tuned-with-fallback"];
    const evalOptions = { k, catalogSize, bootstrap, seed: bootstrapSeed };
    const results = factories.map((f, i) => ({
        key: keys[i],
        ...evaluateOnQueries(observed(f, "final", observeFit), finalHistory, products, testQueries, evalOptions),
    }));

    const byName = (name, idx) => results.filter((r) => r.name === name)[idx || 0];
    const tunedWithFallback = results[7];
    const comparisons = [byName("most-popular"), byName("category-based"), byName("co-occurrence"), results[5]].map((other) => ({
        a: tunedWithFallback.label,
        b: other.label,
        recall: pairedBootstrapDiff(tunedWithFallback.perQuery, other.perQuery, "recall", { resamples: bootstrap, seed: bootstrapSeed }),
        hit: pairedBootstrapDiff(tunedWithFallback.perQuery, other.perQuery, "hit", { resamples: bootstrap, seed: bootstrapSeed }),
    }));

    // 4. Apriori vs FP-Growth.
    if (onProgress) onProgress("kiểm tra Apriori = FP-Growth trên mọi truy vấn validation + test");
    const algorithmCheck = [website, tuning.selected].map((params) =>
        compareAlgorithms({ history: finalHistory, products, queries: [...validationQueries, ...testQueries], params, k, observeFit })
    );

    return {
        dataset: { name: dataset.name, source: dataset.source, seed: dataset.seed, orderCount: dataset.orders.length, productCount: catalogSize, checksum: dataset.checksum },
        settings: { k, ratios, grid, bootstrap, bootstrapSeed, randomSeed, websiteDefaults: website },
        split: {
            train: { ...describeQueries(split.train, buildQueries(split.train)), range: split.ranges.train },
            validation: { ...describeQueries(split.validation, validationQueries), range: split.ranges.validation },
            test: { ...describeQueries(split.test, testQueries), range: split.ranges.test },
            leakageChecks: [
                "max(time train) ≤ min(time validation)",
                "max(time train ∪ validation) ≤ min(time test)",
                "không đơn nào nằm ở hai tập",
                "tham số chỉ chọn bằng validation; test chỉ dùng một lần",
            ],
        },
        tuning,
        results: results.map(({ perQuery, ...rest }) => rest),
        comparisons,
        algorithmCheck,
        perQuery: Object.fromEntries(results.map((r) => [r.label, r.perQuery])),
    };
}

module.exports = { DEFAULT_GRID, frozenCopy, tuneAssociationRules, compareAlgorithms, runEvaluation };
