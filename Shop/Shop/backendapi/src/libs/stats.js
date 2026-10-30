// Thống kê doanh thu (hàm thuần, không truy cập DB).
//
// Quy tắc:
//   - Doanh thu thực tế CHỈ gồm đơn status = "delivered". Đơn chờ xác nhận/đã xác nhận/đang giao/đã hủy và
//     1.000 đơn demo cũ (không có status) KHÔNG được tính.
//   - Số tiền của đơn = totalPrice ĐÃ LƯU trong đơn (sau khuyến mãi và coupon). Không tính lại theo giá hiện tại.
//   - Ngày ghi nhận = thời điểm giao thành công (delivered_at; đơn giao trước khi có trường này dùng mốc
//     "delivered" trong status_history). Ngày/tháng/năm tính theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè).
//   - Doanh thu theo sản phẩm = đơn giá đã lưu × số lượng (giá sau khuyến mãi sản phẩm, TRƯỚC coupon — coupon
//     giảm trên cả đơn nên không phân bổ cho từng sản phẩm).
const { badRequest } = require("./http-error");

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;
const MAX_MONTHS = 60;

/** Ngày giờ -> "YYYY-MM-DD" theo giờ Việt Nam. */
const dayKey = (date) => new Date(new Date(date).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
const monthKey = (date) => dayKey(date).slice(0, 7);
const yearKey = (date) => dayKey(date).slice(0, 4);

/** "YYYY-MM-DD" -> thời điểm 00:00 giờ Việt Nam của ngày đó (Date UTC). */
function startOfVnDay(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d) - VN_OFFSET_MS);
}

/** Thời điểm giao thành công của đơn (null nếu không xác định được). */
function deliveredAt(order) {
    if (order.delivered_at) return new Date(order.delivered_at);
    const h = (order.status_history || []).filter((x) => x.to === "delivered").pop();
    if (h && h.at) return new Date(h.at);
    return order.updatedAt ? new Date(order.updatedAt) : null;
}

const money = (o) => (typeof o.totalPrice === "number" && Number.isFinite(o.totalPrice) && o.totalPrice >= 0 ? o.totalPrice : 0);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDay(value, name) {
    if (typeof value !== "string" || !DATE_RE.test(value)) throw badRequest(`${name} phải có dạng YYYY-MM-DD.`);
    const d = startOfVnDay(value);
    if (Number.isNaN(d.getTime()) || dayKey(d) !== value) throw badRequest(`${name} không phải ngày hợp lệ.`);
    return value;
}

/**
 * Khoảng thời gian từ query: from/to (YYYY-MM-DD, tính cả hai đầu), group = day | month.
 * Mặc định: 30 ngày gần nhất theo ngày; group=month mặc định 12 tháng gần nhất.
 */
function parseRange(query = {}, now = new Date()) {
    const group = query.group === undefined || query.group === "" ? "day" : query.group;
    if (group !== "day" && group !== "month") throw badRequest("group phải là day hoặc month.");
    const today = dayKey(now);
    const to = query.to ? parseDay(query.to, "to") : today;
    let from;
    if (query.from) from = parseDay(query.from, "from");
    else if (group === "day") from = dayKey(startOfVnDay(to).getTime() - 29 * DAY_MS + 1);
    else {
        const [y, m] = to.split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 12, 1));
        from = d.toISOString().slice(0, 10);
    }
    if (from > to) throw badRequest("from phải nhỏ hơn hoặc bằng to.");
    const start = startOfVnDay(from);
    const end = new Date(startOfVnDay(to).getTime() + DAY_MS); // không gồm end
    const keys = bucketKeys(from, to, group);
    if (group === "day" && keys.length > MAX_DAYS) throw badRequest(`Xem theo ngày tối đa ${MAX_DAYS} ngày; hãy chọn xem theo tháng.`);
    if (group === "month" && keys.length > MAX_MONTHS) throw badRequest(`Xem theo tháng tối đa ${MAX_MONTHS} tháng.`);
    return { from, to, group, start, end, keys };
}

/** Danh sách nhãn của các cột biểu đồ (đủ cả ngày/tháng không có đơn). */
function bucketKeys(from, to, group) {
    const keys = [];
    if (group === "day") {
        for (let t = startOfVnDay(from).getTime(), end = startOfVnDay(to).getTime(); t <= end && keys.length <= MAX_DAYS; t += DAY_MS) keys.push(dayKey(t));
    } else {
        let [y, m] = from.slice(0, 7).split("-").map(Number);
        const last = to.slice(0, 7);
        while (keys.length <= MAX_MONTHS) {
            const k = `${y}-${String(m).padStart(2, "0")}`;
            keys.push(k);
            if (k >= last) break;
            m += 1;
            if (m > 12) {
                m = 1;
                y += 1;
            }
        }
    }
    return keys;
}

/** Chỉ giữ đơn đã giao có ngày giao trong [start, end). */
function deliveredInRange(orders, start, end) {
    return orders.filter((o) => {
        if (o.status !== "delivered") return false;
        const at = deliveredAt(o);
        return at && at >= start && at < end;
    });
}

/** Chuỗi doanh thu theo ngày/tháng + tổng của khoảng. */
function revenueSeries(orders, range) {
    const delivered = deliveredInRange(orders, range.start, range.end);
    const byKey = new Map(range.keys.map((k) => [k, { key: k, revenue: 0, orders: 0 }]));
    for (const o of delivered) {
        const at = deliveredAt(o);
        const k = range.group === "day" ? dayKey(at) : monthKey(at);
        const b = byKey.get(k);
        if (!b) continue;
        b.revenue += money(o);
        b.orders += 1;
    }
    const series = [...byKey.values()];
    const revenue = series.reduce((t, b) => t + b.revenue, 0);
    const count = series.reduce((t, b) => t + b.orders, 0);
    return { series, totals: { revenue, orders: count, average_order_value: count ? Math.round(revenue / count) : 0 } };
}

/** Doanh thu hôm nay / tháng này / năm nay (đơn đã giao). */
function periodCards(orders, now = new Date()) {
    const keys = { today: dayKey(now), month: monthKey(now), year: yearKey(now) };
    const cards = { today: { revenue: 0, orders: 0 }, month: { revenue: 0, orders: 0 }, year: { revenue: 0, orders: 0 } };
    for (const o of orders) {
        if (o.status !== "delivered") continue;
        const at = deliveredAt(o);
        if (!at) continue;
        const add = (card) => {
            card.revenue += money(o);
            card.orders += 1;
        };
        if (dayKey(at) === keys.today) add(cards.today);
        if (monthKey(at) === keys.month) add(cards.month);
        if (yearKey(at) === keys.year) add(cards.year);
    }
    for (const c of Object.values(cards)) c.average_order_value = c.orders ? Math.round(c.revenue / c.orders) : 0;
    return { keys, ...cards };
}

/** Sản phẩm bán chạy trong các đơn đã giao: theo số lượng hoặc doanh thu (đơn giá đã lưu × số lượng). */
function topProducts(orders, { sort = "qty", limit = 10 } = {}) {
    const map = new Map();
    for (const o of orders) {
        if (o.status !== "delivered") continue;
        for (const i of o.items || []) {
            const id = String(i.prd_id);
            const qty = Number(i.qty) || 0;
            const price = Number(i.price) || 0;
            const row = map.get(id) || { prd_id: id, qty: 0, revenue: 0, orders: 0 };
            row.qty += qty;
            row.revenue += price * qty;
            row.orders += 1;
            map.set(id, row);
        }
    }
    const key = sort === "revenue" ? "revenue" : "qty";
    const other = key === "qty" ? "revenue" : "qty";
    return [...map.values()].sort((a, b) => b[key] - a[key] || b[other] - a[other] || (a.prd_id < b.prd_id ? -1 : 1)).slice(0, limit);
}

module.exports = { VN_OFFSET_MS, dayKey, monthKey, yearKey, startOfVnDay, deliveredAt, parseRange, bucketKeys, deliveredInRange, revenueSeries, periodCards, topProducts };
