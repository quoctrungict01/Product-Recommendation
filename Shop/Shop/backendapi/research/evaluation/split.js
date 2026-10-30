// Chia đơn hàng theo thời gian: train | validation | test.
// Đơn được sắp theo createdAt (rồi theo id để ổn định). Các đơn có cùng thời điểm không bị tách
// sang hai phía của một ranh giới, nên không đơn nào ở tập sau xảy ra trước một đơn ở tập trước.

const DEFAULT_RATIOS = Object.freeze({ train: 0.7, validation: 0.1, test: 0.2 });

function sortByTime(orders) {
    return [...orders].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * @param {{id: string, time: number, items: string[]}[]} orders
 * @param {{train: number, validation: number, test: number}} ratios tổng bằng 1, mỗi phần > 0
 */
function temporalSplit(orders, ratios = DEFAULT_RATIOS) {
    if (!Array.isArray(orders)) throw new TypeError("orders phải là mảng.");
    const { train, validation, test } = ratios;
    for (const [name, r] of Object.entries({ train, validation, test })) {
        if (typeof r !== "number" || !(r > 0 && r < 1)) throw new RangeError(`Tỷ lệ ${name} phải nằm trong (0, 1).`);
    }
    if (Math.abs(train + validation + test - 1) > 1e-9) throw new RangeError("Tổng tỷ lệ train + validation + test phải bằng 1.");
    for (const o of orders) {
        if (typeof o.id !== "string" || !Number.isFinite(o.time) || !Array.isArray(o.items)) {
            throw new TypeError("Mỗi đơn cần {id: string, time: number, items: string[]}.");
        }
    }
    const ids = new Set(orders.map((o) => o.id));
    if (ids.size !== orders.length) throw new Error("Có id đơn bị trùng.");

    const sorted = sortByTime(orders);
    const n = sorted.length;
    // Dời ranh giới về sau cho tới khi không tách hai đơn cùng thời điểm.
    const boundary = (index) => {
        let i = Math.min(Math.max(index, 0), n);
        while (i > 0 && i < n && sorted[i].time === sorted[i - 1].time) i++;
        return i;
    };
    const cut1 = boundary(Math.round(n * train));
    const cut2 = Math.max(cut1, boundary(Math.round(n * (train + validation))));

    const parts = { train: sorted.slice(0, cut1), validation: sorted.slice(cut1, cut2), test: sorted.slice(cut2) };
    const range = (list) => (list.length ? { from: list[0].time, to: list[list.length - 1].time } : null);
    return {
        ...parts,
        ratios: { train, validation, test },
        ranges: { train: range(parts.train), validation: range(parts.validation), test: range(parts.test) },
    };
}

/** Kiểm tra không có rò rỉ thời gian: mọi đơn trong `history` xảy ra không muộn hơn mọi đơn trong `future`. */
function assertNoTemporalLeak(history, future) {
    if (!history.length || !future.length) return;
    const lastHistory = Math.max(...history.map((o) => o.time));
    const firstFuture = Math.min(...future.map((o) => o.time));
    if (lastHistory > firstFuture) {
        throw new Error(`Rò rỉ dữ liệu: có đơn lịch sử (${new Date(lastHistory).toISOString()}) muộn hơn đơn đánh giá (${new Date(firstFuture).toISOString()}).`);
    }
    const futureIds = new Set(future.map((o) => o.id));
    if (history.some((o) => futureIds.has(o.id))) throw new Error("Rò rỉ dữ liệu: một đơn nằm ở cả lịch sử và tập đánh giá.");
}

module.exports = { DEFAULT_RATIOS, sortByTime, temporalSplit, assertNoTemporalLeak };
