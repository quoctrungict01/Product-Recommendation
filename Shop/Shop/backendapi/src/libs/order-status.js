// Quy tắc chuyển trạng thái đơn hàng (chỉ admin thực hiện).
//
//   pending (Chờ xác nhận) ──► confirmed (Đã xác nhận) ──► shipping (Đang giao) ──► delivered (Đã giao)
//        │                          │
//        └──────► cancelled ◄───────┘   (Đã hủy — chỉ hủy được TRƯỚC khi giao cho đơn vị vận chuyển)
//
//   - Chỉ đi tiến một bước; không nhảy cóc (pending -> shipping) và không quay lui.
//   - delivered và cancelled là trạng thái cuối: không đổi được nữa.
//   - Đơn cũ (1.000 đơn demo) không có trường status được hiểu là pending; chỉ được ghi status khi admin
//     chủ động đổi trạng thái đơn đó — không có tác vụ nào tự cập nhật hàng loạt.
const { ORDER_STATUSES } = require("../apps/models/order");

const TRANSITIONS = Object.freeze({
    pending: ["confirmed", "cancelled"],
    confirmed: ["shipping", "cancelled"],
    shipping: ["delivered"],
    delivered: [],
    cancelled: [],
});

const LABELS = Object.freeze({
    pending: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    shipping: "Đang giao",
    delivered: "Đã giao",
    cancelled: "Đã hủy",
});

/** Trạng thái hiện tại của đơn (đơn cũ không có status -> pending). */
const currentStatus = (order) => (order && ORDER_STATUSES.includes(order.status) ? order.status : "pending");

const nextStatuses = (status) => TRANSITIONS[status] || [];

const canTransition = (from, to) => nextStatuses(from).includes(to);

/** Bộ lọc MongoDB cho một trạng thái; "pending" gồm cả đơn cũ chưa có trường status. */
const statusFilter = (status) => (status === "pending" ? { status: { $in: ["pending", null] } } : { status });

module.exports = { TRANSITIONS, LABELS, currentStatus, nextStatuses, canTransition, statusFilter };
