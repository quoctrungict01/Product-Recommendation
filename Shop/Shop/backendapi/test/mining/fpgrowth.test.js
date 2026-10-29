const test = require("node:test");
const assert = require("node:assert/strict");

const {
    fpGrowth,
    buildFPTree,
    conditionalPatternBase,
    nodeLinks,
    singlePath,
} = require("../../src/apps/services/mining/fpgrowth");
const fixture = require("./fixtures/table6_1");
const { describeTree, sortBase } = require("./helpers");

const weighted = fixture.transactions.map((items) => ({ items, count: 1 }));

test("FP-Growth: Bảng 6.1, min_sup = 2 cho đúng các tập phổ biến của Hình 6.2", () => {
    const { itemsets } = fpGrowth(fixture.transactions, { minSupport: 2 });
    assert.deepEqual(itemsets, fixture.expectedFrequentItemsets);
});

test("FP-tree: header table có thứ tự L = I2:7, I1:6, I3:6, I4:2, I5:2", () => {
    const tree = buildFPTree(weighted, 2);
    assert.deepEqual(
        tree.header.map(({ item, support }) => ({ item, support })),
        fixture.expectedHeaderOrder
    );
});

test("FP-tree: cấu trúc cây khớp Hình 6.7", () => {
    const tree = buildFPTree(weighted, 2);
    assert.deepEqual(describeTree(tree.root), fixture.expectedTree);
    assert.equal(tree.nodeCount, 10);
});

test("FP-tree: node-link nối đủ các nút cùng item và tổng count bằng support", () => {
    const tree = buildFPTree(weighted, 2);
    const expectedNodeCounts = { I2: 1, I1: 2, I3: 3, I4: 2, I5: 2 };
    for (const entry of tree.header) {
        const nodes = nodeLinks(tree, entry.item);
        assert.equal(nodes.length, expectedNodeCounts[entry.item], `số nút của ${entry.item}`);
        assert.equal(entry.nodeCount, nodes.length);
        assert.ok(nodes.every((n) => n.item === entry.item));
        assert.equal(
            nodes.reduce((sum, n) => sum + n.count, 0),
            entry.support,
            `tổng count trên node-link của ${entry.item}`
        );
    }
});

test("Conditional pattern base khớp Bảng 6.2", () => {
    const tree = buildFPTree(weighted, 2);
    for (const [item, expected] of Object.entries(fixture.expectedConditionalPatternBases)) {
        assert.deepEqual(sortBase(conditionalPatternBase(tree, item)), sortBase(expected), `base của ${item}`);
    }
    assert.deepEqual(conditionalPatternBase(tree, "I2"), []); // I2 nằm ngay dưới gốc
});

test("Conditional FP-tree: I5 cho <I2:2, I1:2>, I3 cho hai nhánh <I2:4, I1:2> và <I1:2>", () => {
    const tree = buildFPTree(weighted, 2);
    const conditional = (item) => buildFPTree(conditionalPatternBase(tree, item), 2, tree.rank);

    // I1 và I2 cùng count 2 trong base của I5: giữ thứ tự L của cây cha (I2 trước I1).
    const treeI5 = conditional("I5");
    assert.deepEqual(describeTree(treeI5.root), { "I2:2": { "I1:2": {} } });
    assert.ok(singlePath(treeI5), "cây điều kiện của I5 là một đường đi");

    // I3 trong cây điều kiện bị loại vì support của I3 trong base của I5 chỉ là 1.
    assert.ok(!treeI5.headerMap.has("I3"));

    const treeI3 = conditional("I3");
    assert.deepEqual(describeTree(treeI3.root), { "I2:4": { "I1:2": {} }, "I1:2": {} });
    assert.equal(singlePath(treeI3), null);

    const treeI4 = conditional("I4");
    assert.deepEqual(describeTree(treeI4.root), { "I2:2": {} });
});

test("FP-Growth: không sinh trùng itemset", () => {
    const { itemsets } = fpGrowth(fixture.transactions, { minSupport: 1 });
    const keys = itemsets.map((x) => x.items.join(","));
    assert.equal(new Set(keys).size, keys.length);
});

test("FP-Growth: cây một đường đi sinh mọi tổ hợp với support là count nhỏ nhất", () => {
    const transactions = [
        ["a", "b", "c"],
        ["a", "b", "c"],
        ["a", "b"],
        ["a"],
    ];
    const { itemsets, stats } = fpGrowth(transactions, { minSupport: 1 });
    assert.ok(stats.singlePathShortcuts >= 1);
    assert.deepEqual(itemsets, [
        { items: ["a"], support: 4 },
        { items: ["b"], support: 3 },
        { items: ["c"], support: 2 },
        { items: ["a", "b"], support: 3 },
        { items: ["a", "c"], support: 2 },
        { items: ["b", "c"], support: 2 },
        { items: ["a", "b", "c"], support: 2 },
    ]);
});
