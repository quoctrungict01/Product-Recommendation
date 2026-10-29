// Tiện ích dùng chung cho tập mục (itemset).
// Một itemset luôn được biểu diễn bằng mảng item đã sắp xếp tăng dần.

// Ký tự phân cách không thể xuất hiện trong mã sản phẩm, dùng để tạo khóa Map.
const SEPARATOR = "\u0000";

function itemsetKey(items) {
    return items.join(SEPARATOR);
}

function keyToItems(key) {
    return key === "" ? [] : key.split(SEPARATOR);
}

function compareItems(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

// Sắp xếp kết quả theo kích thước tập, sau đó theo thứ tự từ điển.
function compareItemsets(a, b) {
    if (a.items.length !== b.items.length) return a.items.length - b.items.length;
    for (let i = 0; i < a.items.length; i++) {
        const c = compareItems(a.items[i], b.items[i]);
        if (c !== 0) return c;
    }
    return 0;
}

function sortItemsets(itemsets) {
    return itemsets.sort(compareItemsets);
}

// Map: khóa itemset -> support count. Dùng để tra cứu support khi sinh luật.
function toSupportMap(itemsets) {
    const map = new Map();
    for (const { items, support } of itemsets) map.set(itemsetKey(items), support);
    return map;
}

module.exports = {
    SEPARATOR,
    itemsetKey,
    keyToItems,
    compareItems,
    compareItemsets,
    sortItemsets,
    toSupportMap,
};
