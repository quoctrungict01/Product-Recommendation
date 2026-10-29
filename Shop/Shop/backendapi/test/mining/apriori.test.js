const test = require("node:test");
const assert = require("node:assert/strict");

const { apriori, aprioriGen, hasInfrequentSubset, findFrequent1Itemsets } = require("../../src/apps/services/mining/apriori");
const { itemsetKey } = require("../../src/apps/services/mining/itemset");
const fixture = require("./fixtures/table6_1");

test("Apriori: Bảng 6.1, min_sup = 2 cho đúng L1, L2, L3 như Hình 6.2", () => {
    const { itemsets } = apriori(fixture.transactions, { minSupport: fixture.minSupportCount });
    assert.deepEqual(itemsets, fixture.expectedFrequentItemsets);
});

test("Apriori: L1 có support I1:6, I2:7, I3:6, I4:2, I5:2", () => {
    const L1 = findFrequent1Itemsets(fixture.transactions, 2);
    assert.deepEqual(L1, fixture.expectedFrequentItemsets.filter((x) => x.items.length === 1));
});

test("Apriori: số candidate qua từng bước join và prune khớp Ví dụ 6.3", () => {
    const { stats } = apriori(fixture.transactions, { minSupport: 2 });
    assert.deepEqual(stats.levels, fixture.expectedAprioriLevels);
    assert.equal(stats.minSupportCount, 2);
    assert.equal(stats.transactionCount, 9);
});

test("apriori_gen: join L2 cho 6 tập, prune còn {I1,I2,I3} và {I1,I2,I5}", () => {
    const L2 = fixture.expectedFrequentItemsets.filter((x) => x.items.length === 2);
    const { candidates, joined } = aprioriGen(L2);
    assert.equal(joined, 6);
    assert.deepEqual(candidates, [
        ["I1", "I2", "I3"],
        ["I1", "I2", "I5"],
    ]);
});

test("apriori_gen: C4 rỗng vì {I2,I3,I5} không phổ biến", () => {
    const L3 = fixture.expectedFrequentItemsets.filter((x) => x.items.length === 3);
    const { candidates, joined } = aprioriGen(L3);
    assert.equal(joined, 1);
    assert.deepEqual(candidates, []);
});

test("has_infrequent_subset: phát hiện tập con không phổ biến", () => {
    const L2keys = new Set(
        fixture.expectedFrequentItemsets.filter((x) => x.items.length === 2).map((x) => itemsetKey(x.items))
    );
    assert.equal(hasInfrequentSubset(["I1", "I2", "I3"], L2keys), false);
    assert.equal(hasInfrequentSubset(["I1", "I3", "I5"], L2keys), true); // {I3,I5} không phổ biến
    assert.equal(hasInfrequentSubset(["I2", "I3", "I4"], L2keys), true); // {I3,I4} không phổ biến
});

test("Apriori: min_sup dạng tỷ lệ 2/9 cho cùng kết quả với min_sup = 2", () => {
    const byRatio = apriori(fixture.transactions, { minSupport: 2 / 9 });
    assert.equal(byRatio.stats.minSupportCount, 2);
    assert.deepEqual(byRatio.itemsets, fixture.expectedFrequentItemsets);
});

test("Apriori: min_sup = 4 chỉ còn các tập có support >= 4", () => {
    const { itemsets } = apriori(fixture.transactions, { minSupport: 4 });
    assert.deepEqual(
        itemsets,
        fixture.expectedFrequentItemsets.filter((x) => x.support >= 4)
    );
});
