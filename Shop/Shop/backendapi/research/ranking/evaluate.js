// Đánh giá M3 (xếp hạng lại + đa dạng hóa Top-K), riêng và kết hợp M1/M2, bằng ĐÚNG giao thức Bước 1–4.
//
// Chọn tham số hai giai đoạn, CHỈ trên validation (học trên train):
//   1. tham số nền (ngưỡng, confidence, policy) chọn như các bước trước, cho từng nền flat / m1 / m2-flat / m2-m1;
//   2. với nền đã cố định, chọn tham số xếp hạng (chiến lược, β, γ, λ) theo hai quy tắc:
//        M3-R: Recall@5 validation cao nhất;
//        M3-C: Coverage validation cao nhất trong các cấu hình có Recall@5 validation ≥ Recall tốt nhất − 0,5 điểm
//              (không đánh đổi Coverage bằng mọi giá — mức sụt Recall tối đa cho phép được khai báo trước).
// Sau đó học lại trên train ∪ validation, chấm test một lần, KTC bootstrap theo đơn hàng.

const { temporalSplit, assertNoTemporalLeak, DEFAULT_RATIOS } = require("../evaluation/split");
const { buildQueries, describeQueries } = require("../evaluation/protocol");
const { evaluateRecommender, bootstrapCI, pairedBootstrapDiff, mean } = require("../evaluation/metrics");
const { DEFAULT_GRID, frozenCopy, tuneAssociationRules } = require("../evaluation/runner");
const { associationRuleRecommender } = require("../evaluation/recommenders");
const { rareProductsOf } = require("../evaluation/aggregate");
const { DEFAULTS: WEBSITE_DEFAULTS } = require("../../src/apps/services/recommendation/service");
const { DEFAULT_M1_GRID, tuneMultilevel } = require("../multilevel/evaluate");
const { tuneConstrainedFlat, tuneConstrainedMultilevel } = require("../constraints/evaluate");
const { buildBusinessRules } = require("../constraints/business");
const { fitBase, buildRanked, BASES } = require("./recommender");

const RECALL_TOLERANCE = 0.005;
const DEFAULT_RANK_GRID = Object.freeze({
    strategies: [
        { strategy: "native" },
        { strategy: "confidence" },
        { strategy: "kulc-ir", beta: 0 },
        { strategy: "kulc-ir", beta: 0.5 },
        { strategy: "kulc-ir", beta: 1 },
        { strategy: "popularity", gamma: 0.25 },
        { strategy: "popularity", gamma: 0.5 },
        { strategy: "popularity", gamma: 0.75 },
        { strategy: "popularity", gamma: 1 },
    ],
    lambda: [1, 0.9, 0.75, 0.5, 0.25],
});

function rankConfigs(grid) {
    return grid.strategies.flatMap((s) => grid.lambda.map((lambda) => ({ strategy: s.strategy, beta: s.beta ?? 0, gamma: s.gamma ?? 0, lambda })));
}
const configKey = (c) => `${c.strategy}|β${c.beta}|γ${c.gamma}|λ${c.lambda}`;
// Độ "đơn giản" để phá hòa: native trước, λ lớn (ít đa dạng hóa) trước.
const simplicity = (c) => (c.strategy === "native" ? 0 : 1) * 10 + (1 - c.lambda);

/** Chạy mô hình trên truy vấn, bổ sung chỉ số đa dạng, sản phẩm hiếm, tỷ lệ luật, hợp lý nghiệp vụ. */
function evaluateModel(model, queries, { k, catalogSize, rare, categoryOf, business, candidatesOf }) {
    const { perQuery, summary } = evaluateRecommender(model, queries, { k, catalogSize });
    let mislabeled = 0;
    let slots = 0;
    let ruleSlots = 0;
    let rareSlots = 0;
    let implausible = 0;
    queries.forEach((q, i) => {
        const list = (model.explain ? model.explain(q.query) : model.recommend(q.query)).slice(0, k);
        const ids = list.map((x) => x.productId);
        const cats = ids.map(categoryOf);
        let pairs = 0;
        let diffPairs = 0;
        for (let a = 0; a < cats.length; a++) for (let b = a + 1; b < cats.length; b++) (pairs++, cats[a] !== cats[b] && diffPairs++);
        const rareHere = ids.filter((id) => rare.has(id)).length;
        slots += ids.length;
        ruleSlots += perQuery[i].ruleItems;
        rareSlots += rareHere;
        implausible += ids.filter((id) => business.violation(q.query, id)).length;
        // Fallback không được tính nhầm là luật: mục "association-rule" phải có luật nguồn và nằm trong tập ứng viên;
        // mục fallback không được nằm trong tập ứng viên (fallback chỉ lấp chỗ khi đã dùng hết ứng viên).
        if (candidatesOf && model.explain) {
            const cand = new Set(candidatesOf(q.query).map((c) => c.productId));
            for (const x of list) {
                if (x.source === "association-rule" && (!x.rule || !cand.has(x.productId))) mislabeled++;
                if (x.source !== "association-rule" && cand.has(x.productId)) mislabeled++;
            }
        }
        Object.assign(perQuery[i], {
            ids,
            categoryDiversity: ids.length ? new Set(cats).size / ids.length : 0,
            ild: pairs ? diffPairs / pairs : 0,
            rareShare: ids.length ? rareHere / ids.length : 0,
            hasRare: rareHere > 0 ? 1 : 0,
        });
    });
    const recommendedAnywhere = new Set(perQuery.flatMap((r) => r.ids));
    Object.assign(summary, {
        categoryDiversity: mean(perQuery.map((r) => r.categoryDiversity)),
        ild: mean(perQuery.map((r) => r.ild)),
        ruleSlotShare: slots ? ruleSlots / slots : 0,
        rareSlotShare: slots ? rareSlots / slots : 0,
        rareListRate: mean(perQuery.map((r) => r.hasRare)),
        rareProductsRecommended: rare.size ? [...rare].filter((id) => recommendedAnywhere.has(id)).length / rare.size : null,
        plausibleItemRate: slots ? 1 - implausible / slots : 1,
        mislabeledFallback: mislabeled,
    });
    return { perQuery, summary };
}

/** Giai đoạn 2: chọn tham số xếp hạng cho một nền đã học trên train. */
function tuneRanking(fitted, queries, ctx, grid = DEFAULT_RANK_GRID, { families = false } = {}) {
    const rows = rankConfigs(grid).map((c) => {
        const s = evaluateModel(buildRanked(fitted, { ...c, k: ctx.k }), queries, ctx).summary;
        return { ...c, recall: s.recall, hitRate: s.hitRate, precision: s.precision, coverage: s.coverage, categoryDiversity: s.categoryDiversity, rareSlotShare: s.rareSlotShare };
    });
    const byRecall = (a, b) => b.recall - a.recall || b.hitRate - a.hitRate || b.precision - a.precision || simplicity(a) - simplicity(b);
    const pick = (list) => [...list].sort(byRecall)[0];
    const R = pick(rows);
    const tolerated = rows.filter((r) => r.recall >= R.recall - RECALL_TOLERANCE - 1e-12);
    const Cbest = [...tolerated].sort((a, b) => b.coverage - a.coverage || byRecall(a, b))[0];
    const strip = (r) => ({ strategy: r.strategy, beta: r.beta, gamma: r.gamma, lambda: r.lambda });
    const out = { R: strip(R), C: strip(Cbest), native: rows.find((r) => r.strategy === "native" && r.lambda === 1), rows };
    if (families) {
        out.families = {
            "kulc-ir": strip(pick(rows.filter((r) => r.strategy === "kulc-ir" && r.lambda === 1))),
            popularity: strip(pick(rows.filter((r) => r.strategy === "popularity" && r.lambda === 1))),
            diversified: strip(pick(rows.filter((r) => r.strategy === "native" && r.lambda < 1))),
        };
    }
    return out;
}

const LABEL = { flat: "Luật một cấp", "m2-flat": "M2 một cấp", m1: "M1", "m2-m1": "M2 + M1" };

function runRankingEvaluation(dataset, options = {}) {
    const { k = 5, ratios = DEFAULT_RATIOS, grid = DEFAULT_GRID, m1Grid = DEFAULT_M1_GRID, rankGrid = DEFAULT_RANK_GRID, bootstrap = 1000, bootstrapSeed = 20261026, rareThreshold = 0.005, observeFit, onProgress } = options;
    const products = dataset.products;
    const catalogSize = products.length;
    const business = buildBusinessRules(products);
    const categoryOf = (() => {
        const m = new Map(products.map((p) => [String(p._id), String(p.category_id)]));
        return (id) => m.get(String(id)) || null;
    })();

    const split = temporalSplit(dataset.orders, ratios);
    const tuningHistory = frozenCopy(split.train);
    const finalHistory = frozenCopy([...split.train, ...split.validation]);
    assertNoTemporalLeak(tuningHistory, split.validation);
    assertNoTemporalLeak(finalHistory, split.test);
    const validationQueries = buildQueries(split.validation);
    const testQueries = buildQueries(split.test);
    const rare = rareProductsOf(dataset, { ratios, rareThreshold });

    // Giai đoạn 1: tham số nền (như Bước 2–4).
    if (onProgress) onProgress("giai đoạn 1: tham số nền trên validation (một cấp, M1, M2, M2 + M1)");
    const common = { history: tuningHistory, products, queries: validationQueries, k, catalogSize, observeFit };
    const baseParams = {
        flat: tuneAssociationRules({ ...common, grid }).selected,
        m1: tuneMultilevel({ ...common, grid: m1Grid }).selected,
        "m2-flat": tuneConstrainedFlat({ ...common, grid }).selected,
        "m2-m1": tuneConstrainedMultilevel({ ...common, grid: m1Grid }).selected,
    };

    // Giai đoạn 2: tham số xếp hạng trên validation.
    if (onProgress) onProgress(`giai đoạn 2: ${rankConfigs(rankGrid).length} cấu hình xếp hạng × 4 nền trên validation`);
    const ctxFor = (fitted) => ({ k, catalogSize, rare: rare.rare, categoryOf, business, candidatesOf: fitted.candidatesOf });
    const tuning = {};
    for (const base of BASES) {
        if (observeFit) observeFit("tuning", `m3-${base}`, tuningHistory);
        const fitted = fitBase(base, tuningHistory, products, baseParams[base]);
        tuning[base] = tuneRanking(fitted, validationQueries, ctxFor(fitted), rankGrid, { families: base === "flat" });
    }

    // Chấm test.
    if (onProgress) onProgress(`chấm trên ${testQueries.length} truy vấn test`);
    const finalBases = {};
    for (const base of BASES) {
        if (observeFit) observeFit("final", `m3-${base}`, finalHistory);
        finalBases[base] = fitBase(base, finalHistory, products, baseParams[base]);
    }
    const methods = [];
    const website = { minSupport: WEBSITE_DEFAULTS.minSupport, minConfidence: WEBSITE_DEFAULTS.minConfidence };
    if (observeFit) observeFit("final", "current", finalHistory);
    methods.push({ key: "current", label: "Hệ thống hiện tại (luật + fallback)", base: null, rank: null, model: associationRuleRecommender({ ...website, fallback: true, k }).fit(finalHistory, products) });
    for (const base of BASES) {
        const variants = [["native", { strategy: "native", lambda: 1 }, `${LABEL[base]} (xếp hạng gốc)`]];
        if (base === "flat") {
            variants.push(["kulc-ir", tuning.flat.families["kulc-ir"], "M3: Kulc × (1 − β·IR)"]);
            variants.push(["popularity", tuning.flat.families.popularity, "M3: phạt phổ biến conf × P(q)^−γ"]);
            variants.push(["diversified", tuning.flat.families.diversified, "M3: đa dạng hóa danh mục (λ)"]);
        }
        variants.push(["m3R", tuning[base].R, `${base === "flat" ? "" : `${LABEL[base]} + `}M3-R (Recall tốt nhất)`]);
        variants.push(["m3C", tuning[base].C, `${base === "flat" ? "" : `${LABEL[base]} + `}M3-C (Coverage, Recall ≥ tốt nhất − 0,5)`]);
        for (const [v, rank, label] of variants) methods.push({ key: `${base}:${v}`, label, base, rank, model: buildRanked(finalBases[base], { ...rank, k }) });
    }
    // Chi phí xếp hạng: thời gian tạo danh sách cho mọi sản phẩm bằng một mô hình mới (không dùng cache), trung vị 3 lần.
    const { performance } = require("perf_hooks");
    for (const m of methods) {
        if (!m.base) continue;
        const times = [];
        for (let i = 0; i < 3; i++) {
            const fresh = buildRanked(finalBases[m.base], { ...m.rank, k });
            const t0 = performance.now();
            for (const p of products) fresh.explain(String(p._id));
            times.push((performance.now() - t0) / products.length);
        }
        m.rankMsPerList = times.sort((a, b) => a - b)[1];
    }
    const results = methods.map((m) => {
        const { perQuery, summary } = evaluateModel(m.model, testQueries, { ...ctxFor(m.base ? finalBases[m.base] : finalBases.flat), candidatesOf: m.base ? finalBases[m.base].candidatesOf : null });
        const ci = {};
        for (const f of ["precision", "recall", "hit", "categoryDiversity"]) ci[f] = bootstrapCI(perQuery, f, { resamples: bootstrap, seed: bootstrapSeed });
        const rarePQ = perQuery.filter((r) => rare.rare.has(r.query));
        const rareSummary = rarePQ.length
            ? {
                  queries: rarePQ.length,
                  recall: mean(rarePQ.map((r) => r.recall)),
                  hitRate: mean(rarePQ.map((r) => r.hit)),
                  ruleQueryRate: mean(rarePQ.map((r) => (r.ruleItems > 0 ? 1 : 0))),
                  coverage: new Set(rarePQ.flatMap((r) => r.ids)).size / catalogSize,
                  ci: { recall: bootstrapCI(rarePQ, "recall", { resamples: bootstrap, seed: bootstrapSeed }) },
              }
            : { queries: 0 };
        return { key: m.key, label: m.label, base: m.base, rank: m.rank, rankMsPerList: m.rankMsPerList ?? null, summary, ci, rare: rareSummary, perQuery };
    });
    const get = (key) => results.find((r) => r.key === key);

    const pairKeys = [];
    for (const base of BASES) for (const v of ["m3R", "m3C"]) pairKeys.push([`${base}:${v}`, `${base}:native`]);
    for (const v of ["kulc-ir", "popularity", "diversified"]) pairKeys.push([`flat:${v}`, "flat:native"]);
    pairKeys.push(["m2-m1:m3R", "flat:native"], ["m2-m1:m3C", "flat:native"]);
    const fields = ["recall", "hit", "precision", "categoryDiversity", "rareShare"];
    const paired = (a, b, filter) => {
        const A = get(a).perQuery.filter(filter);
        const B = get(b).perQuery.filter(filter);
        if (!A.length) return null;
        return Object.fromEntries([["queries", A.length], ...fields.map((f) => [f, pairedBootstrapDiff(A, B, f, { resamples: bootstrap, seed: bootstrapSeed })])]);
    };
    const comparisons = pairKeys.map(([a, b]) => ({ a, b, coverageDiff: get(a).summary.coverage - get(b).summary.coverage, all: paired(a, b, () => true), rare: paired(a, b, (r) => rare.rare.has(r.query)) }));

    // Đường đánh đổi Recall – Coverage theo λ (CHỈ để mô tả, không dùng để chọn tham số).
    const tradeoff = {};
    for (const base of ["flat", "m2-m1"]) {
        const R = tuning[base].R;
        tradeoff[base] = rankGrid.lambda.map((lambda) => {
            const rank = { strategy: R.strategy, beta: R.beta, gamma: R.gamma, lambda };
            const s = evaluateModel(buildRanked(finalBases[base], { ...rank, k }), testQueries, ctxFor(finalBases[base])).summary;
            const v = tuning[base].rows.find((r) => configKey(r) === configKey(rank));
            return { ...rank, validation: v ? { recall: v.recall, coverage: v.coverage } : null, test: { recall: s.recall, coverage: s.coverage, categoryDiversity: s.categoryDiversity, rareSlotShare: s.rareSlotShare } };
        });
    }

    return {
        dataset: { name: dataset.name, generatorVersion: dataset.generatorVersion || null, profile: dataset.profile || null, seed: dataset.seed, checksum: dataset.checksum, orders: dataset.orders.length, products: catalogSize },
        settings: { k, ratios, grid, m1Grid, rankGrid, recallTolerance: RECALL_TOLERANCE, bootstrap, bootstrapSeed, rareThreshold },
        split: { train: describeQueries(split.train, buildQueries(split.train)), validation: describeQueries(split.validation, validationQueries), test: describeQueries(split.test, testQueries) },
        rare: { products: [...rare.rare].sort(), count: rare.rare.size },
        baseParams,
        tuning: Object.fromEntries(Object.entries(tuning).map(([b, t]) => [b, { R: t.R, C: t.C, families: t.families || null, native: t.native, rows: t.rows }])),
        results: results.map(({ perQuery, ...rest }) => rest),
        comparisons,
        tradeoff,
        perQuery: Object.fromEntries(results.map((r) => [r.key, r.perQuery])),
    };
}

module.exports = { DEFAULT_RANK_GRID, RECALL_TOLERANCE, rankConfigs, evaluateModel, tuneRanking, runRankingEvaluation };
