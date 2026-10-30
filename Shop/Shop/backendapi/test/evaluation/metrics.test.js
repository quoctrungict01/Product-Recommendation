const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreList, evaluateRecommender, bootstrapCI, pairedBootstrapDiff } = require("../../research/evaluation/metrics");

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} != ${b}`);

test("scoreList: Precision chia cho K cố định, Recall chia cho số đáp án, Hit nhị phân", () => {
    assert.deepEqual(scoreList(["a", "b", "c", "d", "e"], ["b", "e", "z"], 5), { hits: 2, precision: 0.4, recall: 2 / 3, hit: 1 });
    assert.deepEqual(scoreList(["a"], ["a", "b"], 5), { hits: 1, precision: 0.2, recall: 0.5, hit: 1 }); // danh sách ngắn
    assert.deepEqual(scoreList([], ["a"], 5), { hits: 0, precision: 0, recall: 0, hit: 0 });
    assert.deepEqual(scoreList(["x", "y"], ["a"], 5), { hits: 0, precision: 0, recall: 0, hit: 0 });
});

test("evaluateRecommender: chỉ số trung bình, coverage, tỷ lệ truy vấn có luật — tính tay", () => {
    const lists = {
        p1: [{ productId: "a", source: "association-rule" }, { productId: "b", source: "fallback" }],
        p2: [{ productId: "c", source: "fallback" }],
        p3: [{ productId: "a", source: "association-rule" }, { productId: "d", source: "association-rule" }, { productId: "x", source: "fallback" }],
    };
    const queries = [
        { orderId: "o1", query: "p1", truth: ["a"] }, // trúng 1/1
        { orderId: "o1", query: "p2", truth: ["a", "b"] }, // trúng 0/2
        { orderId: "o2", query: "p3", truth: ["d", "e"] }, // trúng 1/2
    ];
    const { summary, perQuery } = evaluateRecommender({ recommend: (q) => lists[q] }, queries, { k: 5, catalogSize: 10 });
    close(summary.precision, (1 / 5 + 0 + 1 / 5) / 3, "precision");
    close(summary.recall, (1 + 0 + 0.5) / 3, "recall");
    close(summary.hitRate, 2 / 3, "hit");
    close(summary.coverage, 5 / 10, "coverage"); // a, b, c, d, x
    close(summary.ruleQueryRate, 2 / 3, "rule query rate");
    close(summary.avgListLength, 2, "độ dài TB");
    assert.equal(summary.queries, 3);
    assert.equal(summary.orders, 2);
    assert.equal(perQuery[2].ruleItems, 2);
});

test("evaluateRecommender: cắt còn K và báo lỗi khi gợi ý trùng hoặc gợi ý chính sản phẩm đang xem", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ productId: `x${i}`, source: "baseline" }));
    const { summary } = evaluateRecommender({ recommend: () => many }, [{ orderId: "o", query: "q", truth: ["x8"] }], { k: 5, catalogSize: 20 });
    assert.equal(summary.avgListLength, 5);
    assert.equal(summary.hitRate, 0, "x8 nằm ngoài Top-5");

    const q = [{ orderId: "o", query: "q", truth: ["a"] }];
    assert.throws(() => evaluateRecommender({ recommend: () => [{ productId: "q" }] }, q, { catalogSize: 5 }), /chính sản phẩm/);
    assert.throws(() => evaluateRecommender({ recommend: () => [{ productId: "a" }, { productId: "a" }] }, q, { catalogSize: 5 }), /trùng/);
    assert.throws(() => evaluateRecommender({ recommend: () => [] }, q, { catalogSize: 0 }), RangeError);
});

test("bootstrapCI: tái lập với cùng seed, khoảng chứa giá trị trung bình, theo cụm đơn hàng", () => {
    const rows = [];
    for (let i = 0; i < 60; i++) rows.push({ orderId: `o${Math.floor(i / 2)}`, hit: i % 3 === 0 ? 1 : 0 });
    const a = bootstrapCI(rows, "hit", { resamples: 500, seed: 7 });
    const b = bootstrapCI(rows, "hit", { resamples: 500, seed: 7 });
    assert.deepEqual(a, b);
    assert.ok(a.low <= a.mean && a.mean <= a.high);
    close(a.mean, 20 / 60, "mean");

    const constant = rows.map((r) => ({ ...r, hit: 1 }));
    assert.deepEqual(bootstrapCI(constant, "hit", { resamples: 100 }), { mean: 1, low: 1, high: 1 });
    assert.deepEqual(bootstrapCI([], "hit"), { mean: 0, low: 0, high: 0 });
});

test("pairedBootstrapDiff: chênh lệch cặp; khoảng không chứa 0 khi A luôn tốt hơn", () => {
    const a = Array.from({ length: 40 }, (_, i) => ({ orderId: `o${i}`, query: `q${i}`, recall: 1 }));
    const b = a.map((r, i) => ({ ...r, recall: i % 4 === 0 ? 1 : 0 }));
    const d = pairedBootstrapDiff(a, b, "recall", { resamples: 300, seed: 3 });
    close(d.mean, 0.75, "Δ");
    assert.ok(d.low > 0);
    assert.throws(() => pairedBootstrapDiff(a, b.slice(1), "recall"), /cùng tập truy vấn/);
    assert.throws(() => pairedBootstrapDiff(a, [...b].reverse(), "recall"), /không khớp/);
});
