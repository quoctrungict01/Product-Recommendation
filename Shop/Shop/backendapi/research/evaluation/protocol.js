// Giao thức "che giấu từng sản phẩm" (leave-one-out trong giỏ hàng), mô phỏng trang chi tiết sản phẩm:
// với mỗi đơn đánh giá có >= 2 sản phẩm khác nhau, lần lượt lấy một sản phẩm q làm "sản phẩm đang xem";
// các sản phẩm còn lại của đơn là đáp án (truth). Hệ thống gợi ý Top-K, không được chứa q.
// Đơn chỉ có 1 sản phẩm không tạo truy vấn (không có đáp án để chấm).

function buildQueries(orders) {
    const queries = [];
    for (const order of orders) {
        const items = [...new Set(order.items)].sort();
        if (items.length < 2) continue;
        for (const query of items) {
            queries.push({ orderId: order.id, time: order.time, query, truth: items.filter((x) => x !== query) });
        }
    }
    return queries;
}

function describeQueries(orders, queries) {
    const multi = orders.filter((o) => new Set(o.items).size >= 2).length;
    return {
        orders: orders.length,
        ordersWithAtLeast2Items: multi,
        singleItemOrdersSkipped: orders.length - multi,
        queries: queries.length,
        avgTruthSize: queries.length ? queries.reduce((s, q) => s + q.truth.length, 0) / queries.length : 0,
    };
}

module.exports = { buildQueries, describeQueries };
