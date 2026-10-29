// Chuẩn hóa dữ liệu giao dịch cho các thuật toán khai phá tập mục phổ biến.
// Module này KHÔNG truy cập MongoDB: nó chỉ nhận mảng dữ liệu đã có sẵn.

/**
 * Chuyển một mục (item) về chuỗi. Bỏ qua null/undefined/chuỗi rỗng.
 * ObjectId của Mongoose có toString() trả về mã hex nên dùng được trực tiếp.
 */
function normalizeItem(item) {
    if (item === null || item === undefined) return null;
    const value = String(item).trim();
    return value === "" ? null : value;
}

/**
 * Chuẩn hóa danh sách giao dịch:
 * - mỗi giao dịch là một mảng item;
 * - item trùng trong cùng giao dịch chỉ tính một lần (support đếm theo giao dịch);
 * - item được sắp xếp tăng dần để có thứ tự từ điển ổn định (cần cho bước join của Apriori).
 *
 * Giao dịch rỗng vẫn được giữ lại vì nó vẫn tính vào tổng số giao dịch |D|.
 */
function normalizeTransactions(transactions) {
    if (!Array.isArray(transactions)) {
        throw new TypeError("transactions phải là một mảng các giao dịch.");
    }
    return transactions.map((transaction, index) => {
        if (!Array.isArray(transaction)) {
            throw new TypeError(`Giao dịch thứ ${index} không phải là mảng.`);
        }
        const unique = new Set();
        for (const raw of transaction) {
            const item = normalizeItem(raw);
            if (item !== null) unique.add(item);
        }
        return [...unique].sort();
    });
}

/**
 * Chuyển đơn hàng (theo cấu trúc models/order.js: items[{prd_id, price, qty}])
 * thành danh sách giao dịch. Số lượng (qty) không ảnh hưởng tới support.
 */
function transactionsFromOrders(orders) {
    if (!Array.isArray(orders)) {
        throw new TypeError("orders phải là một mảng.");
    }
    return normalizeTransactions(
        orders.map((order) => (Array.isArray(order?.items) ? order.items : []).map((item) => item?.prd_id))
    );
}

/**
 * Quy đổi ngưỡng hỗ trợ về số đếm tuyệt đối (min_sup count).
 * - 0 < minSupport < 1  : tỷ lệ, count = ceil(minSupport * |D|) (tối thiểu 1).
 * - minSupport >= 1     : số đếm tuyệt đối, phải là số nguyên.
 * Các giá trị khác (<= 0, NaN, Infinity, không phải số, số thực >= 1) ném lỗi.
 * min_sup lớn hơn |D| là hợp lệ: kết quả đơn giản là không có tập phổ biến.
 */
function resolveMinSupportCount(minSupport, transactionCount) {
    if (typeof minSupport !== "number" || !Number.isFinite(minSupport)) {
        throw new TypeError("minSupport phải là một số hữu hạn.");
    }
    if (minSupport <= 0) {
        throw new RangeError("minSupport phải lớn hơn 0.");
    }
    if (minSupport < 1) {
        return Math.max(1, Math.ceil(minSupport * transactionCount - 1e-9));
    }
    if (!Number.isInteger(minSupport)) {
        throw new RangeError("minSupport >= 1 được hiểu là số đếm tuyệt đối và phải là số nguyên.");
    }
    return minSupport;
}

module.exports = {
    normalizeItem,
    normalizeTransactions,
    transactionsFromOrders,
    resolveMinSupportCount,
};
