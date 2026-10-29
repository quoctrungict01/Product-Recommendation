const test = require("node:test");
const assert = require("node:assert/strict");

const { generateRules, ruleMeasures } = require("../../src/apps/services/mining/rules");
const { apriori } = require("../../src/apps/services/mining/apriori");
const fixture = require("./fixtures/table6_1");

const EPS = 1e-12;
const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < EPS, `${message}: ${actual} != ${expected}`);

const findRule = (rules, antecedent, consequent) =>
    rules.find(
        (r) => r.antecedent.join(",") === antecedent.join(",") && r.consequent.join(",") === consequent.join(",")
    );

const allRules = generateRules(fixture.expectedFrequentItemsets, { transactionCount: 9 });

test("Luật từ {I1,I2,I5}: confidence khớp Ví dụ 6.4", () => {
    for (const expected of fixture.expectedRulesFromI1I2I5) {
        const rule = findRule(allRules, expected.antecedent, expected.consequent);
        assert.ok(rule, `thiếu luật ${expected.antecedent} => ${expected.consequent}`);
        close(rule.confidence, expected.confidence, "confidence");
        close(rule.support, 2 / 9, "support");
        assert.equal(rule.supportCount, 2);
    }
});

test("Số luật: mỗi tập k phần tử sinh 2^k − 2 luật", () => {
    // 6 tập 2 phần tử * 2 + 2 tập 3 phần tử * 6 = 24
    assert.equal(allRules.length, 24);
});

test("min_conf = 70% chỉ giữ ba luật 100% của Ví dụ 6.4 trong nhóm {I1,I2,I5}", () => {
    const strong = generateRules(fixture.expectedFrequentItemsets, { transactionCount: 9, minConfidence: 0.7 });
    const fromX = strong.filter((r) => [...r.antecedent, ...r.consequent].sort().join(",") === "I1,I2,I5");
    assert.deepEqual(
        fromX.map((r) => `${r.antecedent}=>${r.consequent}`).sort(),
        ["I1,I5=>I2", "I2,I5=>I1", "I5=>I1,I2"]
    );
    assert.ok(strong.every((r) => r.confidence >= 0.7));
});

test("Lift, Kulczynski, IR của luật I5 => I1 tính đúng theo công thức", () => {
    // sup(I5)=2, sup(I1)=6, sup(I1,I5)=2, |D|=9
    const rule = findRule(allRules, ["I5"], ["I1"]);
    close(rule.confidence, 1, "confidence");
    close(rule.lift, (2 * 9) / (2 * 6), "lift"); // 1.5
    close(rule.kulczynski, (2 / 2 + 2 / 6) / 2, "Kulc"); // 0.6667
    close(rule.imbalanceRatio, Math.abs(2 - 6) / (2 + 6 - 2), "IR"); // 0.6667
});

test("Lift < 1 phát hiện tương quan âm: I2 => I3", () => {
    // sup(I2)=7, sup(I3)=6, sup(I2,I3)=4 -> lift = 4*9/(7*6) = 0.857
    const rule = findRule(allRules, ["I2"], ["I3"]);
    close(rule.lift, 36 / 42, "lift");
    assert.ok(rule.lift < 1);
});

test("Kulczynski và IR khớp Bảng 6.9 (bộ D4–D6 trong Ví dụ 6.11)", () => {
    // Bảng 6.9: (mc, m¬c, ¬mc, ¬m¬c). sup(m) = mc + m¬c, sup(c) = mc + ¬mc.
    const cases = [
        { name: "D4", mc: 1000, mNotC: 1000, notMC: 1000, total: 1000 + 1000 + 1000 + 100000, kulc: 0.5, ir: 0 },
        { name: "D5", mc: 1000, mNotC: 100, notMC: 10000, total: 1000 + 100 + 10000 + 100000, kulc: 0.5, ir: 0.89 },
        { name: "D6", mc: 1000, mNotC: 10, notMC: 100000, total: 1000 + 10 + 100000 + 100000, kulc: 0.5, ir: 0.99 },
    ];
    for (const c of cases) {
        const m = ruleMeasures(c.mc, c.mc + c.mNotC, c.mc + c.notMC, c.total);
        assert.ok(Math.abs(m.kulczynski - c.kulc) < 0.01, `${c.name} Kulc = ${m.kulczynski}`);
        assert.ok(Math.abs(m.imbalanceRatio - c.ir) < 0.01, `${c.name} IR = ${m.imbalanceRatio}`);
    }
});

test("Lift khớp Bảng 6.9: D1 = 9.26, D4 = 25.75", () => {
    const d1 = ruleMeasures(10000, 11000, 11000, 10000 + 1000 + 1000 + 100000);
    const d4 = ruleMeasures(1000, 2000, 2000, 1000 + 1000 + 1000 + 100000);
    assert.equal(Number(d1.lift.toFixed(2)), 9.26);
    assert.equal(Number(d4.lift.toFixed(2)), 25.75);
    assert.equal(Number(d1.kulczynski.toFixed(2)), 0.91);
});

test("Luật sinh từ kết quả Apriori giống luật sinh từ fixture", () => {
    const { itemsets, stats } = apriori(fixture.transactions, { minSupport: 2 });
    assert.deepEqual(generateRules(itemsets, { transactionCount: stats.transactionCount }), allRules);
});

test("Luật được sắp xếp theo confidence giảm dần", () => {
    for (let i = 1; i < allRules.length; i++) {
        assert.ok(allRules[i - 1].confidence >= allRules[i].confidence);
    }
});

test("generateRules báo lỗi khi tham số sai hoặc thiếu tập con", () => {
    assert.throws(() => generateRules([], { transactionCount: -1 }), TypeError);
    assert.throws(() => generateRules([], { transactionCount: 9, minConfidence: 1.5 }), RangeError);
    assert.throws(() => generateRules([], { transactionCount: 9, minConfidence: NaN }), RangeError);
    assert.throws(
        () => generateRules([{ items: ["a", "b"], support: 2 }], { transactionCount: 3 }),
        /Thiếu support/
    );
    assert.deepEqual(generateRules([], { transactionCount: 0 }), []);
});
