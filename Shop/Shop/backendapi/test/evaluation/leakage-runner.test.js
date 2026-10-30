// Kiểm tra chống rò rỉ dữ liệu và kiểm tra toàn bộ quy trình đánh giá (không cần MongoDB).

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { datasetFromSeedPlan, DEMO_SEED } = require("../../research/evaluation/dataset");
const { runEvaluation, tuneAssociationRules, frozenCopy } = require("../../research/evaluation/runner");
const { temporalSplit } = require("../../research/evaluation/split");
const { buildQueries } = require("../../research/evaluation/protocol");
const recommenders = require("../../research/evaluation/recommenders");
const { toMarkdown } = require("../../research/evaluation/report");

const small = datasetFromSeedPlan({ seed: 777, orderCount: 400 });
const SMALL_GRID = { minSupport: [0.01, 0.02], minConfidence: [0.1, 0.3] };

test("Dữ liệu demo tái tạo offline: 1.000 đơn, 41 sản phẩm, tái lập, không mở kết nối MongoDB", () => {
    const a = datasetFromSeedPlan();
    const b = datasetFromSeedPlan();
    assert.equal(a.seed, DEMO_SEED);
    assert.equal(a.orders.length, 1000);
    assert.equal(a.products.length, 41);
    assert.equal(a.checksum, b.checksum);
    assert.notEqual(a.checksum, small.checksum);
    assert.equal(mongoose.connection.readyState, 0);
});

test("Sản phẩm chỉ xuất hiện ở tương lai không bao giờ được học: phương pháp nào cũng 'không biết' nó", () => {
    const split = temporalSplit(small.orders);
    const FUTURE = "f".repeat(24);
    const products = [...small.products, { _id: FUTURE, name: "Chỉ có ở test", category_id: small.products[0].category_id, price: 1, is_stock: true }];
    // Cài sản phẩm FUTURE vào mọi đơn test, đi kèm sản phẩm đầu tiên của đơn.
    const test = split.test.map((o) => ({ ...o, items: [...o.items, FUTURE] }));
    const history = frozenCopy([...split.train, ...split.validation]);

    const popular = recommenders.mostPopularRecommender().fit(history, products);
    const cooc = recommenders.cooccurrenceRecommender().fit(history, products);
    const rules = recommenders.associationRuleRecommender({ minSupport: 0.01, minConfidence: 0.1, fallback: false }).fit(history, products);
    for (const q of buildQueries(test)) {
        assert.ok(!popular.recommend(q.query).some((x) => x.productId === FUTURE));
        assert.ok(!cooc.recommend(q.query).some((x) => x.productId === FUTURE));
        assert.ok(!rules.recommend(q.query).some((x) => x.productId === FUTURE));
    }
    // Nếu (cố ý) học cả test thì sản phẩm FUTURE lập tức thành luật mạnh: chứng tỏ phép thử nhạy.
    const leaked = recommenders.associationRuleRecommender({ minSupport: 0.01, minConfidence: 0.1, fallback: false }).fit([...history, ...test], products);
    assert.ok(buildQueries(test).some((q) => leaked.recommend(q.query).some((x) => x.productId === FUTURE)));
});

test("Dữ liệu học được đóng băng: phương pháp không thể sửa lịch sử", () => {
    const h = frozenCopy(small.orders.slice(0, 3));
    assert.throws(() => {
        "use strict";
        h[0].items.push("x");
    }, TypeError);
});

test("Tham số chỉ chọn bằng validation: thay đổi tập test không làm đổi tham số được chọn", () => {
    const split = temporalSplit(small.orders);
    const pick = (orders) =>
        tuneAssociationRules({
            history: frozenCopy(temporalSplit(orders).train),
            products: small.products,
            queries: buildQueries(temporalSplit(orders).validation),
            grid: SMALL_GRID,
            k: 5,
            catalogSize: small.products.length,
        }).selected;
    // Làm hỏng hoàn toàn tập test (giữ thời gian) — tham số phải y nguyên.
    const corrupted = [...split.train, ...split.validation, ...split.test.map((o) => ({ ...o, items: [small.products[0]._id, small.products[1]._id] }))];
    assert.deepEqual(pick(corrupted), pick(small.orders));
});

test("runEvaluation: phương pháp học trên train (khi chọn tham số) và train ∪ validation (khi chấm test), không bao giờ thấy test", () => {
    const split = temporalSplit(small.orders);
    const ids = (list) => new Set(list.map((o) => o.id));
    const trainIds = ids(split.train);
    const validationIds = ids(split.validation);
    const testIds = ids(split.test);
    const fits = []; // mọi lần fit: { phase, method, ids }

    const report = runEvaluation(small, {
        grid: SMALL_GRID,
        bootstrap: 50,
        observeFit: (phase, method, history) => fits.push({ phase, method, ids: history.map((o) => o.id) }),
    });

    const tuningFits = fits.filter((f) => f.phase === "tuning");
    const finalFits = fits.filter((f) => f.phase === "final");
    assert.equal(tuningFits.length, SMALL_GRID.minSupport.length * SMALL_GRID.minConfidence.length * 2);
    assert.ok(finalFits.length >= 8 + 2 * 2 * 5, "8 phương pháp + so sánh Apriori/FP-Growth (2 bộ tham số × 2 thuật toán × 5 lần đo)");
    for (const f of tuningFits) {
        assert.equal(f.ids.length, trainIds.size);
        assert.ok(f.ids.every((id) => trainIds.has(id)), "chọn tham số chỉ học từ train");
    }
    for (const f of finalFits) {
        assert.equal(f.ids.length, trainIds.size + validationIds.size, f.method);
        assert.ok(f.ids.every((id) => trainIds.has(id) || validationIds.has(id)), `${f.method} chỉ học từ train ∪ validation`);
    }
    assert.ok(fits.every((f) => f.ids.every((id) => !testIds.has(id))), "không lần học nào thấy đơn test");

    assert.equal(report.split.test.queries, buildQueries(split.test).length);
    assert.equal(report.split.validation.queries, buildQueries(split.validation).length);
    assert.ok(report.split.train.range.to <= report.split.validation.range.from);
    assert.ok(report.split.validation.range.to <= report.split.test.range.from);
});

test("runEvaluation: đủ phương pháp, chỉ số hợp lệ, Apriori = FP-Growth, báo cáo Markdown đủ mục", () => {
    const report = runEvaluation(small, { grid: SMALL_GRID, bootstrap: 50 });
    assert.deepEqual(
        report.results.map((r) => r.name),
        [
            "random",
            "most-popular",
            "category-based",
            "co-occurrence",
            "rules-fpgrowth-rules-only",
            "rules-fpgrowth-with-fallback",
            "rules-fpgrowth-rules-only",
            "rules-fpgrowth-with-fallback",
        ]
    );
    for (const r of report.results) {
        const s = r.summary;
        for (const v of [s.precision, s.recall, s.hitRate, s.coverage, s.ruleQueryRate]) assert.ok(v >= 0 && v <= 1);
        assert.ok(r.ci.recall.low <= s.recall + 1e-12 && s.recall <= r.ci.recall.high + 1e-12);
        if (r.name.startsWith("rules") && r.name.endsWith("with-fallback")) assert.equal(s.avgListLength, 5);
        if (!r.name.startsWith("rules")) assert.equal(s.ruleQueryRate, 0, "baseline không có gợi ý từ luật");
    }
    // Fallback chỉ thêm sản phẩm, không thay đổi phần gợi ý từ luật => recall không giảm.
    assert.ok(report.results[5].summary.recall >= report.results[4].summary.recall);
    assert.ok(report.results[7].summary.recall >= report.results[6].summary.recall);
    assert.ok(report.algorithmCheck.every((a) => a.identical));

    const md = toMarkdown(report, { generatedAt: "x", node: "x", command: "x" });
    for (const heading of ["## 1. Dữ liệu", "## 2. Chia dữ liệu", "## 3. Định nghĩa chỉ số", "## 4. Chọn tham số", "## 5. Kết quả", "## 6. Apriori và FP-Growth", "## 7. Giới hạn", "## 8. Chạy lại"]) {
        assert.ok(md.includes(heading), heading);
    }
    assert.match(md, /Dữ liệu giả lập/);
});

test("Kết quả tái lập: chạy hai lần cho cùng bảng chỉ số", () => {
    const strip = (r) => r.results.map((x) => [x.name, x.summary, x.ci]);
    assert.deepEqual(strip(runEvaluation(small, { grid: SMALL_GRID, bootstrap: 50 })), strip(runEvaluation(small, { grid: SMALL_GRID, bootstrap: 50 })));
});
