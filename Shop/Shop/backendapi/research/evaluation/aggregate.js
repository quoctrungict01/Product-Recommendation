// Gộp kết quả đánh giá của nhiều bộ dữ liệu (nhiều seed).
// Mỗi seed là một lần lặp độc lập: báo trung bình, độ lệch chuẩn (mẫu, n−1) và KTC 95% theo phân phối t
// (bậc tự do n−1). Bootstrap trong từng seed (Bước 1) đo độ bất định do chọn truy vấn; độ lệch giữa các seed
// đo độ bất định do quá trình sinh dữ liệu.

const { temporalSplit } = require("./split");
const { itemCountsOf } = require("./recommenders");
const { mean } = require("./metrics");

// Giá trị t_{0.975, df}.
const T975 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086];

function describe(values) {
    const n = values.length;
    if (n === 0) return { n: 0, mean: null, sd: null, ciLow: null, ciHigh: null, min: null, max: null };
    const m = mean(values);
    const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)) : 0;
    const t = n > 1 ? T975[Math.min(n - 1, T975.length - 1)] : NaN;
    const half = n > 1 ? (t * sd) / Math.sqrt(n) : NaN;
    return { n, mean: m, sd, ciLow: m - half, ciHigh: m + half, min: Math.min(...values), max: Math.max(...values) };
}

const METRICS = ["precision", "recall", "hitRate", "coverage", "ruleQueryRate", "avgListLength"];

/** Chỉ số trên một nhóm truy vấn con (ví dụ: sản phẩm đang xem là sản phẩm ít giao dịch). */
function subgroupSummary(perQuery, predicate) {
    const rows = perQuery.filter(predicate);
    return {
        queries: rows.length,
        precision: mean(rows.map((r) => r.precision)),
        recall: mean(rows.map((r) => r.recall)),
        hitRate: mean(rows.map((r) => r.hit)),
        ruleQueryRate: mean(rows.map((r) => (r.ruleItems > 0 ? 1 : 0))),
    };
}

/**
 * Sản phẩm "ít giao dịch" = xuất hiện trong < rareThreshold × |lịch sử| đơn của lịch sử dùng để chấm test
 * (train ∪ validation). Chỉ dùng lịch sử, không dùng test.
 */
function rareProductsOf(dataset, { ratios, rareThreshold = 0.005 } = {}) {
    const split = temporalSplit(dataset.orders, ratios);
    const history = [...split.train, ...split.validation];
    const counts = itemCountsOf(history);
    const limit = rareThreshold * history.length;
    const rare = new Set(dataset.products.filter((p) => (counts.get(p._id) || 0) < limit).map((p) => p._id));
    return { rare, limit, historyOrders: history.length };
}

/**
 * Tóm tắt gọn một lần chạy (một bộ dữ liệu) — không chứa đơn hàng hay chỉ số từng truy vấn,
 * nên gửi được qua IPC từ tiến trình con và ghi vào JSON.
 * @param {object} dataset  kết quả generateResearchDataset()
 * @param {object} report   kết quả runEvaluation()
 * @param {{rare: Set<string>, limit: number}} rare kết quả rareProductsOf()
 */
function summarizeRun(dataset, report, rare, extra = {}) {
    return {
        dataset: {
            name: dataset.name,
            generatorVersion: dataset.generatorVersion || null,
            profile: dataset.profile || null,
            seed: dataset.seed,
            checksum: dataset.checksum,
            configSha1: dataset.configSha1 || null,
            orders: dataset.orders.length,
            products: dataset.products.length,
        },
        ...extra,
        split: {
            train: report.split.train.orders,
            validation: report.split.validation.orders,
            test: report.split.test.orders,
            validationQueries: report.split.validation.queries,
            testQueries: report.split.test.queries,
            testOrdersWithAtLeast2Items: report.split.test.ordersWithAtLeast2Items,
            ranges: { train: report.split.train.range, validation: report.split.validation.range, test: report.split.test.range },
        },
        tuning: { selected: report.tuning.selected, selectedOnGridEdge: report.tuning.selectedOnGridEdge },
        algorithmsIdentical: report.algorithmCheck.every((a) => a.identical),
        algorithmCheck: report.algorithmCheck,
        results: report.results.map((r) => ({ key: r.key, label: r.label, summary: r.summary, ci: r.ci })),
        rare: {
            products: rare.rare.size,
            limit: rare.limit,
            perMethod: Object.fromEntries(report.results.map((r) => [r.key, subgroupSummary(report.perQuery[r.label], (q) => rare.rare.has(q.query))])),
        },
    };
}

/** Gộp các bản tóm tắt (summarizeRun) của nhiều seed. */
function aggregateRuns(summaries) {
    const keys = summaries[0].results.map((r) => r.key);
    const methods = keys.map((key) => {
        const per = summaries.map((s) => s.results.find((r) => r.key === key));
        const metrics = {};
        for (const m of METRICS) metrics[m] = describe(per.map((r) => r.summary[m]));
        // KTC 95% bootstrap theo cụm đơn hàng trong từng seed (Bước 1), lấy trung bình cận dưới/cận trên qua seed.
        const orderBootstrap = {};
        for (const [field, name] of [["precision", "precision"], ["recall", "recall"], ["hit", "hitRate"]]) {
            orderBootstrap[name] = { low: mean(per.map((r) => r.ci[field].low)), high: mean(per.map((r) => r.ci[field].high)), halfWidth: mean(per.map((r) => (r.ci[field].high - r.ci[field].low) / 2)) };
        }
        const rare = summaries.map((s) => s.rare.perMethod[key]);
        return {
            key,
            label: per[0].label.replace(/\(tham số chọn trên validation: sup [0-9.]+, conf [0-9.]+\)/, "(tham số chọn trên validation)"),
            metrics,
            orderBootstrap,
            bootstrapHalfWidth: Object.fromEntries(Object.entries(orderBootstrap).map(([k, v]) => [k, v.halfWidth])),
            rareQueries: {
                queries: describe(rare.map((r) => r.queries)),
                recall: describe(rare.filter((r) => r.queries > 0).map((r) => r.recall)),
                hitRate: describe(rare.filter((r) => r.queries > 0).map((r) => r.hitRate)),
                ruleQueryRate: describe(rare.filter((r) => r.queries > 0).map((r) => r.ruleQueryRate)),
            },
        };
    });

    // Chênh lệch cặp theo seed: luật + fallback (tham số validation) so với các phương pháp khác.
    const reference = "tuned-with-fallback";
    const pairs = ["current-with-fallback", "co-occurrence", "most-popular", "category-based", "tuned-rules-only"].map((other) => {
        const diff = (metric) =>
            describe(summaries.map((s) => s.results.find((r) => r.key === reference).summary[metric] - s.results.find((r) => r.key === other).summary[metric]));
        return { a: reference, b: other, recall: diff("recall"), hitRate: diff("hitRate"), precision: diff("precision") };
    });

    return {
        seeds: summaries.map((s) => s.dataset.seed),
        datasets: summaries.map((s) => ({
            ...s.dataset,
            seconds: s.seconds ?? null,
            split: s.split,
            selected: s.tuning.selected,
            selectedOnGridEdge: s.tuning.selectedOnGridEdge,
            rareProducts: s.rare.products,
            rareLimit: s.rare.limit,
            algorithmsIdentical: s.algorithmsIdentical,
        })),
        methods,
        pairs,
    };
}

module.exports = { T975, describe, subgroupSummary, rareProductsOf, summarizeRun, aggregateRuns, METRICS };
