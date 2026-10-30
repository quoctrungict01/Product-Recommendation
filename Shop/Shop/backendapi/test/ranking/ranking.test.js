// M3: độ đo theo giáo trình, chiến lược xếp hạng, đa dạng hóa, nhãn fallback, chống rò rỉ, tái lập.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { candidateMeasures, rankCandidates, diversifiedTopK, scoreOf } = require("../../research/ranking/strategies");
const { fitBase, buildRanked, BASES } = require("../../research/ranking/recommender");
const { runRankingEvaluation, RECALL_TOLERANCE, rankConfigs } = require("../../research/ranking/evaluate");
const { summarizeM3Run, aggregateM3Runs } = require("../../research/ranking/aggregate");
const { toMarkdownM3 } = require("../../research/ranking/report");
const { associationRuleRecommender } = require("../../research/evaluation/recommenders");
const { multilevelRecommender, POLICIES } = require("../../research/multilevel/recommender");
const CR = require("../../research/constraints/recommender");
const { temporalSplit } = require("../../research/evaluation/split");
const { runInChild } = require("../../research/evaluation/child-process");
const { generateResearchDataset } = require("../../research/datasets/generator");

// Bảng 6.9: mc, m¬c, ¬mc, ¬m¬c -> sup(m) = mc + m¬c, sup(c) = mc + ¬mc, N = tổng.
const TABLE_6_9 = {
    D1: [10000, 1000, 1000, 100000, { lift: 9.26, kulc: 0.91 }],
    D2: [10000, 1000, 1000, 100, { lift: 1, kulc: 0.91 }],
    D3: [100, 1000, 1000, 100000, { kulc: 0.09 }],
    D4: [1000, 1000, 1000, 100000, { kulc: 0.5, ir: 0 }],
    D5: [1000, 100, 10000, 100000, { kulc: 0.5, ir: 0.89 }],
    D6: [1000, 10, 100000, 100000, { kulc: 0.5, ir: 0.99 }],
};

test("Bảng 6.9 / Ví dụ 6.10–6.11: Kulc và IR null-invariant, lift thì không", () => {
    for (const [name, [mc, mnc, nmc, nmnc, expected]] of Object.entries(TABLE_6_9)) {
        const m = candidateMeasures({ joint: mc, supX: mc + mnc, supQ: mc + nmc }, mc + mnc + nmc + nmnc);
        if (expected.kulc !== undefined) assert.ok(Math.abs(m.kulczynski - expected.kulc) < 0.006, `${name} Kulc ${m.kulczynski}`);
        if (expected.ir !== undefined) assert.ok(Math.abs(m.imbalanceRatio - expected.ir) < 0.006, `${name} IR ${m.imbalanceRatio}`);
        if (expected.lift !== undefined) assert.ok(Math.abs(m.lift - expected.lift) < 0.01, `${name} lift ${m.lift}`);
    }
    // D1 và D2 chỉ khác số giao dịch rỗng: Kulc giống nhau, lift khác hẳn.
    const d1 = candidateMeasures({ joint: 10000, supX: 11000, supQ: 11000 }, 112000);
    const d2 = candidateMeasures({ joint: 10000, supX: 11000, supQ: 11000 }, 12100);
    assert.equal(d1.kulczynski, d2.kulczynski);
    assert.equal(d1.imbalanceRatio, d2.imbalanceRatio);
    assert.ok(d1.lift > 9 && d2.lift < 1.01);
});

const CANDS = [
    // q1: phổ biến (charger), q2: đặc thù (ốp), q3: trung bình
    { productId: "q1", joint: 40, supX: 100, supQ: 800 },
    { productId: "q2", joint: 30, supX: 100, supQ: 35 },
    { productId: "q3", joint: 20, supX: 100, supQ: 100 },
];

test("Chiến lược xếp hạng: γ = 0 là confidence, γ = 1 là lift; Kulc ưu tiên phụ kiện đặc thù; native giữ thứ tự", () => {
    const order = (params) => rankCandidates(CANDS, 1000, params).map((x) => x.productId);
    assert.deepEqual(order({ strategy: "native" }), ["q1", "q2", "q3"]);
    assert.deepEqual(order({ strategy: "confidence" }), ["q1", "q2", "q3"]);
    assert.deepEqual(order({ strategy: "popularity", gamma: 0 }), order({ strategy: "confidence" }));
    const byLift = [...CANDS].sort((a, b) => candidateMeasures(b, 1000).lift - candidateMeasures(a, 1000).lift).map((x) => x.productId);
    assert.deepEqual(order({ strategy: "popularity", gamma: 1 }), byLift);
    assert.equal(order({ strategy: "kulc-ir", beta: 0 })[0], "q2", "Kulc: P(X|q) của ốp đặc thù cao");
    const m = candidateMeasures(CANDS[0], 1000);
    assert.equal(scoreOf("kulc-ir", m, { beta: 0 }), m.kulczynski);
    assert.ok(scoreOf("kulc-ir", m, { beta: 1 }) < m.kulczynski, "IR lớn làm giảm điểm");
    assert.throws(() => rankCandidates(CANDS, 1000, { strategy: "lạ" }), /không hỗ trợ/);
});

test("Đa dạng hóa: λ = 1 giữ nguyên thứ tự; λ nhỏ đưa danh mục mới lên trước; luôn tất định", () => {
    const cat = { a1: "A", a2: "A", a3: "A", b1: "B", c1: "C" };
    const ranked = ["a1", "a2", "a3", "b1", "c1"].map((productId) => ({ productId }));
    const ids = (lambda) => diversifiedTopK(ranked, 3, lambda, (id) => cat[id]).map((x) => x.productId);
    assert.deepEqual(ids(1), ["a1", "a2", "a3"]);
    assert.deepEqual(ids(0.25), ["a1", "b1", "c1"]);
    assert.deepEqual(ids(0.9), ["a1", "a2", "a3"], "λ lớn: phạt nhỏ hơn chênh lệch thứ hạng");
    assert.deepEqual(ids(0.25), ids(0.25));
    assert.throws(() => diversifiedTopK(ranked, 3, 2, (id) => cat[id]), /λ/);
});

const d = (count = 3000, seed = 20261101) => generateResearchDataset({ profile: "r1b", seed, count });

test("Thứ tự native của M3 cho đúng y hệt phương pháp nền (website, M2, M1, M2 + M1)", () => {
    const ds = d(4000);
    const h = temporalSplit(ds.orders).train;
    const P = ds.products;
    const J = (m) => JSON.stringify(P.map((p) => m.recommend(p._id)));
    const fp = { minSupport: 0.005, minConfidence: 0.05 };
    const mp = { productMinSupport: 0.005, categoryMinSupport: 0.02, minConfidence: 0, policy: POLICIES[0] };
    assert.equal(J(buildRanked(fitBase("flat", h, P, fp))), J(associationRuleRecommender({ ...fp, fallback: true }).fit(h, P)));
    assert.equal(J(buildRanked(fitBase("m2-flat", h, P, fp))), J(CR.constrainedFlatRecommender({ ...fp, fallback: true }).fit(h, P)));
    assert.equal(J(buildRanked(fitBase("m1", h, P, mp))), J(multilevelRecommender({ ...mp, fallback: true }).fit(h, P)));
    assert.equal(J(buildRanked(fitBase("m2-m1", h, P, mp))), J(CR.constrainedMultilevelRecommender({ ...mp, fallback: true }).fit(h, P)));
});

test("Giải thích được và không nhầm fallback thành luật (mọi nền, mọi chiến lược, kể cả đa dạng hóa fallback)", () => {
    const ds = d(3000);
    const h = temporalSplit(ds.orders).train;
    const params = { flat: { minSupport: 0.005, minConfidence: 0.2 }, "m2-flat": { minSupport: 0.005, minConfidence: 0.2 }, m1: { productMinSupport: 0.005, categoryMinSupport: 0.02, minConfidence: 0.2, policy: "specific-first" }, "m2-m1": { productMinSupport: 0.005, categoryMinSupport: 0.02, minConfidence: 0.2, policy: "specific-first" } };
    let fallbacks = 0;
    for (const base of BASES) {
        const fitted = fitBase(base, h, ds.products, params[base]);
        for (const rank of [{ strategy: "native", lambda: 1 }, { strategy: "kulc-ir", beta: 0.5, lambda: 0.5 }, { strategy: "popularity", gamma: 1, lambda: 0.25 }]) {
            const model = buildRanked(fitted, rank);
            for (const p of ds.products) {
                const cand = new Set(fitted.candidatesOf(p._id).map((c) => c.productId));
                const list = model.explain(p._id);
                assert.equal(list.length, 5);
                assert.equal(new Set(list.map((x) => x.productId)).size, 5);
                assert.ok(!list.some((x) => x.productId === p._id));
                let seenFallback = false;
                for (const x of list) {
                    if (x.source === "association-rule") {
                        assert.ok(!seenFallback, "gợi ý từ luật luôn đứng trước fallback");
                        assert.ok(cand.has(x.productId) && x.rule && x.measures, "luật nguồn và độ đo");
                        for (const f of ["confidence", "lift", "kulczynski", "imbalanceRatio", "popularity"]) assert.equal(typeof x.measures[f], "number");
                        assert.ok(x.rule.antecedent.length === 1 && x.rule.consequent.length === 1);
                    } else {
                        seenFallback = true;
                        fallbacks++;
                        assert.equal(x.source, "fallback");
                        assert.equal(x.rule, null);
                        assert.ok(!cand.has(x.productId), "fallback không được là ứng viên từ luật");
                    }
                }
            }
        }
    }
    assert.ok(fallbacks > 0, "có trường hợp fallback để kiểm tra");
});

const SMALL = {
    bootstrap: 20,
    grid: { minSupport: [0.005, 0.01], minConfidence: [0, 0.2] },
    m1Grid: { productMinSupport: [0.005, 0.01], categoryMinSupport: [null, 0.05], minConfidence: [0, 0.2], policy: POLICIES },
    rankGrid: { strategies: [{ strategy: "native" }, { strategy: "kulc-ir", beta: 0.5 }, { strategy: "popularity", gamma: 1 }], lambda: [1, 0.5] },
};

function stripTimings(value) {
    if (Array.isArray(value)) return value.map(stripTimings);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !/Ms$|MsPerList$|^seconds$/.test(k)).map(([k, v]) => [k, stripTimings(v)]));
    return value;
}

test("Chống rò rỉ: mọi lần học khi chọn tham số chỉ dùng train; khi chấm test chỉ dùng train ∪ validation", () => {
    const ds = d();
    const split = temporalSplit(ds.orders);
    const trainIds = new Set(split.train.map((o) => o.id));
    const testIds = new Set(split.test.map((o) => o.id));
    const fits = [];
    runRankingEvaluation(ds, { ...SMALL, observeFit: (phase, name, history) => fits.push({ phase, name, ids: history.map((o) => o.id) }) });
    for (const base of BASES) assert.ok(fits.some((f) => f.phase === "tuning" && f.name === `m3-${base}`) && fits.some((f) => f.phase === "final" && f.name === `m3-${base}`));
    for (const f of fits.filter((x) => x.phase === "tuning")) assert.ok(f.ids.every((id) => trainIds.has(id)), `${f.name} học ngoài train`);
    for (const f of fits) assert.ok(!f.ids.some((id) => testIds.has(id)), `${f.name} học từ đơn test`);
});

test("Đánh giá M3 tái lập; M3-C tuân thủ ngưỡng sụt Recall; không nhãn fallback sai; báo cáo chạy được", () => {
    const a = runRankingEvaluation(d(), SMALL);
    const b = runRankingEvaluation(d(), SMALL);
    assert.deepEqual(stripTimings(a), stripTimings(b));
    assert.equal(rankConfigs(SMALL.rankGrid).length, 6);
    for (const base of BASES) {
        const t = a.tuning[base];
        const key = (c) => `${c.strategy}|${c.beta}|${c.gamma}|${c.lambda}`;
        const R = t.rows.find((r) => key(r) === key(t.R));
        const Cr = t.rows.find((r) => key(r) === key(t.C));
        assert.ok(t.rows.every((r) => r.recall <= R.recall + 1e-12), `${base}: M3-R có Recall validation cao nhất`);
        assert.ok(Cr.recall >= R.recall - RECALL_TOLERANCE - 1e-12, `${base}: M3-C không sụt quá ngưỡng`);
        assert.ok(t.rows.filter((r) => r.recall >= R.recall - RECALL_TOLERANCE - 1e-12).every((r) => r.coverage <= Cr.coverage + 1e-12));
    }
    assert.ok(a.results.every((r) => r.summary.mislabeledFallback === 0 || r.summary.mislabeledFallback === undefined));
    for (const k of ["flat:native", "flat:kulc-ir", "flat:popularity", "flat:diversified", "flat:m3R", "flat:m3C", "m1:m3R", "m2-flat:m3C", "m2-m1:m3R"]) assert.ok(a.results.some((r) => r.key === k), k);
    const agg = aggregateM3Runs([summarizeM3Run(a, { seconds: 1 }), summarizeM3Run(b, { seconds: 1 })]);
    JSON.parse(JSON.stringify(agg));
    const md = toMarkdownM3({ meta: { generatedAt: "x", node: "v", command: "c", seconds: 1, datasetSeconds: 1 }, settings: { generatorVersion: "g", bootstrap: 20, rareThreshold: 0.005, recallTolerance: RECALL_TOLERANCE }, datasetCheck: { comparedWithStep2: false, demoChecksumUnchanged: true }, failures: [], profiles: { r1b: agg } });
    assert.match(md, /bảng so sánh M1, M2, M3/);
    assert.match(md, /không có trong giáo trình/);
});

test("Script M3: tham số dòng lệnh, chạy một bộ trong tiến trình con, dừng khi quá thời gian", async () => {
    const { parseArgs } = require("../../scripts/evaluate-ranking");
    assert.equal(parseArgs([]).full, true);
    assert.equal(parseArgs(["--profile", "r1b", "--seed", "20261103"]).full, false);
    assert.throws(() => parseArgs(["--profile", "x"]), /Hồ sơ/);
    const script = path.join(__dirname, "../../scripts/evaluate-ranking.js");
    const job = { profile: "r1b", seed: 20261101, orders: 1500, bootstrap: 20 };
    const ok = await runInChild(script, job, { timeoutSec: 180, maxMemoryMb: 512 });
    assert.ok(!ok.error, ok.error);
    assert.equal(ok.summary.dataset.orders, 1500);
    const slow = await runInChild(script, job, { timeoutSec: 0.2, maxMemoryMb: 512 });
    assert.match(slow.error, /quá thời gian/);
});
