// Thống kê cho Dashboard Admin — CHỈ ADMIN. Quy tắc tính: libs/stats.js (chỉ đơn Đã giao là doanh thu thực tế).
const OrderModel = require("../../models/order");
const ProductModel = require("../../models/product");
const { ORDER_STATUSES } = require("../../models/order");
const { badRequest } = require("../../../libs/http-error");
const { statusFilter } = require("../../../libs/order-status");
const { parseRange, revenueSeries, periodCards, topProducts, deliveredInRange, startOfVnDay, yearKey } = require("../../../libs/stats");

const LIGHT = "status totalPrice delivered_at status_history.to status_history.at updatedAt createdAt";

/**
 * Đơn đã giao có thể nằm trong [start, end): có delivered_at trong khoảng, hoặc không có delivered_at
 * (đơn giao trước đợt 5 — ngày giao lấy từ status_history ở bước lọc trong bộ nhớ).
 */
function deliveredCandidates(start, end, projection = LIGHT) {
    return OrderModel.find({ status: "delivered", $or: [{ delivered_at: { $gte: start, $lt: end } }, { delivered_at: null }] }, projection).lean();
}

/** GET /stats/summary — thẻ doanh thu hôm nay/tháng/năm, tổng đơn, đơn theo trạng thái. */
exports.summary = async (req, res) => {
    const now = new Date();
    const yearStart = startOfVnDay(`${yearKey(now)}-01-01`);
    const yearEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [orders, total, ...counts] = await Promise.all([
        deliveredCandidates(yearStart, yearEnd),
        OrderModel.countDocuments({}),
        ...ORDER_STATUSES.map((s) => OrderModel.countDocuments(statusFilter(s))),
    ]);
    const byStatus = Object.fromEntries(ORDER_STATUSES.map((s, i) => [s, counts[i]]));
    res.status(200).json({
        status: "success",
        data: {
            generated_at: now,
            revenue: periodCards(orders, now),
            orders: {
                total,
                by_status: byStatus,
                pending: byStatus.pending, // chờ xác nhận (gồm đơn demo cũ không có status)
                in_progress: byStatus.confirmed + byStatus.shipping,
            },
        },
    });
};

/** GET /stats/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|month — biểu đồ doanh thu + số đơn tạo mới theo trạng thái. */
exports.revenue = async (req, res) => {
    const range = parseRange(req.query);
    const [delivered, created] = await Promise.all([
        deliveredCandidates(range.start, range.end),
        OrderModel.find({ createdAt: { $gte: range.start, $lt: range.end } }, "status").lean(),
    ]);
    const { series, totals } = revenueSeries(delivered, range);
    const createdByStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    for (const o of created) createdByStatus[ORDER_STATUSES.includes(o.status) ? o.status : "pending"] += 1;
    res.status(200).json({
        status: "success",
        data: {
            range: { from: range.from, to: range.to, group: range.group },
            series,
            totals,
            orders_created: { total: created.length, by_status: createdByStatus },
        },
    });
};

/** GET /stats/top-products?from=&to=&sort=qty|revenue&limit=10 — sản phẩm bán chạy trong các đơn đã giao. */
exports.topProducts = async (req, res) => {
    const range = parseRange({ from: req.query.from, to: req.query.to });
    const sort = req.query.sort || "qty";
    if (sort !== "qty" && sort !== "revenue") throw badRequest("sort phải là qty hoặc revenue.");
    const limitRaw = req.query.limit;
    if (limitRaw !== undefined && (typeof limitRaw !== "string" || !/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) < 1)) throw badRequest("limit phải là số nguyên dương.");
    const limit = Math.min(Number(limitRaw || 10), 50);
    const candidates = await deliveredCandidates(range.start, range.end, `${LIGHT} items`);
    const rows = topProducts(deliveredInRange(candidates, range.start, range.end), { sort, limit });
    const products = rows.length ? await ProductModel.find({ _id: { $in: rows.map((r) => r.prd_id) } }, "name image").lean() : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    res.status(200).json({
        status: "success",
        data: {
            range: { from: range.from, to: range.to },
            sort,
            docs: rows.map((r) => ({ ...r, name: byId.get(r.prd_id) ? byId.get(r.prd_id).name : "Sản phẩm đã bị xóa", image: byId.get(r.prd_id) ? byId.get(r.prd_id).image : null })),
        },
    });
};
