// M1: ánh xạ luật danh mục về sản phẩm, chống rò rỉ dữ liệu, tái lập, chạy cách ly.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fitMultilevel, buildModel, multilevelRecommender, miningOptionsOf, POLICIES } = require("../../research/multilevel/recommender");
const { runMultilevelEvaluation, supportPairs } = require("../../research/multilevel/evaluate");
const { summarizeM1Run, aggregateM1Runs } = require("../../research/multilevel/aggregate");
const { toMarkdownM1 } = require("../../research/multilevel/report");
const { associationRuleRecommender } = require("../../research/evaluation/recommenders");
const { temporalSplit } = require("../../research/evaluation/split");
const { runInChild } = require("../../research/evaluation/child-process");
const { generateResearchDataset } = require("../../research/datasets/generator");
const { repeat } = require("./textbook");

// Danh mục nhỏ: điện thoại S (s1, s2, sR ít giao dịch), ốp lưng K (c1, c2, cR, c3 hết hàng), sạc H (ch1), khác X (x1).
const PRODUCTS = [
    ["s1", "S"], ["s2", "S"], ["sR", "S"], ["c1", "K"], ["c2", "K"], ["cR", "K"], ["c3", "K"], ["ch1", "H"], ["x1", "X"], ["z", "K"],
].map(([id, c]) => ({ _id: id, category_id: c, name: id, is_stock: id !== "c3" }));
const HISTORY = [
    ...repeat(60, ["s1", "c1"]),
    ...repeat(50, ["s2", "c2"]),
    ...repeat(20, ["s1", "ch1"]),
    ...repeat(20, ["s2", "ch1"]),
    ...repeat(2, ["sR", "ch1"]),
    ...repeat(1, ["sR", "cR"]),
    ...repeat(10, ["s1", "c3"]),
    ...repeat(37, ["x1"]),
].map((items, i) => ({ id: `o${i}`, time: i, items }));
const PARAMS = { productMinSupport: 0.05, categoryMinSupport: 0.05 };

test("M1: sản phẩm ít giao dịch không có luật cấp sản phẩm nhưng nhận gợi ý từ luật danh mục", () => {
    const flat = associationRuleRecommender({ minSupport: 0.05, minConfidence: 0, fallback: false }).fit(HISTORY, PRODUCTS);
    assert.deepEqual(flat.recommend("sR"), [], "hệ thống hiện tại không có luật cho sR (chỉ 3 đơn)");
    const model = buildModel(fitMultilevel(HISTORY, PRODUCTS, PARAMS), { fallback: false, policy: "specific-first" });
    const items = model.explain("sR");
    assert.deepEqual(items.map((x) => x.productId), ["c1", "c2", "ch1"]);
    for (const x of items) {
        assert.equal(x.source, "association-rule");
        assert.equal(x.level, "hierarchy");
        assert.deepEqual(x.rule.antecedent, ["C:S"], "luật xuất phát từ danh mục của sR");
    }
    const ids = items.map((x) => x.productId);
    assert.ok(!ids.includes("sR"), "không gợi ý chính sản phẩm đang xem");
    assert.ok(!ids.includes("c3"), "không gợi ý sản phẩm hết hàng");
    assert.ok(!ids.includes("cR"), "cR chỉ có 1 đơn cùng sR -> không đủ bằng chứng");
    assert.equal(new Set(ids).size, ids.length);
});

test("M1: điểm ánh xạ X ⇒ danh mục khớp confidence của luật cụ thể khi tập cụ thể phổ biến", () => {
    const fitted = fitMultilevel(HISTORY, PRODUCTS, PARAMS);
    for (const policy of POLICIES) {
        const [first] = buildModel(fitted, { fallback: false, policy }).explain("s1");
        assert.equal(first.productId, "c1");
        assert.equal(first.level, "product", "hòa điểm thì luật cụ thể hơn đứng trước");
        assert.ok(Math.abs(first.score - 60 / 90) < 1e-12, `${policy}: conf(s1 ⇒ c1) = 60/90`);
    }
    // Luật s1 ⇒ danh mục K ánh xạ về c1 cho đúng 60/90 (= conf(s1 ⇒ K) × sup(s1,c1)/sup(s1,K) = 70/90 × 60/70).
    const rule = fitted.mining.rules.find((r) => r.antecedent.join() === "P:s1" && r.consequent.join() === "C:K");
    assert.ok(Math.abs(rule.confidence * (fitted.mining.supportCount(["P:s1", "P:c1"]) / fitted.mining.supportCount(["P:s1", "C:K"])) - 60 / 90) < 1e-12);
});

test("M1 + fallback: đủ K gợi ý, phần thiếu dùng đúng fallback của website và được đánh dấu", () => {
    const model = buildModel(fitMultilevel(HISTORY, PRODUCTS, PARAMS), { fallback: true, k: 5 });
    const items = model.explain("sR");
    assert.equal(items.length, 5);
    assert.deepEqual(items.slice(3).map((x) => [x.productId, x.source, x.fallbackReason]), [["s1", "fallback", "same-category"], ["s2", "fallback", "same-category"]]);
});

test("M1 không dùng dữ liệu ngoài lịch sử: sản phẩm chưa từng bán trong lịch sử không bao giờ đến từ luật", () => {
    const model = buildModel(fitMultilevel(HISTORY, PRODUCTS, PARAMS), { fallback: false, k: 10 });
    for (const p of PRODUCTS) assert.ok(!model.recommend(p._id).some((x) => x.productId === "z"), `z xuất hiện khi xem ${p._id}`);
    assert.equal(fitMultilevel(HISTORY, PRODUCTS, PARAMS).mining.nodeCounts.get("P:z"), undefined);
});

test("Tham số M1: uniform khi hai ngưỡng bằng nhau, reduced khi ngưỡng danh mục lớn hơn; ngược lại bị từ chối", () => {
    assert.deepEqual(miningOptionsOf({ productMinSupport: 0.01 }), { algorithm: "fpgrowth", strategy: "uniform", minSupport: 0.01 });
    assert.deepEqual(miningOptionsOf({ productMinSupport: 0.01, categoryMinSupport: 0.05 }), { algorithm: "fpgrowth", strategy: "reduced", levelMinSupport: { 1: 0.05, 2: 0.01 } });
    assert.throws(() => multilevelRecommender({ productMinSupport: 0.05, categoryMinSupport: 0.01 }), /≥ ngưỡng cấp sản phẩm/);
    assert.deepEqual(supportPairs({ productMinSupport: [0.01, 0.05], categoryMinSupport: [null, 0.02, 0.05] }), [
        { productMinSupport: 0.01, categoryMinSupport: 0.01 },
        { productMinSupport: 0.01, categoryMinSupport: 0.02 },
        { productMinSupport: 0.01, categoryMinSupport: 0.05 },
        { productMinSupport: 0.05, categoryMinSupport: 0.05 },
    ]);
});

// ---------------------------------------------------------------- giao thức đánh giá

const SMALL = {
    bootstrap: 20,
    grid: { minSupport: [0.005, 0.01], minConfidence: [0, 0.2] },
    m1Grid: { productMinSupport: [0.005, 0.01], categoryMinSupport: [null, 0.05], minConfidence: [0, 0.2], policy: POLICIES },
};
const smallDataset = () => generateResearchDataset({ profile: "r1b", seed: 20261101, count: 3000 });

/** Bỏ các trường thời gian đo (…Ms, seconds) để so sánh hai lần chạy. */
function stripTimings(value) {
    if (Array.isArray(value)) return value.map(stripTimings);
    if (value && typeof value === "object" && !(value instanceof Map)) {
        return Object.fromEntries(Object.entries(value).filter(([k]) => !/Ms$|^seconds$/.test(k)).map(([k, v]) => [k, stripTimings(v)]));
    }
    return value;
}

test("Chống rò rỉ: khi chọn tham số M1 chỉ học trên train; khi chấm test chỉ học trên train ∪ validation", () => {
    const dataset = smallDataset();
    const split = temporalSplit(dataset.orders);
    const trainIds = new Set(split.train.map((o) => o.id));
    const historyIds = new Set([...split.train, ...split.validation].map((o) => o.id));
    const testIds = new Set(split.test.map((o) => o.id));
    const fits = [];
    runMultilevelEvaluation(dataset, { ...SMALL, observeFit: (phase, name, history) => fits.push({ phase, name, ids: history.map((o) => o.id) }) });
    const tuning = fits.filter((f) => f.phase === "tuning");
    const final = fits.filter((f) => f.phase === "final");
    assert.ok(tuning.some((f) => f.name === "m1") && final.some((f) => f.name.startsWith("m1-")), "M1 được theo dõi ở cả hai pha");
    for (const f of tuning) assert.ok(f.ids.every((id) => trainIds.has(id)), `${f.name} (tuning) học ngoài train`);
    for (const f of final) {
        assert.ok(f.ids.every((id) => historyIds.has(id)), `${f.name} (final) học ngoài train ∪ validation`);
        assert.ok(!f.ids.some((id) => testIds.has(id)), `${f.name} học từ đơn test`);
    }
});

test("Đánh giá M1: tái lập (chạy hai lần giống hệt), Apriori = FP-Growth, đủ phương pháp và nhóm hiếm", () => {
    const a = runMultilevelEvaluation(smallDataset(), SMALL);
    const b = runMultilevelEvaluation(smallDataset(), SMALL);
    const strip = (r) => stripTimings({ ...r, algorithmCheck: r.algorithmCheck.map(({ timings, ...x }) => x) });
    assert.deepEqual(strip(a), strip(b));
    assert.ok(a.algorithmCheck.every((x) => x.identical && x.rulesIdentical));
    assert.deepEqual(a.results.map((r) => r.key), [
        "category-based", "current-rules-only", "current-with-fallback", "tuned-rules-only", "tuned-with-fallback",
        "m1-website-rules-only", "m1-website-with-fallback", "m1-rules-only", "m1-with-fallback",
    ]);
    assert.ok(a.rare.count > 0, "R1b có sản phẩm ít giao dịch");
    const m1 = a.results.find((r) => r.key === "m1-with-fallback");
    assert.equal(m1.rare.queries, a.results.find((r) => r.key === "tuned-with-fallback").rare.queries);
    assert.ok(m1.summary.hierarchyRuleQueryRate >= 0 && m1.summary.hierarchyRuleQueryRate <= 1);
    assert.equal(a.results.find((r) => r.key === "tuned-with-fallback").summary.hierarchyRuleQueryRate, 0, "luật một cấp không có luật danh mục");
    const sel = a.tuning.m1.selected;
    assert.ok(SMALL.m1Grid.productMinSupport.includes(sel.productMinSupport) && SMALL.m1Grid.minConfidence.includes(sel.minConfidence));
    assert.equal(a.tuning.m1.miningRuns, 4);
    assert.equal(a.tuning.m1.configurations, 4 * 2 * 2);

    // Gộp seed và báo cáo chạy được trên bản tóm tắt.
    const summary = summarizeM1Run(a, { seconds: 1 });
    JSON.parse(JSON.stringify(summary)); // gửi được qua IPC
    const agg = aggregateM1Runs([summary, summary]);
    assert.equal(agg.methods.find((m) => m.key === "m1-with-fallback").metrics.recall.sd, 0);
    const md = toMarkdownM1({ meta: { generatedAt: "x", node: "v", command: "c", seconds: 1, datasetSeconds: 1 }, settings: { generatorVersion: "g", ratios: { train: 0.7, validation: 0.1, test: 0.2 }, k: 5, bootstrap: 20, rareThreshold: 0.005, m1Grid: SMALL.m1Grid }, datasetCheck: { comparedWithStep2: false, demoChecksumUnchanged: true }, failures: [], profiles: { r1b: agg } }, null);
    assert.match(md, /nhóm sản phẩm ít giao dịch/);
    assert.match(md, /Hạn chế/);
});

test("Script M1: tham số dòng lệnh và chạy một bộ trong tiến trình con có giới hạn thời gian", async () => {
    const { parseArgs } = require("../../scripts/evaluate-multilevel");
    assert.equal(parseArgs([]).full, true);
    const one = parseArgs(["--profile", "r1b", "--seed", "20261103"]);
    assert.deepEqual([one.profiles, one.seeds, one.full], [["r1b"], [20261103], false]);
    assert.throws(() => parseArgs(["--profile", "r9"]), /Hồ sơ/);
    assert.throws(() => parseArgs(["--orders", "5"]), /--orders/);
    const bench = require("../../scripts/benchmark-multilevel");
    assert.throws(() => bench.parseArgs(["--min-support", "0.0001"]), /min-support/);
    assert.equal(bench.parseArgs([]).full, true);

    const script = path.join(__dirname, "../../scripts/evaluate-multilevel.js");
    const job = { profile: "r1b", seed: 20261101, orders: 1500, bootstrap: 20 };
    const ok = await runInChild(script, job, { timeoutSec: 120, maxMemoryMb: 512 });
    assert.ok(!ok.error, ok.error);
    assert.equal(ok.summary.dataset.orders, 1500);
    const slow = await runInChild(script, job, { timeoutSec: 0.2, maxMemoryMb: 512 });
    assert.match(slow.error, /quá thời gian/);
});

test("Benchmark M1: đo trong tiến trình hiện tại trên file tạm, Apriori = FP-Growth trên giao dịch đa mức", () => {
    const { measureInChild } = require("../../scripts/benchmark-multilevel");
    const { hierarchyFromCatalog, extendTransactions } = require("../../research/multilevel/hierarchy");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-m1-test-"));
    try {
        const dataset = generateResearchDataset({ profile: "r1b", seed: 20261102, count: 1000 });
        const catalog = hierarchyFromCatalog(dataset.products);
        const file = path.join(dir, "ml.json");
        fs.writeFileSync(file, JSON.stringify({ transactions: extendTransactions(dataset.orders.map((o) => o.items), catalog.hierarchy, catalog.toNode) }));
        const a = measureInChild({ mode: "itemsets", algorithm: "apriori", file, minSupport: 0.01, runs: 2 });
        const f = measureInChild({ mode: "itemsets", algorithm: "fpgrowth", file, minSupport: 0.01, runs: 2 });
        assert.equal(a.checksum, f.checksum);
        assert.ok(a.itemsets > 0 && a.medianMs >= 0);
        const m1File = path.join(dir, "m1.json");
        fs.writeFileSync(m1File, JSON.stringify({ history: dataset.orders, products: dataset.products }));
        const full = measureInChild({ mode: "full-m1", algorithm: "fpgrowth", file: m1File, minSupport: 0.01, runs: 1 });
        assert.ok(full.rules > 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
