// Tóm tắt và gộp kết quả M3 qua nhiều seed.

const { describe } = require("../evaluation/aggregate");

const METRICS = ["precision", "recall", "hitRate", "coverage", "categoryDiversity", "ild", "ruleQueryRate", "ruleSlotShare", "rareSlotShare", "rareListRate", "rareProductsRecommended", "plausibleItemRate", "avgListLength"];
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const rankText = (r) => (r ? `${r.strategy}${r.strategy === "kulc-ir" ? ` β=${r.beta}` : ""}${r.strategy === "popularity" ? ` γ=${r.gamma}` : ""}, λ=${r.lambda}` : "–");

function summarizeM3Run(report, extra = {}) {
    return {
        dataset: report.dataset,
        ...extra,
        rare: { count: report.rare.count },
        baseParams: report.baseParams,
        tuning: Object.fromEntries(Object.entries(report.tuning).map(([b, t]) => [b, { R: t.R, C: t.C, families: t.families }])),
        results: report.results,
        comparisons: report.comparisons,
        tradeoff: report.tradeoff,
    };
}

function aggregateM3Runs(summaries) {
    const keys = summaries[0].results.map((r) => r.key);
    const methods = keys.map((key) => {
        const per = summaries.map((s) => s.results.find((r) => r.key === key));
        const metrics = Object.fromEntries(METRICS.map((m) => [m, describe(per.map((r) => r.summary[m]).filter((x) => x !== null && x !== undefined))]));
        const orderBootstrap = Object.fromEntries(["recall", "precision", "hit", "categoryDiversity"].map((f) => [f, { low: mean(per.map((r) => r.ci[f].low)), high: mean(per.map((r) => r.ci[f].high)) }]));
        const withRare = per.filter((r) => r.rare.queries > 0);
        const rare = {
            seeds: withRare.length,
            queries: describe(withRare.map((r) => r.rare.queries)),
            recall: describe(withRare.map((r) => r.rare.recall)),
            hitRate: describe(withRare.map((r) => r.rare.hitRate)),
            ruleQueryRate: describe(withRare.map((r) => r.rare.ruleQueryRate)),
            coverage: describe(withRare.map((r) => r.rare.coverage)),
            ci: withRare.length ? { low: mean(withRare.map((r) => r.rare.ci.recall.low)), high: mean(withRare.map((r) => r.rare.ci.recall.high)) } : null,
        };
        const mislabeled = per.reduce((s, r) => s + (r.summary.mislabeledFallback || 0), 0);
        return { key, label: per[0].label, base: per[0].base, metrics, orderBootstrap, rare, mislabeled, rankMsPerList: describe(per.map((r) => r.rankMsPerList).filter((x) => x !== null)), selected: per.map((r) => rankText(r.rank)) };
    });

    const pairs = summaries[0].comparisons.map((c0, i) => {
        const list = summaries.map((s) => s.comparisons[i]);
        const side = (part, field) => {
            const xs = list.map((c) => c[part]).filter(Boolean);
            if (!xs.length) return null;
            return {
                seeds: xs.length,
                diff: describe(xs.map((x) => x[field].mean)),
                seedsSignificantlyPositive: xs.filter((x) => x[field].low > 0).length,
                seedsSignificantlyNegative: xs.filter((x) => x[field].high < 0).length,
            };
        };
        const part = (p) => Object.fromEntries(["recall", "hit", "precision", "categoryDiversity", "rareShare"].map((f) => [f, side(p, f)]));
        return { a: c0.a, b: c0.b, coverageDiff: describe(list.map((c) => c.coverageDiff)), all: part("all"), rare: part("rare") };
    });

    const tradeoff = {};
    for (const base of Object.keys(summaries[0].tradeoff)) {
        const lambdas = summaries[0].tradeoff[base].map((x) => x.lambda);
        tradeoff[base] = lambdas.map((lambda, i) => {
            const xs = summaries.map((s) => s.tradeoff[base][i]);
            return {
                lambda,
                strategies: xs.map((x) => rankText(x)),
                validationRecall: describe(xs.filter((x) => x.validation).map((x) => x.validation.recall)),
                validationCoverage: describe(xs.filter((x) => x.validation).map((x) => x.validation.coverage)),
                testRecall: describe(xs.map((x) => x.test.recall)),
                testCoverage: describe(xs.map((x) => x.test.coverage)),
                testDiversity: describe(xs.map((x) => x.test.categoryDiversity)),
            };
        });
    }

    return {
        seeds: summaries.map((s) => s.dataset.seed),
        datasets: summaries.map((s) => ({ name: s.dataset.name, seed: s.dataset.seed, checksum: s.dataset.checksum, seconds: s.seconds ?? null, rareProducts: s.rare.count, baseParams: s.baseParams, selected: Object.fromEntries(Object.entries(s.tuning).map(([b, t]) => [b, { R: rankText(t.R), C: rankText(t.C) }])), families: s.tuning.flat.families ? Object.fromEntries(Object.entries(s.tuning.flat.families).map(([f, r]) => [f, rankText(r)])) : null })),
        methods,
        pairs,
        tradeoff,
    };
}

module.exports = { summarizeM3Run, aggregateM3Runs, rankText, METRICS };
