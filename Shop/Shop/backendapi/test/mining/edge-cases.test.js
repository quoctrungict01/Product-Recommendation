const test = require("node:test");
const assert = require("node:assert/strict");

const { apriori } = require("../../src/apps/services/mining/apriori");
const { fpGrowth } = require("../../src/apps/services/mining/fpgrowth");
const { mine } = require("../../src/apps/services/mining");
const {
    normalizeTransactions,
    transactionsFromOrders,
    resolveMinSupportCount,
} = require("../../src/apps/services/mining/transactions");

const ALGORITHMS = [
    ["Apriori", apriori],
    ["FP-Growth", fpGrowth],
];

for (const [name, run] of ALGORITHMS) {
    test(`${name}: dữ liệu rỗng trả về rỗng`, () => {
        const result = run([], { minSupport: 1 });
        assert.deepEqual(result.itemsets, []);
        assert.equal(result.stats.transactionCount, 0);
        assert.deepEqual(run([], { minSupport: 0.5 }).itemsets, []);
    });

    test(`${name}: các giao dịch rỗng vẫn tính vào |D|`, () => {
        const result = run([[], [], ["a"]], { minSupport: 0.3 }); // ceil(0.3*3) = 1
        assert.equal(result.stats.transactionCount, 3);
        assert.deepEqual(result.itemsets, [{ items: ["a"], support: 1 }]);
    });

    test(`${name}: chỉ có một sản phẩm`, () => {
        const result = run([["p1"], ["p1"], ["p1"]], { minSupport: 2 });
        assert.deepEqual(result.itemsets, [{ items: ["p1"], support: 3 }]);
    });

    test(`${name}: sản phẩm trùng trong một giao dịch chỉ tính một lần`, () => {
        const result = run(
            [
                ["a", "a", "b"],
                ["a", "b", "b", "b"],
                ["a"],
            ],
            { minSupport: 1 }
        );
        assert.deepEqual(result.itemsets, [
            { items: ["a"], support: 3 },
            { items: ["b"], support: 2 },
            { items: ["a", "b"], support: 2 },
        ]);
    });

    test(`${name}: min_sup lớn hơn số giao dịch cho kết quả rỗng`, () => {
        assert.deepEqual(run([["a", "b"], ["a"]], { minSupport: 100 }).itemsets, []);
    });

    test(`${name}: min_sup bất thường bị từ chối`, () => {
        const data = [["a", "b"]];
        for (const bad of [0, -1, -0.5, NaN, Infinity, -Infinity]) {
            assert.throws(() => run(data, { minSupport: bad }), `minSupport=${bad}`);
        }
        assert.throws(() => run(data, { minSupport: 1.5 }), RangeError);
        assert.throws(() => run(data, { minSupport: "2" }), TypeError);
        assert.throws(() => run(data, {}), TypeError);
        assert.throws(() => run(data, { minSupport: null }), TypeError);
    });

    test(`${name}: dữ liệu đầu vào sai kiểu bị từ chối`, () => {
        assert.throws(() => run(null, { minSupport: 1 }), TypeError);
        assert.throws(() => run([["a"], "b"], { minSupport: 1 }), TypeError);
    });

    test(`${name}: bỏ qua item null/undefined/rỗng và chấp nhận item kiểu ObjectId`, () => {
        const fakeObjectId = { toString: () => "65af7feeb9edc11b2f837b03" };
        const result = run([[null, "a", undefined, ""], [fakeObjectId, "a"]], { minSupport: 1 });
        assert.deepEqual(result.itemsets, [
            { items: ["65af7feeb9edc11b2f837b03"], support: 1 },
            { items: ["a"], support: 2 },
            { items: ["65af7feeb9edc11b2f837b03", "a"], support: 1 },
        ]);
    });

    test(`${name}: không làm thay đổi mảng đầu vào`, () => {
        const data = [["b", "a", "a"], ["c"]];
        const copy = JSON.parse(JSON.stringify(data));
        run(data, { minSupport: 1 });
        assert.deepEqual(data, copy);
    });
}

test("resolveMinSupportCount: quy đổi tỷ lệ sang số đếm", () => {
    assert.equal(resolveMinSupportCount(0.6, 5), 3); // 0.6*5 = 3.0000000000000004, không được làm tròn lên 4
    assert.equal(resolveMinSupportCount(0.5, 9), 5);
    assert.equal(resolveMinSupportCount(0.001, 10), 1); // tối thiểu 1
    assert.equal(resolveMinSupportCount(0.5, 0), 1);
    assert.equal(resolveMinSupportCount(1, 10), 1); // 1 là số đếm tuyệt đối
    assert.equal(resolveMinSupportCount(7, 3), 7);
});

test("normalizeTransactions: bỏ trùng và sắp xếp từng giao dịch", () => {
    assert.deepEqual(normalizeTransactions([["c", "a", "c"], []]), [["a", "c"], []]);
});

test("transactionsFromOrders: đọc prd_id theo cấu trúc models/order.js", () => {
    const orders = [
        { items: [{ prd_id: "p2", qty: 3, price: 10 }, { prd_id: "p1", qty: 1, price: 5 }] },
        { items: [{ prd_id: "p1", qty: 2 }, { prd_id: "p1", qty: 1 }] }, // trùng sản phẩm
        { items: [] },
        {}, // đơn lỗi không có items
    ];
    assert.deepEqual(transactionsFromOrders(orders), [["p1", "p2"], ["p1"], [], []]);
});

test("mine(): chọn thuật toán, sinh luật, và từ chối thuật toán lạ", () => {
    const data = [["a", "b"], ["a", "b"], ["a"]];
    const viaApriori = mine(data, { algorithm: "apriori", minSupport: 2, minConfidence: 0.5 });
    const viaFp = mine(data, { algorithm: "fpgrowth", minSupport: 2, minConfidence: 0.5 });
    assert.deepEqual(viaApriori.itemsets, viaFp.itemsets);
    assert.deepEqual(viaApriori.rules, viaFp.rules);
    assert.deepEqual(
        viaFp.rules.map((r) => [r.antecedent, r.consequent, r.confidence]),
        [
            [["b"], ["a"], 1],
            [["a"], ["b"], 2 / 3],
        ]
    );
    assert.throws(() => mine(data, { algorithm: "eclat", minSupport: 1 }), RangeError);
});
