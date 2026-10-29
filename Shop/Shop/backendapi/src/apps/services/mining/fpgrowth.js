// Thuật toán FP-Growth — Han, Kamber, Pei, "Data Mining: Concepts and Techniques" (3rd Ed),
// mục 6.2.4, Hình 6.9.
//
// 1. Quét D lần 1: tìm tập item phổ biến F và support, sắp xếp giảm dần thành danh sách L.
// 2. Quét D lần 2: chèn các item phổ biến của từng giao dịch (theo thứ tự L) vào FP-tree.
//    Mỗi item có một mục trong header table, trỏ tới chuỗi node-link nối mọi nút cùng item.
// 3. FP_growth(Tree, α):
//      nếu Tree chỉ có một đường đi P: sinh mọi tổ hợp β của các nút trên P,
//          pattern β ∪ α với support = support nhỏ nhất của các nút trong β;
//      ngược lại, với mỗi ai trong header (từ item ít phổ biến nhất):
//          β = ai ∪ α, support = ai.support;
//          xây conditional pattern base của β rồi conditional FP-tree Tree_β;
//          nếu Tree_β khác rỗng thì gọi FP_growth(Tree_β, β).

const { normalizeTransactions, resolveMinSupportCount } = require("./transactions");
const { compareItems, sortItemsets } = require("./itemset");

class FPNode {
    constructor(item, parent) {
        this.item = item; // null cho nút gốc
        this.count = 0;
        this.parent = parent;
        this.children = new Map(); // item -> FPNode
        this.next = null; // node-link: nút kế tiếp có cùng item
    }
}

/**
 * Xây FP-tree từ danh sách giao dịch có trọng số [{items, count}].
 * Giao dịch gốc có count = 1; các conditional pattern base có count = count của nút.
 *
 * Thứ tự L: support giảm dần. Khi bằng nhau, giữ thứ tự của cây cha (`parentRank`)
 * như Hình 6.8 của sách; với cây gốc thì theo thứ tự từ điển của item.
 * Với Bảng 6.1, thứ tự này cho đúng L = {I2:7, I1:6, I3:6, I4:2, I5:2} như trong sách.
 */
function buildFPTree(weightedTransactions, minSupportCount, parentRank = null) {
    const counts = new Map();
    for (const { items, count } of weightedTransactions) {
        for (const item of items) counts.set(item, (counts.get(item) || 0) + count);
    }

    const tieBreak = parentRank
        ? (a, b) => parentRank.get(a) - parentRank.get(b)
        : compareItems;
    const order = [...counts.entries()]
        .filter(([, support]) => support >= minSupportCount)
        .sort((a, b) => b[1] - a[1] || tieBreak(a[0], b[0]))
        .map(([item]) => item);
    const rank = new Map(order.map((item, i) => [item, i]));

    const header = order.map((item) => ({ item, support: counts.get(item), head: null, tail: null, nodeCount: 0 }));
    const headerMap = new Map(header.map((entry) => [entry.item, entry]));

    const root = new FPNode(null, null);
    let nodeCount = 0;

    for (const { items, count } of weightedTransactions) {
        const sorted = items.filter((item) => rank.has(item)).sort((a, b) => rank.get(a) - rank.get(b));
        // insert_tree([p|P], T)
        let node = root;
        for (const item of sorted) {
            let child = node.children.get(item);
            if (!child) {
                child = new FPNode(item, node);
                node.children.set(item, child);
                nodeCount++;
                // Nối nút mới vào cuối chuỗi node-link của item này.
                const entry = headerMap.get(item);
                if (entry.tail) entry.tail.next = child;
                else entry.head = child;
                entry.tail = child;
                entry.nodeCount++;
            }
            child.count += count;
            node = child;
        }
    }

    return { root, header, headerMap, rank, nodeCount };
}

/** Duyệt chuỗi node-link của một item trong header table. */
function nodeLinks(tree, item) {
    const nodes = [];
    const entry = tree.headerMap.get(item);
    for (let node = entry ? entry.head : null; node; node = node.next) nodes.push(node);
    return nodes;
}

/**
 * Conditional pattern base của `item`: tập các đường tiền tố (từ gốc xuống,
 * không gồm chính item) của mọi nút chứa item, mỗi đường mang count của nút đó.
 */
function conditionalPatternBase(tree, item) {
    const base = [];
    for (const node of nodeLinks(tree, item)) {
        const path = [];
        for (let p = node.parent; p && p.item !== null; p = p.parent) path.push(p.item);
        if (path.length > 0) base.push({ items: path.reverse(), count: node.count });
    }
    return base;
}

/** Nếu cây chỉ có một đường đi, trả về danh sách nút trên đường đó; ngược lại trả về null. */
function singlePath(tree) {
    const path = [];
    let node = tree.root;
    while (node.children.size > 0) {
        if (node.children.size > 1) return null;
        node = node.children.values().next().value;
        path.push(node);
    }
    return path;
}

function mine(tree, suffix, minSupportCount, output, stats, depth) {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    const path = singlePath(tree);

    if (path) {
        // Mỗi tổ hợp β khác rỗng của các nút trên đường đi.
        // Count trên một đường đi không tăng khi đi xuống, nên support của β
        // chính là count của nút sâu nhất được chọn.
        const n = path.length;
        const chosen = [];
        const walk = (start) => {
            for (let i = start; i < n; i++) {
                chosen.push(path[i].item);
                output.push({ items: [...chosen, ...suffix], support: path[i].count });
                walk(i + 1);
                chosen.pop();
            }
        };
        walk(0);
        if (n > 0) stats.singlePathShortcuts++;
        return;
    }

    for (let h = tree.header.length - 1; h >= 0; h--) {
        const { item, support } = tree.header[h];
        const beta = [item, ...suffix];
        output.push({ items: beta, support });

        const base = conditionalPatternBase(tree, item);
        const conditionalTree = buildFPTree(base, minSupportCount, tree.rank);
        stats.conditionalTrees++;
        if (conditionalTree.header.length > 0) {
            mine(conditionalTree, beta, minSupportCount, output, stats, depth + 1);
        }
    }
}

/**
 * Chạy FP-Growth.
 * @param {string[][]} transactions danh sách giao dịch
 * @param {{minSupport: number}} options minSupport: tỷ lệ (0,1) hoặc số đếm nguyên >= 1
 * @returns {{itemsets: {items: string[], support: number}[], stats: object}}
 */
function fpGrowth(transactions, options = {}) {
    const D = normalizeTransactions(transactions);
    const minSupportCount = resolveMinSupportCount(options.minSupport, D.length);

    const tree = buildFPTree(
        D.map((items) => ({ items, count: 1 })),
        minSupportCount
    );

    const output = [];
    const stats = {
        algorithm: "fp-growth",
        transactionCount: D.length,
        minSupportCount,
        treeNodes: tree.nodeCount,
        conditionalTrees: 0,
        singlePathShortcuts: 0,
        maxDepth: 0,
    };
    mine(tree, [], minSupportCount, output, stats, 0);

    for (const itemset of output) itemset.items.sort(compareItems);
    return { itemsets: sortItemsets(output), stats };
}

module.exports = {
    fpGrowth,
    buildFPTree,
    conditionalPatternBase,
    nodeLinks,
    singlePath,
    FPNode,
};
