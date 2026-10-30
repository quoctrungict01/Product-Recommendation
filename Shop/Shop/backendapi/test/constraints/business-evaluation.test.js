// M2 trên TrungShop: ràng buộc nghiệp vụ, cắt tỉa = hậu lọc trong bộ gợi ý, chống rò rỉ, tái lập, chạy cách ly.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { modelOf, buildBusinessRules } = require("../../research/constraints/business");
const R = require("../../research/constraints/recommender");
const { runConstraintEvaluation } = require("../../research/constraints/evaluate");
const { summarizeM2Run, aggregateM2Runs } = require("../../research/constraints/aggregate");
const { toMarkdownM2 } = require("../../research/constraints/report");
const { POLICIES } = require("../../research/multilevel/recommender");
const { temporalSplit } = require("../../research/evaluation/split");
const { runInChild } = require("../../research/evaluation/child-process");
const { generateResearchDataset } = require("../../research/datasets/generator");
const { createRandom } = require("../../src/apps/services/mining/synthetic");

const dataset = (count = 3000, seed = 20261101) => generateResearchDataset({ profile: "r1b", seed, count });
const byName = (products, name) => products.find((p) => p.name === name)._id;

test("Dòng máy của ốp lưng/kính cường lực được đọc từ tên; phụ kiện khác dùng chung", () => {
    assert.equal(modelOf("Ốp lưng silicon iPhone 15"), "iphone 15");
    assert.equal(modelOf("Ốp lưng trong suốt iPhone 14 series"), "iphone 14");
    assert.equal(modelOf("Kính cường lực Redmi Note 13 Pro series"), "redmi note 13 pro");
    assert.equal(modelOf("Củ sạc nhanh USB-C 20W"), null);
    assert.equal(modelOf("Tai nghe Apple AirPods 2"), null);
});

test("Ràng buộc luật A2–A4: điện thoại ⇒ phụ kiện, đúng dòng máy, còn hàng", () => {
    const products = dataset(10).products.map((p) => (p.name === "Kính cường lực iPhone 15" ? { ...p, is_stock: false } : p));
    const b = buildBusinessRules(products);
    const id = (n) => byName(products, n);
    assert.ok(b.ruleAllowed(id("iPhone 15 128GB"), id("Ốp lưng silicon iPhone 15")));
    assert.ok(!b.ruleAllowed(id("iPhone 15 128GB"), id("iPhone 13 128GB")), "A2: không gợi ý điện thoại khi xem điện thoại");
    assert.equal(b.violation(id("iPhone 15 128GB"), id("iPhone 13 128GB")), "A2-điện-thoại⇒điện-thoại");
    assert.ok(!b.ruleAllowed(id("Samsung Galaxy S24 Ultra 256GB"), id("Ốp lưng silicon iPhone 15")), "A3: ốp iPhone cho máy Samsung");
    assert.ok(!b.ruleAllowed(id("iPhone 13 128GB"), id("Ốp lưng silicon iPhone 15")), "A3: ốp iPhone 15 không hợp iPhone 13");
    assert.ok(b.ruleAllowed(id("iPhone 14 Plus 128GB"), id("Ốp lưng trong suốt iPhone 14 series")));
    assert.ok(b.ruleAllowed(id("Samsung Galaxy S24 Ultra 256GB"), id("Củ sạc nhanh USB-C 20W")), "phụ kiện dùng chung hợp mọi máy");
    assert.ok(!b.ruleAllowed(id("iPhone 15 128GB"), id("Kính cường lực iPhone 15")), "A4: hết hàng");
    assert.ok(b.ruleAllowed(id("Ốp lưng silicon iPhone 15"), id("iPhone 15 128GB")), "xem phụ kiện có thể gợi ý đúng máy");
    assert.ok(!b.ruleAllowed(id("Ốp lưng silicon iPhone 15"), id("Ốp lưng Galaxy S24 Ultra")), "hai ốp không cùng hợp máy nào");
});

test("Ràng buộc tập mục B1–B3 trên danh mục thật là anti-monotone (kiểm tra ngẫu nhiên trên tập cha)", () => {
    const products = dataset(10).products;
    const b = buildBusinessRules(products);
    const ids = products.map((p) => p._id);
    const constraints = b.itemsetConstraints();
    const r = createRandom(3);
    let violations = 0;
    for (let n = 0; n < 2000; n++) {
        const s = [...new Set(Array.from({ length: 1 + Math.floor(r() * 3) }, () => ids[Math.floor(r() * ids.length)]))];
        const t = [...new Set([...s, ...Array.from({ length: 1 + Math.floor(r() * 3) }, () => ids[Math.floor(r() * ids.length)])])];
        for (const c of constraints) {
            assert.ok(c.pushable, c.name);
            if (!c.test(s)) {
                violations++;
                assert.ok(!c.test(t), `${c.name}: tập cha của tập vi phạm phải vi phạm`);
            }
        }
    }
    assert.ok(violations > 100);
});

test("M2 một cấp: cắt tỉa và hậu lọc cho cùng tập mục, cùng luật, cùng gợi ý; mọi gợi ý thỏa A2–A4", () => {
    const d = dataset();
    const history = temporalSplit(d.orders).train;
    const b = buildBusinessRules(d.products);
    for (const algorithm of ["apriori", "fpgrowth"]) {
        const push = R.fitConstrainedFlat(history, d.products, { algorithm, minSupport: 0.005, mode: "push" });
        const post = R.fitConstrainedFlat(history, d.products, { algorithm, minSupport: 0.005, mode: "post" });
        assert.deepEqual(push.itemsets, post.itemsets, algorithm);
        assert.deepEqual(push.rules, post.rules);
        assert.ok(post.stats.postFilteredOut > 0, "có tập bị ràng buộc loại");
        const m1 = R.constrainedFlatModel(push, { fallback: true });
        const m2 = R.constrainedFlatModel(post, { fallback: true });
        for (const p of d.products) {
            const list = m1.recommend(p._id);
            assert.deepEqual(list, m2.recommend(p._id));
            assert.ok(list.length <= 5);
            for (const x of list) assert.ok(b.ruleAllowed(p._id, x.productId), `${p.name} ⇒ ${x.productId} vi phạm`);
        }
    }
});

test("M2 + M1: cắt tỉa = hậu lọc trên giao dịch đa mức; không gợi ý vi phạm; không có tập tầm thường", () => {
    const d = dataset();
    const history = temporalSplit(d.orders).train;
    const b = buildBusinessRules(d.products);
    const params = { productMinSupport: 0.005, categoryMinSupport: 0.02 };
    const push = R.fitConstrainedMultilevel(history, d.products, params, "push");
    const post = R.fitConstrainedMultilevel(history, d.products, params, "post");
    assert.deepEqual(push.fitted.mining.itemsets, post.fitted.mining.itemsets);
    assert.equal(push.fitted.mining.stats.trivialRemoved, 0, "tập tầm thường đã bị cắt tỉa ngay khi khai phá");
    assert.ok(push.fitted.mining.stats.algorithmStats.prunedBaseItems + push.fitted.mining.stats.algorithmStats.prunedPatterns > 0);
    for (const policy of POLICIES) {
        const a = R.constrainedMultilevelModel(push, { policy });
        const c = R.constrainedMultilevelModel(post, { policy });
        for (const p of d.products) {
            assert.deepEqual(a.recommend(p._id), c.recommend(p._id));
            for (const x of a.recommend(p._id)) assert.ok(b.ruleAllowed(p._id, x.productId));
        }
    }
});

const SMALL = {
    bootstrap: 20,
    grid: { minSupport: [0.005, 0.01], minConfidence: [0, 0.2] },
    m1Grid: { productMinSupport: [0.005, 0.01], categoryMinSupport: [null, 0.05], minConfidence: [0, 0.2], policy: POLICIES },
};

function stripTimings(value) {
    if (Array.isArray(value)) return value.map(stripTimings);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !/Ms$|^seconds$|^fitMs$/.test(k)).map(([k, v]) => [k, stripTimings(v)]));
    return value;
}

test("Chống rò rỉ: chọn tham số M2 chỉ học trên train; chấm test chỉ học trên train ∪ validation", () => {
    const d = dataset();
    const split = temporalSplit(d.orders);
    const trainIds = new Set(split.train.map((o) => o.id));
    const testIds = new Set(split.test.map((o) => o.id));
    const fits = [];
    runConstraintEvaluation(d, { ...SMALL, observeFit: (phase, name, history) => fits.push({ phase, name, ids: history.map((o) => o.id) }) });
    assert.ok(fits.some((f) => f.phase === "tuning" && f.name === "m2-flat") && fits.some((f) => f.phase === "tuning" && f.name === "m2-m1"));
    assert.ok(fits.some((f) => f.phase === "final" && f.name.startsWith("m2-")));
    for (const f of fits.filter((x) => x.phase === "tuning")) assert.ok(f.ids.every((id) => trainIds.has(id)), `${f.name} học ngoài train`);
    for (const f of fits) assert.ok(!f.ids.some((id) => testIds.has(id)), `${f.name} học từ đơn test`);
});

test("Đánh giá M2 tái lập; cắt tỉa = hậu lọc lúc chạy; M2 không vi phạm; tóm tắt và báo cáo chạy được", () => {
    const strip = (r) => stripTimings({ ...r, constraintCheck: { identical: r.constraintCheck.identical, sha: Object.fromEntries(Object.entries(r.constraintCheck.results).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([x, y]) => [x, [y.itemsetsSha, y.listsSha, y.stats]]))])) } });
    const a = runConstraintEvaluation(dataset(), SMALL);
    const b = runConstraintEvaluation(dataset(), SMALL);
    assert.deepEqual(strip(a), strip(b));
    assert.deepEqual(a.constraintCheck.identical, { flat: true, multilevel: true });
    for (const key of ["m2-flat-rules-only", "m2-flat-with-fallback", "m2-m1-rules-only", "m2-m1-with-fallback"]) {
        const r = a.results.find((x) => x.key === key);
        assert.equal(r.summary.plausibleItemRate, 1, key);
        assert.deepEqual(r.violations, {});
    }
    assert.ok(a.results.find((x) => x.key === "tuned-with-fallback").summary.plausibleItemRate < 1, "luật một cấp có gợi ý vi phạm");
    const s = summarizeM2Run(a, { seconds: 1 });
    JSON.parse(JSON.stringify(s));
    const agg = aggregateM2Runs([s, s]);
    const md = toMarkdownM2({ meta: { generatedAt: "x", node: "v", command: "c", seconds: 1, datasetSeconds: 1 }, settings: { generatorVersion: "g", ratios: { train: 0.7, validation: 0.1, test: 0.2 }, k: 5, bootstrap: 20, rareThreshold: 0.005 }, datasetCheck: { comparedWithStep2: false, demoChecksumUnchanged: true }, failures: [], profiles: { r1b: agg } }, null);
    assert.match(md, /Phân loại ràng buộc/);
    assert.match(md, /Hạn chế/);
});

test("Script M2: tham số dòng lệnh, chạy một bộ trong tiến trình con có giới hạn thời gian, benchmark đo được", async () => {
    const { parseArgs } = require("../../scripts/evaluate-constraints");
    assert.equal(parseArgs([]).full, true);
    assert.equal(parseArgs(["--profile", "r1", "--seed", "20261102"]).full, false);
    assert.throws(() => parseArgs(["--bootstrap", "1"]), /--bootstrap/);
    const bench = require("../../scripts/benchmark-constraints");
    assert.throws(() => bench.parseArgs(["--min-support", "0.0001"]), /min-support/);

    const script = path.join(__dirname, "../../scripts/evaluate-constraints.js");
    const job = { profile: "r1b", seed: 20261101, orders: 1500, bootstrap: 20 };
    const ok = await runInChild(script, job, { timeoutSec: 180, maxMemoryMb: 512 });
    assert.ok(!ok.error, ok.error);
    assert.equal(ok.summary.dataset.orders, 1500);
    const slow = await runInChild(script, job, { timeoutSec: 0.2, maxMemoryMb: 512 });
    assert.match(slow.error, /quá thời gian/);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-m2-test-"));
    try {
        const d = dataset(1000, 20261102);
        const file = path.join(dir, "flat.json");
        fs.writeFileSync(file, JSON.stringify({ transactions: d.orders.map((o) => o.items), products: d.products }));
        const post = bench.measureInChild({ file, level: "flat", algorithm: "apriori", mode: "post", minSupport: 0.01, runs: 2 });
        const push = bench.measureInChild({ file, level: "flat", algorithm: "apriori", mode: "push", minSupport: 0.01, runs: 2 });
        assert.equal(post.checksum, push.checksum);
        assert.ok(post.wrapperEqualsOriginal);
        assert.ok(push.countedCandidates <= post.countedCandidates);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
