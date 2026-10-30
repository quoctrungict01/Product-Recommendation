// M2: phân loại ràng buộc (mục 7.3.2, Bảng 7.2), khai phá có cắt tỉa và tương đương với hậu lọc.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../research/constraints/constraints");
const { constrainedApriori, constrainedFPGrowth, postFilter } = require("../../research/constraints/miners");
const { apriori } = require("../../src/apps/services/mining/apriori");
const { fpGrowth } = require("../../src/apps/services/mining/fpgrowth");
const { generateRules } = require("../../src/apps/services/mining");
const { createRandom } = require("../../src/apps/services/mining/synthetic");
const table61 = require("../mining/fixtures/table6_1");

// Ví dụ 7.8: mặt hàng có giá (USD); "rẻ" < 10, "đắt" ≥ 50.
const PRICE = { pen: 2, cable: 6, mouse: 9, case: 4, headset: 45, printer: 60, camera: 120, laptop: 900 };
const ITEMS = Object.keys(PRICE).sort();
const price = (x) => PRICE[x];

/** Mọi tập con khác rỗng của ITEMS (2^8 − 1 = 255 tập). */
function allSubsets(items = ITEMS) {
    const out = [];
    for (let mask = 1; mask < 1 << items.length; mask++) out.push(items.filter((_, i) => mask & (1 << i)));
    return out;
}
const supersetsOf = (s, all) => all.filter((t) => t.length > s.length && s.every((x) => t.includes(x)));

/** Kiểm tra tính chất trên toàn bộ dàn tập con. */
function holdsAntiMonotone(c) {
    const all = allSubsets();
    return all.every((s) => c.test(s) || supersetsOf(s, all).every((t) => !c.test(t)));
}
function holdsMonotone(c) {
    const all = allSubsets();
    return all.every((s) => !c.test(s) || supersetsOf(s, all).every((t) => c.test(t)));
}

test("Bảng 7.2: tính chất anti-monotone / monotone đúng như khai báo (kiểm chứng trên mọi tập con)", () => {
    const anti = [C.sumAtMost(price, 100), C.countAtMost(3), C.maxAtMost(price, 50, ITEMS), C.minAtLeast(price, 5, ITEMS), C.subsetOf(["pen", "cable", "case"]), C.noConflictingPair((a, b) => [a, b].sort().join() === "camera,printer")];
    const mono = [C.sumAtLeast(price, 100), C.countAtLeast(3), C.minAtMost(price, 5, ITEMS), C.intersects(["camera", "laptop"])];
    for (const c of anti) {
        assert.equal(c.kind, "anti-monotone", c.name);
        assert.ok(holdsAntiMonotone(c), `${c.name} phải anti-monotone`);
        assert.ok(c.pushable);
    }
    for (const c of mono) {
        assert.equal(c.kind, "monotone", c.name);
        assert.ok(holdsMonotone(c), `${c.name} phải monotone`);
        assert.ok(!c.pushable, "monotone không cắt tỉa không gian mẫu");
    }
    // count(S ∩ P) ≤ 1 (vd. tối đa một điện thoại) cũng anti-monotone.
    assert.ok(holdsAntiMonotone(C.countWhereAtMost((x) => price(x) >= 50, 1)));
});

test("avg(S) ≤ v không anti-monotone cũng không monotone (convertible) — không được đẩy vào khai phá", () => {
    const avg = C.avgAtMost(price, 20);
    assert.equal(avg.kind, "convertible");
    assert.ok(!holdsAntiMonotone(avg) && !holdsMonotone(avg));
    // Như giáo trình: {headset} vi phạm (45 > 20) nhưng thêm hàng rẻ thì thỏa (57/4 = 14,25) -> không anti-monotone;
    // {pen, case, cable} thỏa (4) nhưng thêm laptop thì vi phạm -> không monotone.
    assert.ok(!avg.test(["headset"]) && avg.test(["headset", "pen", "case", "cable"]));
    assert.ok(avg.test(["cable", "case", "pen"]) && !avg.test(["cable", "case", "pen", "laptop"]));
    assert.throws(() => constrainedApriori(table61.transactions, { minSupport: 2, constraints: [avg] }), /phải được hậu lọc/);
    assert.throws(() => constrainedFPGrowth(table61.transactions, { minSupport: 2, constraints: [C.sumAtLeast(price, 1)] }), /phải được hậu lọc/);
    // sum với giá trị âm: inconvertible.
    const signed = C.sumAtMostSigned((x) => (x === "pen" ? -100 : price(x)), 50);
    assert.equal(signed.kind, "inconvertible");
    assert.ok(!holdsAntiMonotone(signed));
    assert.throws(() => C.sumAtMost((x) => (x === "pen" ? -1 : 1), 5).test(["pen"]), /≥ 0/);
});

test("Succinct: min(S) ≥ v và max(S) ≤ v liệt kê được chính xác tập item hợp lệ trước khi đếm", () => {
    const min50 = C.minAtLeast(price, 50, ITEMS); // "min(J.price) ≥ $50" của Ví dụ 7.8
    assert.ok(min50.succinct);
    assert.deepEqual(ITEMS.filter(min50.allowedItem), ["camera", "laptop", "printer"]);
    for (const s of allSubsets()) assert.equal(min50.test(s), s.every(min50.allowedItem));
});

test("Không bật ràng buộc: bản có cắt tỉa cho đúng kết quả Apriori/FP-Growth gốc (Bảng 6.1 và dữ liệu ngẫu nhiên)", () => {
    const sameAs = (a, b) => assert.deepEqual(a.itemsets, b.itemsets);
    sameAs(constrainedApriori(table61.transactions, { minSupport: 2 }), apriori(table61.transactions, { minSupport: 2 }));
    sameAs(constrainedFPGrowth(table61.transactions, { minSupport: 2 }), fpGrowth(table61.transactions, { minSupport: 2 }));
    assert.deepEqual(constrainedApriori(table61.transactions, { minSupport: 2 }).itemsets, table61.expectedFrequentItemsets);
    const r = createRandom(11);
    const T = Array.from({ length: 400 }, () => ITEMS.filter(() => r() < 0.3));
    sameAs(constrainedApriori(T, { minSupport: 0.03 }), apriori(T, { minSupport: 0.03 }));
    sameAs(constrainedFPGrowth(T, { minSupport: 0.03 }), fpGrowth(T, { minSupport: 0.03 }));
});

test("Cắt tỉa = hậu lọc: cùng tập mục và cùng luật, Apriori và FP-Growth, nhiều tổ hợp ràng buộc anti-monotone", () => {
    const r = createRandom(2026);
    const T = Array.from({ length: 600 }, () => ITEMS.filter(() => r() < 0.35));
    const sets = [
        [C.sumAtMost(price, 100)],
        [C.countAtMost(2)],
        [C.maxAtMost(price, 50, ITEMS), C.countAtMost(3)],
        [C.noConflictingPair((a, b) => price(a) >= 50 && price(b) >= 50), C.sumAtMost(price, 1000)],
        [C.subsetOf(["pen", "cable", "mouse", "case", "headset"]), C.countWhereAtMost((x) => price(x) < 5, 1)],
    ];
    for (const cs of sets) {
        const reference = postFilter(apriori(T, { minSupport: 0.02 }).itemsets, cs);
        const a = constrainedApriori(T, { minSupport: 0.02, constraints: cs });
        const f = constrainedFPGrowth(T, { minSupport: 0.02, constraints: cs });
        const name = cs.map((c) => c.name).join(" ∧ ");
        assert.deepEqual(a.itemsets, reference, `Apriori: ${name}`);
        assert.deepEqual(f.itemsets, reference, `FP-Growth: ${name}`);
        // Kết quả đóng theo tập con -> generateRules gốc chạy được và cho cùng luật.
        const rules = (x) => generateRules(x, { transactionCount: T.length, minConfidence: 0.1 });
        assert.deepEqual(rules(a.itemsets), rules(reference));
    }
});

test("Cắt tỉa thật sự xảy ra trong khai phá: ít candidate được đếm hơn, cây điều kiện ít hơn, dữ liệu bị thu gọn", () => {
    const r = createRandom(7);
    const T = Array.from({ length: 600 }, () => ITEMS.filter(() => r() < 0.4));
    const plain = apriori(T, { minSupport: 0.02 });
    const pushed = constrainedApriori(T, { minSupport: 0.02, constraints: [C.countAtMost(2)] });
    assert.ok(pushed.stats.prunedByConstraint > 0);
    assert.ok(pushed.stats.totalCandidates < plain.stats.totalCandidates, "candidate vi phạm bị loại TRƯỚC khi đếm");
    assert.equal(pushed.stats.levels.find((l) => l.k === 3).counted, 0, "không đếm candidate 3 item nào");
    const fpPlain = fpGrowth(T, { minSupport: 0.02 });
    const fpPushed = constrainedFPGrowth(T, { minSupport: 0.02, constraints: [C.countAtMost(2)] });
    assert.ok(fpPushed.stats.conditionalTrees <= fpPlain.stats.conditionalTrees);
    assert.ok(fpPushed.stats.prunedBaseItems > 0, "data-antimonotone: item không thể mở rộng mẫu bị bỏ khỏi cơ sở mẫu điều kiện");
    // Data-succinct: item ngoài V bị bỏ khỏi giao dịch trước khi đếm.
    const succ = constrainedApriori(T, { minSupport: 0.02, constraints: [C.subsetOf(["pen", "cable"])] });
    assert.ok(succ.stats.removedItemOccurrences > 0);
    assert.ok(succ.itemsets.every((s) => s.items.every((x) => x === "pen" || x === "cable")));
});

test("Ví dụ 7.8/7.9: sum(price) ≤ 100 cắt tỉa cả mẫu lẫn dữ liệu; kết quả không đổi so với hậu lọc", () => {
    const T = [
        ["pen", "cable", "printer"],
        ["pen", "cable", "mouse"],
        ["pen", "case", "camera"],
        ["cable", "mouse", "case"],
        ["pen", "cable", "mouse", "case"],
        ["printer", "camera", "laptop"],
        ["pen", "mouse"],
        ["cable", "case"],
    ];
    const cheap = C.sumAtMost(price, 10, "sum(I.price) ≤ $10");
    const ref = postFilter(apriori(T, { minSupport: 2 }).itemsets, [cheap]);
    const f = constrainedFPGrowth(T, { minSupport: 2, constraints: [cheap] });
    assert.deepEqual(f.itemsets, ref);
    assert.ok(ref.every((s) => s.items.reduce((acc, x) => acc + price(x), 0) <= 10));
    assert.ok(f.stats.prunedPatterns + f.stats.prunedBaseItems > 0);
    assert.deepEqual(constrainedApriori(T, { minSupport: 2, constraints: [cheap] }).itemsets, ref);
});
