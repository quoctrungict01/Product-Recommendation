// M2-B — Khai phá có CẮT TỈA theo ràng buộc anti-monotone (mục 7.3.2), dựng từ các khối của Chương 6:
//   Apriori   : findFrequent1Itemsets, aprioriGen (src/apps/services/mining/apriori.js)
//   FP-Growth : buildFPTree, conditionalPatternBase, singlePath (src/apps/services/mining/fpgrowth.js)
// Không sửa src: apriori() và fpGrowth() gốc giữ nguyên hành vi (có test so khớp khi không có ràng buộc).
//
// Cắt tỉa không gian mẫu (pattern space):
//   Apriori   — candidate vi phạm ràng buộc anti-monotone bị loại TRƯỚC khi đếm support, nên không được
//               đếm và không sinh tập cha nào ở vòng sau.
//   FP-Growth — mẫu β vi phạm thì không xuất và không dựng cây điều kiện cho β (mọi mẫu mở rộng từ β đều vi phạm).
// Cắt tỉa không gian dữ liệu (data space):
//   succinct S ⊆ V — bỏ item ngoài V khỏi mọi giao dịch trước khi đếm (data-succinct, "precounting");
//   FP-Growth      — trong conditional pattern base của β, bỏ item x nếu β ∪ {x} vi phạm (data-antimonotone).
//                    Giáo trình lưu ý cách này chỉ dùng được cho thuật toán pattern-growth, không cho Apriori.
// Mọi tập con của một tập thỏa ràng buộc anti-monotone cũng thỏa, nên kết quả vẫn đóng theo tập con
// và generateRules() gốc dùng được.

const { findFrequent1Itemsets, aprioriGen } = require("../../src/apps/services/mining/apriori");
const { buildFPTree, conditionalPatternBase, singlePath } = require("../../src/apps/services/mining/fpgrowth");
const { normalizeTransactions, resolveMinSupportCount } = require("../../src/apps/services/mining/transactions");
const { itemsetKey, sortItemsets, compareItems } = require("../../src/apps/services/mining/itemset");
const { satisfiesAll } = require("./constraints");

function assertPushable(constraints) {
    const bad = constraints.filter((c) => !c.pushable);
    if (bad.length) {
        throw new Error(`Chỉ ràng buộc anti-monotone mới cắt tỉa được trong khai phá; ${bad.map((c) => `"${c.name}" (${c.kind})`).join(", ")} phải được hậu lọc.`);
    }
}

/** Data-succinct: bỏ item không thuộc V của mọi ràng buộc S ⊆ V. Trả về giao dịch đã chuẩn hóa. */
function pruneDataSuccinct(D, constraints) {
    const filters = constraints.filter((c) => c.allowedItem);
    if (!filters.length) return { data: D, removedItemOccurrences: 0 };
    let removed = 0;
    const data = D.map((t) => {
        const kept = t.filter((x) => filters.every((f) => f.allowedItem(x)));
        removed += t.length - kept.length;
        return kept;
    });
    return { data, removedItemOccurrences: removed };
}

// Đếm support cho candidate (giống bước 4–7 của Apriori: thu gọn giao dịch rồi liệt kê tập con hoặc kiểm tra từng candidate).
function countCandidates(transactions, candidates, k) {
    const counts = new Map(candidates.map((c) => [itemsetKey(c), 0]));
    const candidateItems = new Set(candidates.flat());
    const enumerate = (items, start, chosen, cb) => {
        if (chosen.length === k) return cb(chosen);
        for (let i = start; i <= items.length - (k - chosen.length); i++) {
            chosen.push(items[i]);
            enumerate(items, i + 1, chosen, cb);
            chosen.pop();
        }
    };
    const binom = (n) => {
        let r = 1;
        for (let i = 1; i <= k; i++) {
            r = (r * (n - k + i)) / i;
            if (r > candidates.length) return Infinity;
        }
        return r;
    };
    for (const t of transactions) {
        if (t.length < k) continue;
        const reduced = t.filter((x) => candidateItems.has(x));
        if (reduced.length < k) continue;
        if (binom(reduced.length) <= candidates.length) {
            enumerate(reduced, 0, [], (subset) => {
                const key = itemsetKey(subset);
                const c = counts.get(key);
                if (c !== undefined) counts.set(key, c + 1);
            });
        } else {
            const present = new Set(reduced);
            for (const c of candidates) if (c.every((x) => present.has(x))) counts.set(itemsetKey(c), counts.get(itemsetKey(c)) + 1);
        }
    }
    return counts;
}

/**
 * Apriori có cắt tỉa theo ràng buộc anti-monotone.
 * @param {string[][]} transactions
 * @param {{minSupport: number, constraints?: object[]}} options
 */
function constrainedApriori(transactions, { minSupport, constraints = [] } = {}) {
    assertPushable(constraints);
    const D = normalizeTransactions(transactions);
    const minSupportCount = resolveMinSupportCount(minSupport, D.length); // |D| không đổi khi bỏ item
    const { data, removedItemOccurrences } = pruneDataSuccinct(D, constraints);

    const levels = [];
    let prunedByConstraint = 0;
    const L1all = findFrequent1Itemsets(data, minSupportCount);
    let current = L1all.filter((s) => satisfiesAll(constraints, s.items));
    prunedByConstraint += L1all.length - current.length;
    levels.push({ k: 1, generated: null, prunedByConstraint: L1all.length - current.length, counted: null, frequent: current.length });
    const all = [...current];
    for (let k = 2; current.length > 0; k++) {
        const { candidates } = aprioriGen(current);
        const kept = candidates.filter((c) => satisfiesAll(constraints, c));
        const pruned = candidates.length - kept.length;
        prunedByConstraint += pruned;
        let next = [];
        if (kept.length) {
            const counts = countCandidates(data, kept, k);
            for (const c of kept) {
                const support = counts.get(itemsetKey(c));
                if (support >= minSupportCount) next.push({ items: c, support });
            }
            next = sortItemsets(next);
        }
        levels.push({ k, generated: candidates.length, prunedByConstraint: pruned, counted: kept.length, frequent: next.length });
        all.push(...next);
        current = next;
    }
    return {
        itemsets: sortItemsets(all),
        stats: {
            algorithm: "apriori-constrained",
            transactionCount: D.length,
            minSupportCount,
            constraints: constraints.map((c) => c.name),
            removedItemOccurrences,
            levels,
            candidatesGenerated: levels.reduce((s, l) => s + (l.generated || 0), 0),
            prunedByConstraint,
            totalCandidates: levels.reduce((s, l) => s + (l.counted || 0), 0), // số candidate thực sự được đếm
        },
    };
}

/**
 * FP-Growth có cắt tỉa theo ràng buộc anti-monotone (cắt tỉa mẫu + cắt tỉa dữ liệu trong cơ sở mẫu điều kiện).
 * @param {string[][]} transactions
 * @param {{minSupport: number, constraints?: object[]}} options
 */
function constrainedFPGrowth(transactions, { minSupport, constraints = [] } = {}) {
    assertPushable(constraints);
    const D = normalizeTransactions(transactions);
    const minSupportCount = resolveMinSupportCount(minSupport, D.length);
    const { data, removedItemOccurrences } = pruneDataSuccinct(D, constraints);
    const sat = (items) => satisfiesAll(constraints, items);
    const output = [];
    const stats = { algorithm: "fp-growth-constrained", transactionCount: D.length, minSupportCount, constraints: constraints.map((c) => c.name), removedItemOccurrences, conditionalTrees: 0, prunedPatterns: 0, prunedBaseItems: 0, singlePathShortcuts: 0 };

    const tree = buildFPTree(data.map((items) => ({ items, count: 1 })), minSupportCount);
    stats.treeNodes = tree.nodeCount;

    const grow = (t, suffix) => {
        const path = singlePath(t);
        if (path) {
            // Mọi tổ hợp nút trên đường đi; thêm nút làm vi phạm thì bỏ nhánh đó (anti-monotone).
            const chosen = [];
            const walk = (start) => {
                for (let i = start; i < path.length; i++) {
                    const items = [...chosen, path[i].item, ...suffix];
                    if (!sat(items)) {
                        stats.prunedPatterns++;
                        continue;
                    }
                    output.push({ items, support: path[i].count });
                    chosen.push(path[i].item);
                    walk(i + 1);
                    chosen.pop();
                }
            };
            walk(0);
            if (path.length) stats.singlePathShortcuts++;
            return;
        }
        for (let h = t.header.length - 1; h >= 0; h--) {
            const { item, support } = t.header[h];
            const beta = [item, ...suffix];
            if (!sat(beta)) {
                stats.prunedPatterns++; // không xuất β và không dựng cây điều kiện của β
                continue;
            }
            output.push({ items: beta, support });
            const base = [];
            for (const entry of conditionalPatternBase(t, item)) {
                const items = entry.items.filter((x) => sat([x, ...beta]));
                stats.prunedBaseItems += entry.items.length - items.length;
                if (items.length) base.push({ items, count: entry.count });
            }
            const conditional = buildFPTree(base, minSupportCount, t.rank);
            stats.conditionalTrees++;
            if (conditional.header.length > 0) grow(conditional, beta);
        }
    };
    grow(tree, []);
    for (const s of output) s.items.sort(compareItems);
    return { itemsets: sortItemsets(output), stats };
}

/** Hậu lọc: giữ tập thỏa mọi ràng buộc (dùng cho mọi loại ràng buộc, kể cả không đẩy được). */
function postFilter(itemsets, constraints) {
    return itemsets.filter((s) => satisfiesAll(constraints, s.items));
}

const CONSTRAINED = { apriori: constrainedApriori, fpgrowth: constrainedFPGrowth };

module.exports = { constrainedApriori, constrainedFPGrowth, postFilter, CONSTRAINED, assertPushable };
