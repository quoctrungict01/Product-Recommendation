// Bước 2: bộ dữ liệu nghiên cứu R1/R1b, gộp kết quả nhiều seed, benchmark. Không cần MongoDB.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const mongoose = require("mongoose");

const { generateResearchDataset, generateProfileBaskets, PROFILES, RARE_PRODUCTS, RESEARCH_SEEDS } = require("../../research/datasets/generator");
const { generateOrderBaskets } = require("../../scripts/seed-demo/orders");
const { datasetFromSeedPlan } = require("../../research/evaluation/dataset");
const { describe, rareProductsOf, aggregateRuns, summarizeRun, subgroupSummary } = require("../../research/evaluation/aggregate");
const { estimateMiningCost, assertMiningBudget, MiningBudgetError } = require("../../research/evaluation/budget");
const { GENERATOR_VERSION, datasetMetadata } = require("../../research/datasets/generator");
const benchmarkCli = require("../../scripts/benchmark-research-datasets");
const { runEvaluation } = require("../../research/evaluation/runner");
const { temporalSplit } = require("../../research/evaluation/split");
const { DEMO_CHECKSUM, parseArgs } = require("../../scripts/evaluate-research-datasets");

const ROOT = path.join(__dirname, "..", "..");
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("Hồ sơ r1 tái tạo y hệt bộ sinh dữ liệu demo (cùng seed, cùng số đơn)", () => {
    for (const [seed, count] of [[20261026, 1000], [7, 2500]]) {
        assert.deepEqual(generateProfileBaskets({ profile: "r1", seed, count }), generateOrderBaskets({ seed, count }));
    }
});

test("Dữ liệu demo 1.000 đơn trên TrungShop không đổi (checksum Bước 1)", () => {
    assert.equal(datasetFromSeedPlan().checksum, DEMO_CHECKSUM);
    assert.equal(mongoose.connection.readyState, 0, "không mở kết nối MongoDB");
});

test("Cùng seed + cùng cấu hình -> cùng checksum; đổi seed, hồ sơ hoặc số đơn -> checksum khác", () => {
    const a = generateResearchDataset({ profile: "r1b", seed: 11, count: 3000 });
    const b = generateResearchDataset({ profile: "r1b", seed: 11, count: 3000 });
    assert.equal(a.checksum, b.checksum);
    assert.deepEqual(a.orders, b.orders);
    for (const other of [{ profile: "r1b", seed: 12, count: 3000 }, { profile: "r1", seed: 11, count: 3000 }, { profile: "r1b", seed: 11, count: 3001 }]) {
        assert.notEqual(generateResearchDataset(other).checksum, a.checksum, JSON.stringify(other));
    }
    assert.equal(RESEARCH_SEEDS.length, 5);
    assert.ok(!RESEARCH_SEEDS.includes(20261026), "seed nghiên cứu khác seed của GR2");
});

test("Cấu trúc dữ liệu: id đơn duy nhất, sắp theo thời gian, mọi item là sản phẩm của bộ dữ liệu, sản phẩm demo giữ _id GR2", () => {
    const demo = datasetFromSeedPlan();
    for (const profile of ["r1", "r1b"]) {
        const d = generateResearchDataset({ profile, seed: 5, count: 4000 });
        assert.equal(d.orders.length, 4000);
        assert.equal(new Set(d.orders.map((o) => o.id)).size, 4000);
        assert.ok(d.orders.every((o, i) => i === 0 || d.orders[i - 1].time <= o.time));
        const ids = new Set(d.products.map((p) => p._id));
        assert.ok(d.orders.every((o) => o.items.length >= 1 && o.items.every((x) => ids.has(x)) && new Set(o.items).size === o.items.length));
        const demoIds = new Set(demo.products.map((p) => p._id));
        assert.ok(d.products.filter((p) => !p.rare).every((p) => demoIds.has(p._id)));
        assert.equal(d.products.length, profile === "r1b" ? 41 + RARE_PRODUCTS.length : 41);
    }
});

test("R1b khó hơn R1: nhiều đơn 1 sản phẩm hơn và 7 sản phẩm hiếm chỉ có < 0,5% đơn", () => {
    const r1 = generateResearchDataset({ profile: "r1", seed: 20261101, count: 20000 });
    const r1b = generateResearchDataset({ profile: "r1b", seed: 20261101, count: 20000 });
    const multi = (d) => d.orders.filter((o) => o.items.length >= 2).length / d.orders.length;
    assert.ok(multi(r1b) < multi(r1));
    const counts = new Map();
    for (const o of r1b.orders) for (const x of o.items) counts.set(x, (counts.get(x) || 0) + 1);
    const rare = r1b.products.filter((p) => p.rare);
    assert.equal(rare.length, 7);
    for (const p of rare) {
        const c = counts.get(p._id) || 0;
        assert.ok(c > 0 && c < 0.005 * r1b.orders.length, `${p.name}: ${c}`);
    }
    const minBase = Math.min(...r1b.products.filter((p) => !p.rare).map((p) => counts.get(p._id) || 0));
    assert.ok(minBase > 0.01 * r1b.orders.length, "sản phẩm gốc không bị coi là hiếm");
    assert.equal(PROFILES.r1b.phoneShare + PROFILES.r1b.accessoryShare + PROFILES.r1b.rareShare < 0.76, true, "≥ 24% đơn nhiễu");
});

test("rareProductsOf chỉ dùng lịch sử (train ∪ validation), không dùng test", () => {
    const d = generateResearchDataset({ profile: "r1", seed: 3, count: 2000 });
    const split = temporalSplit(d.orders);
    const FUTURE = "e".repeat(24);
    const tampered = {
        ...d,
        products: [...d.products, { _id: FUTURE, name: "x", category_id: d.products[0].category_id, price: 1, is_stock: true }],
        // Sản phẩm FUTURE xuất hiện trong MỌI đơn test: nếu dùng test thì nó sẽ không bị coi là hiếm.
        orders: [...split.train, ...split.validation, ...split.test.map((o) => ({ ...o, items: [...o.items, FUTURE].sort() }))],
    };
    assert.ok(rareProductsOf(tampered).rare.has(FUTURE));
});

test("describe: trung bình, độ lệch chuẩn mẫu và KTC 95% theo t — tính tay", () => {
    const d = describe([1, 2, 3, 4, 5]);
    close(d.mean, 3);
    close(d.sd, Math.sqrt(2.5));
    close(d.ciHigh - d.mean, (2.776 * Math.sqrt(2.5)) / Math.sqrt(5));
    assert.deepEqual([d.min, d.max, d.n], [1, 5, 5]);
    assert.equal(describe([]).mean, null);
    assert.equal(describe([0.4]).sd, 0);
    const s = subgroupSummary(
        [
            { query: "a", precision: 0.2, recall: 1, hit: 1, ruleItems: 1 },
            { query: "b", precision: 0, recall: 0, hit: 0, ruleItems: 0 },
        ],
        (q) => q.query === "a"
    );
    assert.deepEqual(s, { queries: 1, precision: 0.2, recall: 1, hitRate: 1, ruleQueryRate: 1 });
});

test("aggregateRuns: gộp nhiều seed, đủ phương pháp, chênh lệch cặp nhất quán với từng seed", () => {
    const grid = { minSupport: [0.01, 0.02], minConfidence: [0.1] };
    const runs = [21, 22].map((seed) => {
        const dataset = generateResearchDataset({ profile: "r1b", seed, count: 1500 });
        return summarizeRun(dataset, runEvaluation(dataset, { grid, bootstrap: 30 }), rareProductsOf(dataset), { seconds: 1 });
    });
    assert.ok(JSON.stringify(runs).length < 200_000, "bản tóm tắt gọn, gửi được qua IPC");
    assert.ok(!("perQuery" in runs[0]) && !("orders" in runs[0].dataset && Array.isArray(runs[0].dataset.orders)));
    const agg = aggregateRuns(runs);
    assert.deepEqual(agg.seeds, [21, 22]);
    assert.equal(agg.methods.length, 8);
    for (const m of agg.methods) assert.ok(m.orderBootstrap.recall.low <= m.metrics.recall.mean + 1e-9 && m.metrics.recall.mean <= m.orderBootstrap.recall.high + 1e-9);
    const pick = (run, key) => run.results.find((r) => r.key === key).summary.recall;
    const pair = agg.pairs.find((p) => p.b === "current-with-fallback");
    close(pair.recall.mean, (pick(runs[0], "tuned-with-fallback") - pick(runs[0], "current-with-fallback") + pick(runs[1], "tuned-with-fallback") - pick(runs[1], "current-with-fallback")) / 2);
    const tuned = agg.methods.find((m) => m.key === "tuned-with-fallback");
    close(tuned.metrics.recall.mean, (pick(runs[0], "tuned-with-fallback") + pick(runs[1], "tuned-with-fallback")) / 2);
    assert.ok(agg.datasets.every((d) => d.algorithmsIdentical));
    assert.ok(agg.datasets.every((d) => d.rareProducts === 7));
});

test("CLI đánh giá: chọn từng bộ riêng, giới hạn tài nguyên, từ chối tham số sai", () => {
    assert.throws(() => parseArgs(["--profiles", "r9"]), /không hỗ trợ/);
    assert.throws(() => parseArgs(["--orders", "10"]));
    assert.throws(() => parseArgs(["--seeds", "0"]));
    assert.throws(() => parseArgs(["--seed", "abc"]));
    assert.throws(() => parseArgs(["--max-memory-mb", "64"]));
    assert.throws(() => parseArgs(["--timeout", "0"]));
    assert.throws(() => parseArgs(["--drop-db"]));
    const d = parseArgs([]);
    assert.deepEqual([d.orders, d.isolate, d.timeoutSec, d.maxMemoryMb], [20000, true, 600, 2048]);
    const one = parseArgs(["--profile", "r1b", "--seed", "20261103"]);
    assert.deepEqual([one.profiles, one.seeds], [["r1b"], [20261103]]);
    assert.equal(parseArgs(["--no-isolate"]).isolate, false);
});

test("CLI benchmark: sàn min_sup, chọn bộ riêng, giới hạn tài nguyên", () => {
    const { parseArgs: p, MIN_SUPPORT_FLOOR } = benchmarkCli;
    assert.throws(() => p(["--min-support", String(MIN_SUPPORT_FLOOR / 2)]), /min-support/);
    assert.throws(() => p(["--runs", "0"]));
    assert.throws(() => p(["--profile", "x"]));
    assert.equal(p([]).full, true);
    const one = p(["--profile", "r1", "--seed", "20261101"]);
    assert.deepEqual([one.profiles, one.seeds, one.full], [["r1"], [20261101], false]);
});

test("Metadata tái lập: phiên bản bộ sinh, SHA-1 cấu hình, checksum, thống kê", () => {
    const d = generateResearchDataset({ profile: "r1b", seed: 9, count: 2000 });
    const m = datasetMetadata(d);
    assert.equal(m.generatorVersion, GENERATOR_VERSION);
    assert.equal(m.config.generatorVersion, GENERATOR_VERSION, "phiên bản nằm trong cấu hình và checksum");
    assert.match(m.configSha1, /^[0-9a-f]{40}$/);
    assert.equal(m.checksum, d.checksum);
    assert.equal(m.stats.orders, 2000);
    assert.equal(m.stats.rareProductsInCatalog, 7);
    assert.ok(m.stats.maxItemsPerOrder <= 8);
    assert.ok(!("orders" in m) && !("products" in m), "metadata không chứa dữ liệu");
    assert.equal(generateResearchDataset({ profile: "r1b", seed: 9, count: 2000 }).configSha1, m.configSha1);
});

test("Kiểm tra ngân sách khai phá: ước lượng đúng và dừng trước khi bùng nổ", () => {
    const tx = [["a", "b", "c"], ["a", "b"], ["a"], ["d"]];
    const e = estimateMiningCost(tx, 2); // a:3, b:2 phổ biến
    assert.deepEqual([e.minSupportCount, e.items, e.frequentItems, e.candidatePairs, e.maxLength], [2, 4, 2, 1, 2]);
    assert.equal(e.upperBound, 3 + 3 + 1 + 0); // Σ (2^{|t∩F1|} − 1)
    assert.doesNotThrow(() => assertMiningBudget(tx, 2));

    // Giao dịch dài 30 item phổ biến: FP-Growth/Apriori có thể sinh 2^30 tập -> phải dừng trước khi khai phá.
    const long = Array.from({ length: 30 }, (_, i) => `x${i}`);
    const explode = Array.from({ length: 5 }, () => long);
    assert.throws(() => assertMiningBudget(explode, 2), (err) => err instanceof MiningBudgetError && /giao dịch dài 30/.test(err.message) && /cận trên/.test(err.message));
    assert.throws(() => assertMiningBudget(explode, 2, { maxTransactionLength: 100, maxItemsetUpperBound: 1000 }), /cận trên số tập phổ biến/);
    const wide = Array.from({ length: 3000 }, (_, i) => [`p${i}`, `q${i}`]);
    assert.throws(() => assertMiningBudget(wide, 1, { maxCandidatePairs: 1_000_000 }), /ứng viên 2-itemset/);

    // Dữ liệu R1/R1b thật với ngưỡng nhỏ nhất của lưới vẫn nằm trong ngân sách.
    const d = generateResearchDataset({ profile: "r1b", seed: 20261101, count: 20000 });
    const est = assertMiningBudget(d.orders.map((o) => o.items), 0.002);
    assert.ok(est.maxLength <= 8 && est.frequentItems <= 48);
});

test("Script đánh giá chạy riêng một bộ trong tiến trình con, có tiến độ, không ghi đè báo cáo đầy đủ", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-eval-test-"));
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "evaluate-research-datasets.js"), "--profile", "r1", "--seed", "7", "--orders", "600", "--bootstrap", "20", "--out", out], { encoding: "utf8", timeout: 180000 });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /\[1\/1\] R1-seed7-n600: bắt đầu/);
    assert.match(r.stderr, /chọn tham số trên validation/);
    assert.match(r.stderr, /tiến trình riêng, giới hạn 2048 MB heap và 600 s/);
    const files = fs.readdirSync(out);
    assert.ok(files.includes("phase4-step2-r1-evaluation-r1-seed7-n600.json"), files.join());
    assert.ok(!files.includes("phase4-step2-r1-evaluation.json") && !files.includes("phase4-step2-datasets.json"));
    const json = JSON.parse(fs.readFileSync(path.join(out, "phase4-step2-r1-evaluation-r1-seed7-n600.json"), "utf8"));
    assert.equal(json.datasets[0].generatorVersion, GENERATOR_VERSION);
    assert.equal(json.profiles.r1.datasets[0].algorithmsIdentical, true);
    fs.rmSync(out, { recursive: true, force: true });
});

test("Script đánh giá: quá thời gian thì dừng tiến trình con và báo lỗi, không treo", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-eval-test-"));
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "evaluate-research-datasets.js"), "--profile", "r1", "--seed", "7", "--orders", "5000", "--timeout", "0.5", "--out", out], { encoding: "utf8", timeout: 60000 });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /quá thời gian 0\.5 s/);
    fs.rmSync(out, { recursive: true, force: true });
});

test("Benchmark có kiểm soát chạy được với cấu hình nhỏ: kết quả Apriori = FP-Growth, ghi báo cáo, dọn thư mục tạm", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-bench-test-"));
    const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("trungshop-bench-") && !n.startsWith("trungshop-bench-test-")).length;
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "benchmark-research-datasets.js"), "--profiles", "r1b", "--seeds", "1", "--orders", "800", "--runs", "1", "--min-support", "0.05", "--out", out], { encoding: "utf8", timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[1\/1\] r1b seed 20261101 sup 0.05/);
    const base = "phase4-step2-benchmark-r1b-seed20261101-sup0.05-n800";
    const json = JSON.parse(fs.readFileSync(path.join(out, `${base}.json`), "utf8"));
    assert.equal(json.rows.length, 1);
    assert.equal(json.rows[0].identical, true);
    assert.equal(json.summary[0].allIdentical, true);
    assert.equal(json.settings.generatorVersion, GENERATOR_VERSION);
    assert.ok(fs.readFileSync(path.join(out, `${base}.md`), "utf8").includes("| r1b | 0.05 |"));
    const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("trungshop-bench-") && !n.startsWith("trungshop-bench-test-")).length;
    assert.equal(after, before, "thư mục tạm của benchmark đã được xóa");
    fs.rmSync(out, { recursive: true, force: true });
});
