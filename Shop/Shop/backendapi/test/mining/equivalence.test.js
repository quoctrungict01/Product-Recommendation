// Apriori và FP-Growth là thuật toán chính xác: với cùng min_sup, cả hai phải cho
// đúng cùng một tập itemset phổ biến với cùng support. Đối chiếu thêm với lời giải vét cạn.

const test = require("node:test");
const assert = require("node:assert/strict");

const { apriori } = require("../../src/apps/services/mining/apriori");
const { fpGrowth } = require("../../src/apps/services/mining/fpgrowth");
const { generateRules } = require("../../src/apps/services/mining/rules");
const { generateTransactions, createRandom } = require("../../src/apps/services/mining/synthetic");
const { bruteForceFrequentItemsets } = require("./helpers");
const fixture = require("./fixtures/table6_1");

test("Bảng 6.1: Apriori = FP-Growth = vét cạn với mọi min_sup từ 1 đến 10", () => {
    for (let minSupport = 1; minSupport <= 10; minSupport++) {
        const expected = bruteForceFrequentItemsets(fixture.transactions, minSupport);
        assert.deepEqual(apriori(fixture.transactions, { minSupport }).itemsets, expected, `apriori min_sup=${minSupport}`);
        assert.deepEqual(fpGrowth(fixture.transactions, { minSupport }).itemsets, expected, `fp min_sup=${minSupport}`);
    }
});

test("Dữ liệu ngẫu nhiên (200 bộ, seed cố định): Apriori = FP-Growth = vét cạn", () => {
    const random = createRandom(20261023);
    for (let round = 0; round < 200; round++) {
        const itemCount = 2 + Math.floor(random() * 9); // 2..10 item
        const transactionCount = Math.floor(random() * 40); // 0..39 giao dịch, có cả rỗng
        const transactions = [];
        for (let t = 0; t < transactionCount; t++) {
            const size = Math.floor(random() * (itemCount + 2));
            const basket = [];
            for (let i = 0; i < size; i++) basket.push(`x${Math.floor(random() * itemCount)}`); // có trùng
            transactions.push(basket);
        }
        const minSupport = random() < 0.5 ? 1 + Math.floor(random() * 5) : 0.05 + random() * 0.5;

        const expected = bruteForceFrequentItemsets(transactions, minSupport);
        const a = apriori(transactions, { minSupport }).itemsets;
        const f = fpGrowth(transactions, { minSupport }).itemsets;
        assert.deepEqual(a, expected, `apriori round ${round}`);
        assert.deepEqual(f, expected, `fp-growth round ${round}`);
    }
});

test("Dữ liệu giả cỡ vừa (2000 giao dịch): hai thuật toán cho cùng itemset và cùng luật", () => {
    const { transactions } = generateTransactions({ seed: 7, transactionCount: 2000, itemCount: 80 });
    for (const minSupport of [0.05, 0.02, 0.01]) {
        const a = apriori(transactions, { minSupport });
        const f = fpGrowth(transactions, { minSupport });
        assert.equal(a.stats.minSupportCount, f.stats.minSupportCount);
        assert.deepEqual(a.itemsets, f.itemsets, `min_sup=${minSupport}`);
        assert.ok(a.itemsets.length > 0);

        const n = a.stats.transactionCount;
        assert.deepEqual(
            generateRules(a.itemsets, { transactionCount: n, minConfidence: 0.3 }),
            generateRules(f.itemsets, { transactionCount: n, minConfidence: 0.3 })
        );
    }
});

test("Bộ sinh dữ liệu giả tái lập được với cùng seed", () => {
    const a = generateTransactions({ seed: 123, transactionCount: 300 });
    const b = generateTransactions({ seed: 123, transactionCount: 300 });
    const c = generateTransactions({ seed: 124, transactionCount: 300 });
    assert.deepEqual(a.transactions, b.transactions);
    assert.notDeepEqual(a.transactions, c.transactions);
});
