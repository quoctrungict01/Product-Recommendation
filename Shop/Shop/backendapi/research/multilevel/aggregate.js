// Tóm tắt và gộp kết quả M1 qua nhiều seed (mỗi seed là một lần lặp độc lập của bộ sinh dữ liệu).

const { describe } = require("../evaluation/aggregate");

const METRICS = ["precision", "recall", "hitRate", "coverage", "ruleQueryRate", "hierarchyRuleQueryRate", "avgListLength"];
const RARE_METRICS = ["precision", "recall", "hitRate", "coverage", "ruleQueryRate", "hierarchyRuleQueryRate", "rareProductsRecommended"];

/** Bản tóm tắt gọn một bộ dữ liệu (không có chỉ số từng truy vấn) — gửi được qua IPC và ghi JSON. */
function summarizeM1Run(report, extra = {}) {
    return {
        dataset: report.dataset,
        ...extra,
        split: { train: report.split.train.orders, validation: report.split.validation.orders, test: report.split.test.orders, validationQueries: report.split.validation.queries, testQueries: report.split.test.queries },
        rare: report.rare,
        tuning: {
            flat: report.tuning.flat,
            m1: { selected: report.tuning.m1.selected, strategy: report.tuning.m1.strategy, selectedOnGridEdge: report.tuning.m1.selectedOnGridEdge, top5: report.tuning.m1.top5, configurations: report.tuning.m1.configurations, miningRuns: report.tuning.m1.miningRuns },
        },
        results: report.results.map((r) => ({ key: r.key, label: r.label, params: r.params, fitMs: r.fitMs, summary: r.summary, ci: r.ci, rare: r.rare })),
        comparisons: report.comparisons,
        algorithmCheck: report.algorithmCheck.map((a) => ({ params: a.params, identical: a.identical, rulesIdentical: a.rulesIdentical, mismatches: a.mismatches, queries: a.queries, timings: a.timings })),
        miningStats: report.miningStats,
    };
}

const pctOrNull = (x) => (x === null || x === undefined ? null : x);

function aggregateM1Runs(summaries) {
    const keys = summaries[0].results.map((r) => r.key);
    const methods = keys.map((key) => {
        const per = summaries.map((s) => s.results.find((r) => r.key === key));
        const metrics = Object.fromEntries(METRICS.map((m) => [m, describe(per.map((r) => r.summary[m]))]));
        const orderBootstrap = Object.fromEntries(
            [["recall", "recall"], ["hit", "hitRate"], ["precision", "precision"]].map(([f, name]) => [name, { low: mean(per.map((r) => r.ci[f].low)), high: mean(per.map((r) => r.ci[f].high)) }])
        );
        const withRare = per.filter((r) => r.rare.queries > 0);
        const rare = Object.fromEntries(RARE_METRICS.map((m) => [m, describe(withRare.map((r) => pctOrNull(r.rare[m])).filter((x) => x !== null))]));
        rare.queries = describe(per.map((r) => r.rare.queries));
        rare.seedsWithQueries = withRare.length;
        // Gộp mọi truy vấn hiếm của các seed (trung bình có trọng số theo số truy vấn).
        const totalQ = withRare.reduce((s, r) => s + r.rare.queries, 0);
        rare.pooled = totalQ
            ? Object.fromEntries(["recall", "hitRate", "ruleQueryRate", "hierarchyRuleQueryRate"].map((m) => [m, withRare.reduce((s, r) => s + r.rare[m] * r.rare.queries, 0) / totalQ]))
            : null;
        rare.pooled && (rare.pooled.queries = totalQ);
        rare.orderBootstrap = withRare.length ? { recall: { low: mean(withRare.map((r) => r.rare.ci.recall.low)), high: mean(withRare.map((r) => r.rare.ci.recall.high)) } } : null;
        return { key, label: per[0].label, metrics, orderBootstrap, rare, fitMs: describe(per.map((r) => r.fitMs)) };
    });

    const pairs = summaries[0].comparisons.map((c0, i) => {
        const list = summaries.map((s) => s.comparisons[i]);
        const side = (part, field) => {
            const xs = list.map((c) => c[part]).filter(Boolean);
            if (!xs.length) return null;
            return {
                seeds: xs.length,
                diff: describe(xs.map((x) => x[field].mean)),
                // số seed có KTC bootstrap theo đơn nằm hẳn trên 0 / hẳn dưới 0
                seedsSignificantlyPositive: xs.filter((x) => x[field].low > 0).length,
                seedsSignificantlyNegative: xs.filter((x) => x[field].high < 0).length,
                seedsPositive: xs.filter((x) => x[field].mean > 0).length,
                perSeed: xs.map((x) => ({ mean: x[field].mean, low: x[field].low, high: x[field].high, queries: x.queries })),
            };
        };
        return { a: c0.a, b: c0.b, all: { recall: side("all", "recall"), hit: side("all", "hit") }, rare: { recall: side("rare", "recall"), hit: side("rare", "hit") } };
    });

    const statKeys = ["avgFlatLength", "avgExtendedLength", "maxExtendedLength", "minedAtLowest", "trivialRemoved", "belowOwnThreshold", "frequent", "rules"];
    const mining = Object.fromEntries(statKeys.map((k) => [k, describe(summaries.map((s) => s.miningStats.stats[k]))]));
    const typeKeys = [...new Set(summaries.flatMap((s) => Object.keys(s.miningStats.stats.frequentByType)))].sort();
    mining.frequentByType = Object.fromEntries(typeKeys.map((t) => [t, describe(summaries.map((s) => s.miningStats.stats.frequentByType[t] || 0))]));
    const ruleTypes = [...new Set(summaries.flatMap((s) => Object.keys(s.miningStats.usableByType)))].sort();
    mining.usableByType = Object.fromEntries(ruleTypes.map((t) => [t, describe(summaries.map((s) => s.miningStats.usableByType[t] || 0))]));
    mining.usableRules = describe(summaries.map((s) => s.miningStats.usableRules));
    mining.redundantRules = describe(summaries.map((s) => s.miningStats.redundantRules));
    mining.flatRuleCount = describe(summaries.map((s) => s.miningStats.flatRuleCount));

    return {
        seeds: summaries.map((s) => s.dataset.seed),
        datasets: summaries.map((s) => ({
            name: s.dataset.name,
            seed: s.dataset.seed,
            checksum: s.dataset.checksum,
            seconds: s.seconds ?? null,
            rareProducts: s.rare.count,
            flatSelected: s.tuning.flat.selected,
            m1Selected: s.tuning.m1.selected,
            m1Strategy: s.tuning.m1.strategy,
            m1OnGridEdge: s.tuning.m1.selectedOnGridEdge,
            algorithmsIdentical: s.algorithmCheck.every((a) => a.identical),
            m1FitMs: Object.fromEntries(["apriori", "fpgrowth"].map((alg) => [alg, s.algorithmCheck[1].timings[alg].medianFitMs])),
        })),
        methods,
        pairs,
        mining,
    };
}

function mean(values) {
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

module.exports = { summarizeM1Run, aggregateM1Runs, METRICS, RARE_METRICS };
