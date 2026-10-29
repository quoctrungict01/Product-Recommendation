// Tiện ích dùng chung cho các bài kiểm thử khai phá.

const { normalizeTransactions, resolveMinSupportCount } = require("../../src/apps/services/mining/transactions");
const { sortItemsets } = require("../../src/apps/services/mining/itemset");

/**
 * Lời giải vét cạn: duyệt mọi tập con của tập item, đếm support trực tiếp.
 * Chỉ dùng cho dữ liệu nhỏ (ít item), làm "đáp án chuẩn" để so với Apriori và FP-Growth.
 */
function bruteForceFrequentItemsets(transactions, minSupport) {
    const D = normalizeTransactions(transactions);
    const minCount = resolveMinSupportCount(minSupport, D.length);
    const items = [...new Set(D.flat())].sort();
    if (items.length > 16) throw new Error("Brute force chỉ dùng cho tối đa 16 item.");
    const sets = D.map((t) => new Set(t));

    const result = [];
    for (let mask = 1; mask < 1 << items.length; mask++) {
        const candidate = items.filter((_, i) => mask & (1 << i));
        let support = 0;
        for (const t of sets) if (candidate.every((x) => t.has(x))) support++;
        if (support >= minCount) result.push({ items: candidate, support });
    }
    return sortItemsets(result);
}

/** Chuyển FP-tree về object lồng nhau dạng {"item:count": {...}} để so sánh. */
function describeTree(node) {
    const out = {};
    for (const child of node.children.values()) {
        out[`${child.item}:${child.count}`] = describeTree(child);
    }
    return out;
}

/** Sắp xếp conditional pattern base để so sánh không phụ thuộc thứ tự. */
function sortBase(base) {
    return [...base]
        .map((b) => ({ items: [...b.items], count: b.count }))
        .sort((a, b) => a.items.join(",").localeCompare(b.items.join(",")) || a.count - b.count);
}

module.exports = {
    bruteForceFrequentItemsets,
    describeTree,
    sortBase,
};
