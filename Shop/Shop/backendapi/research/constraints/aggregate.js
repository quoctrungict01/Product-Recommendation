// Tóm tắt và gộp kết quả M2 qua nhiều seed.

const { describe } = require("../evaluation/aggregate");

const METRICS = ["precision", "recall", "hitRate", "coverage", "ruleQueryRate", "plausibleItemRate", "allPlausibleQueryRate", "avgListLength"];
const RARE_METRICS = ["precision", "recall", "hitRate", "coverage", "ruleQueryRate", "plausibleItemRate", "rareProductsRecommended"];
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function summarizeM2Run(report, extra = {}) {
    return {
        dataset: report.dataset,
        ...extra,
        split: { train: report.split.train.orders, validation: report.split.validation.orders, test: report.split.test.orders, testQueries: report.split.test.queries },
        rare: report.rare,
        tuning: report.tuning,
        results: report.results.map((r) => ({ key: r.key, label: r.label, params: r.params, fitMs: r.fitMs, summary: r.summary, ci: r.ci, rare: r.rare, violations: r.violations })),
        comparisons: report.comparisons,
        constraintCheck: report.constraintCheck,
    };
}

function aggregateM2Runs(summaries) {
    const keys = summaries[0].results.map((r) => r.key);
    const methods = keys.map((key) => {
        const per = summaries.map((s) => s.results.find((r) => r.key === key));
        const metrics = Object.fromEntries(METRICS.map((m) => [m, describe(per.map((r) => r.summary[m]))]));
        const orderBootstrap = Object.fromEntries([["recall", "recall"], ["hit", "hitRate"], ["precision", "precision"], ["plausible", "plausible"]].map(([f, n]) => [n, { low: mean(per.map((r) => r.ci[f].low)), high: mean(per.map((r) => r.ci[f].high)) }]));
        const withRare = per.filter((r) => r.rare.queries > 0);
        const rare = Object.fromEntries(RARE_METRICS.map((m) => [m, describe(withRare.map((r) => r.rare[m]).filter((x) => x !== null && x !== undefined))]));
        rare.seedsWithQueries = withRare.length;
        rare.queries = describe(per.map((r) => r.rare.queries));
        const totalQ = withRare.reduce((s, r) => s + r.rare.queries, 0);
        rare.pooledRecall = totalQ ? withRare.reduce((s, r) => s + r.rare.recall * r.rare.queries, 0) / totalQ : null;
        rare.orderBootstrap = withRare.length ? { recall: { low: mean(withRare.map((r) => r.rare.ci.recall.low)), high: mean(withRare.map((r) => r.rare.ci.recall.high)) } } : null;
        const types = [...new Set(per.flatMap((r) => Object.keys(r.violations)))].sort();
        const violations = Object.fromEntries(types.map((t) => [t, describe(per.map((r) => r.violations[t] || 0))]));
        return { key, label: per[0].label, metrics, orderBootstrap, rare, violations, fitMs: describe(per.map((r) => r.fitMs)) };
    });

    const pairs = summaries[0].comparisons.map((c0, i) => {
        const list = summaries.map((s) => s.comparisons[i]);
        const side = (part, field) => {
            const xs = list.map((c) => c[part]).filter(Boolean);
            if (!xs.length) return null;
            return {
                seeds: xs.length,
                diff: describe(xs.map((x) => x[field].mean)),
                seedsPositive: xs.filter((x) => x[field].mean > 0).length,
                seedsSignificantlyPositive: xs.filter((x) => x[field].low > 0).length,
                seedsSignificantlyNegative: xs.filter((x) => x[field].high < 0).length,
                perSeed: xs.map((x) => ({ mean: x[field].mean, low: x[field].low, high: x[field].high })),
            };
        };
        const part = (p) => Object.fromEntries(["recall", "hit", "precision", "plausible"].map((f) => [f, side(p, f)]));
        return { a: c0.a, b: c0.b, all: part("all"), rare: part("rare") };
    });

    // Cắt tỉa ↔ hậu lọc
    const check = { identicalFlat: summaries.filter((s) => s.constraintCheck.identical.flat).length, identicalMultilevel: summaries.filter((s) => s.constraintCheck.identical.multilevel).length, n: summaries.length, parts: {} };
    for (const part of ["flat", "multilevel"]) {
        check.parts[part] = {};
        for (const variant of Object.keys(summaries[0].constraintCheck.results[part])) {
            const xs = summaries.map((s) => s.constraintCheck.results[part][variant]);
            check.parts[part][variant] = {
                medianMiningMs: describe(xs.map((x) => x.medianMiningMs)),
                itemsets: describe(xs.map((x) => x.itemsets)),
                totalCandidates: describe(xs.map((x) => x.stats.totalCandidates).filter((x) => x !== null)),
                prunedByConstraint: describe(xs.map((x) => x.stats.prunedByConstraint).filter((x) => x !== null)),
                prunedBaseItems: describe(xs.map((x) => x.stats.prunedBaseItems).filter((x) => x !== null)),
                conditionalTrees: describe(xs.map((x) => x.stats.conditionalTrees).filter((x) => x !== null)),
            };
        }
    }

    return {
        seeds: summaries.map((s) => s.dataset.seed),
        datasets: summaries.map((s) => ({ name: s.dataset.name, seed: s.dataset.seed, checksum: s.dataset.checksum, seconds: s.seconds ?? null, rareProducts: s.rare.count, tuning: s.tuning, pushEqualsPost: s.constraintCheck.identical })),
        methods,
        pairs,
        constraintCheck: check,
    };
}

module.exports = { summarizeM2Run, aggregateM2Runs, METRICS };
