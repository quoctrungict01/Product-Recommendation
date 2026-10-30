const test = require("node:test");
const assert = require("node:assert/strict");
const { temporalSplit, assertNoTemporalLeak } = require("../../research/evaluation/split");
const { buildQueries, describeQueries } = require("../../research/evaluation/protocol");

const order = (id, time, items) => ({ id, time, items });

test("temporalSplit: đúng tỷ lệ, theo thời gian, không chồng lấn, không phụ thuộc thứ tự đầu vào", () => {
    const orders = Array.from({ length: 100 }, (_, i) => order(`o${String(i).padStart(3, "0")}`, 1000 + i * 10, ["a"]));
    const shuffled = [...orders].sort((x, y) => (x.id.split("").reverse().join("") < y.id.split("").reverse().join("") ? -1 : 1));
    const s = temporalSplit(shuffled, { train: 0.7, validation: 0.1, test: 0.2 });
    assert.deepEqual([s.train.length, s.validation.length, s.test.length], [70, 10, 20]);
    assert.equal(s.train[69].time < s.validation[0].time, true);
    assert.equal(s.validation[9].time < s.test[0].time, true);
    const all = [...s.train, ...s.validation, ...s.test].map((o) => o.id);
    assert.equal(new Set(all).size, 100);
    assert.deepEqual(temporalSplit(orders), s, "cùng kết quả dù đầu vào bị xáo");
});

test("temporalSplit: đơn cùng thời điểm không bị tách qua ranh giới", () => {
    // Thời điểm: 0 1 2 3 4 5 6 6 8 9 — ranh giới train (70% = vị trí 7) rơi giữa hai đơn cùng thời điểm 6.
    const times = [0, 1, 2, 3, 4, 5, 6, 6, 8, 9];
    const orders = times.map((t, i) => order(`o${i}`, t, ["a"]));
    const s = temporalSplit(orders, { train: 0.7, validation: 0.1, test: 0.2 });
    assert.deepEqual(s.train.map((o) => o.time), [0, 1, 2, 3, 4, 5, 6, 6], "cả hai đơn thời điểm 6 nằm trong train");
    assert.equal(s.validation.length, 0, "ranh giới validation trùng ranh giới train sau khi dời");
    assert.deepEqual(s.test.map((o) => o.time), [8, 9]);
    assert.doesNotThrow(() => assertNoTemporalLeak(s.train, [...s.validation, ...s.test]));
});

test("temporalSplit: từ chối tham số sai", () => {
    const orders = [order("a", 1, ["x"])];
    assert.throws(() => temporalSplit(orders, { train: 0.8, validation: 0.1, test: 0.2 }), /Tổng/);
    assert.throws(() => temporalSplit(orders, { train: 1, validation: 0, test: 0 }), RangeError);
    assert.throws(() => temporalSplit([order("a", 1, []), order("a", 2, [])]), /trùng/);
    assert.throws(() => temporalSplit([{ id: "a", items: [] }]), TypeError);
    assert.throws(() => temporalSplit(null), TypeError);
});

test("assertNoTemporalLeak: phát hiện đơn tương lai trong lịch sử và đơn nằm ở hai tập", () => {
    const past = [order("a", 1, []), order("b", 2, [])];
    const future = [order("c", 3, [])];
    assert.doesNotThrow(() => assertNoTemporalLeak(past, future));
    assert.throws(() => assertNoTemporalLeak([...past, order("late", 9, [])], future), /Rò rỉ/);
    assert.throws(() => assertNoTemporalLeak([...past, order("c", 3, [])], future), /cả lịch sử và tập đánh giá/);
});

test("buildQueries: mỗi sản phẩm của đơn ≥ 2 sản phẩm là một truy vấn; đáp án là phần còn lại; bỏ đơn 1 sản phẩm", () => {
    const orders = [order("o1", 1, ["b", "a", "c"]), order("o2", 2, ["x"]), order("o3", 3, ["y", "y", "z"])];
    const q = buildQueries(orders);
    assert.deepEqual(
        q.map((x) => [x.orderId, x.query, x.truth.join("")]),
        [
            ["o1", "a", "bc"],
            ["o1", "b", "ac"],
            ["o1", "c", "ab"],
            ["o3", "y", "z"],
            ["o3", "z", "y"],
        ]
    );
    assert.ok(q.every((x) => !x.truth.includes(x.query)));
    // Độ dài đáp án: o1 có 3 truy vấn × 2 đáp án, o3 có 2 truy vấn × 1 đáp án → (6 + 2) / 5.
    assert.deepEqual(describeQueries(orders, q), { orders: 3, ordersWithAtLeast2Items: 2, singleItemOrdersSkipped: 1, queries: 5, avgTruthSize: 8 / 5 });
});
