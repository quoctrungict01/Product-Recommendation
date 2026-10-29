// Thuật toán Apriori — Han, Kamber, Pei, "Data Mining: Concepts and Techniques" (3rd Ed),
// mục 6.2.1, Hình 6.4.
//
//   (1) L1 = find_frequent_1-itemsets(D)
//   (2) for (k = 2; L(k-1) != rỗng; k++)
//   (3)     Ck = apriori_gen(L(k-1))          // join + prune
//   (4-7)   với mỗi giao dịch t: Ct = subset(Ck, t); tăng count cho mỗi c thuộc Ct
//   (9)     Lk = { c thuộc Ck | c.count >= min_sup }
//   (11) return L = hợp các Lk

const { normalizeTransactions, resolveMinSupportCount } = require("./transactions");
const { itemsetKey, sortItemsets } = require("./itemset");

/** Bước (1): đếm support cho từng item và giữ các item có count >= min_sup. */
function findFrequent1Itemsets(transactions, minSupportCount) {
    const counts = new Map();
    for (const t of transactions) {
        for (const item of t) counts.set(item, (counts.get(item) || 0) + 1);
    }
    const L1 = [];
    for (const [item, support] of counts) {
        if (support >= minSupportCount) L1.push({ items: [item], support });
    }
    return sortItemsets(L1);
}

/**
 * Kiểm tra tính chất Apriori: mọi (k-1)-subset của candidate phải phổ biến.
 * `previousKeys` là tập khóa của L(k-1).
 */
function hasInfrequentSubset(candidate, previousKeys) {
    for (let skip = 0; skip < candidate.length; skip++) {
        const subset = candidate.filter((_, i) => i !== skip);
        if (!previousKeys.has(itemsetKey(subset))) return true;
    }
    return false;
}

/**
 * apriori_gen: sinh Ck từ L(k-1).
 * Join: l1 và l2 nối được khi giống nhau ở k-2 item đầu và l1[k-2] < l2[k-2]
 *       (các itemset đều đã sắp xếp nên điều kiện này đảm bảo không sinh trùng).
 * Prune: loại candidate có (k-1)-subset không thuộc L(k-1).
 *
 * Trả về cả số candidate sau join để kiểm chứng với ví dụ trong sách.
 */
function aprioriGen(previousLevel) {
    const prev = previousLevel.map((x) => x.items); // đã được sắp xếp từ điển
    const previousKeys = new Set(prev.map(itemsetKey));
    const k = prev.length > 0 ? prev[0].length + 1 : 0;

    const candidates = [];
    let joined = 0;
    for (let i = 0; i < prev.length; i++) {
        const l1 = prev[i];
        for (let j = i + 1; j < prev.length; j++) {
            const l2 = prev[j];
            // Vì L(k-1) đã sắp xếp, các itemset chung tiền tố (k-2) nằm liền nhau.
            if (!samePrefix(l1, l2, k - 2)) break;
            const candidate = [...l1, l2[k - 2]];
            joined++;
            if (!hasInfrequentSubset(candidate, previousKeys)) candidates.push(candidate);
        }
    }
    return { candidates, joined };
}

function samePrefix(a, b, length) {
    for (let i = 0; i < length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/** Số tổ hợp C(n, k), dừng sớm khi vượt `limit` để tránh tràn số. */
function combinationsUpTo(n, k, limit) {
    if (k > n) return 0;
    let result = 1;
    for (let i = 1; i <= k; i++) {
        result = (result * (n - k + i)) / i;
        if (result > limit) return limit + 1;
    }
    return Math.round(result);
}

/** Duyệt mọi k-subset của mảng đã sắp xếp `items` (giữ thứ tự). */
function forEachSubset(items, k, callback) {
    const chosen = new Array(k);
    const walk = (start, depth) => {
        if (depth === k) {
            callback(chosen);
            return;
        }
        for (let i = start; i <= items.length - (k - depth); i++) {
            chosen[depth] = items[i];
            walk(i + 1, depth + 1);
        }
    };
    walk(0, 0);
}

/**
 * Bước (4)-(7): đếm support của các candidate.
 * Hàm subset(Ck, t) được cài theo hai cách và tự chọn cách rẻ hơn cho từng giao dịch:
 *  - liệt kê các k-subset của t rồi tra trong bảng băm của Ck (khi t ngắn), hoặc
 *  - kiểm tra từng candidate có nằm trong t hay không (khi Ck nhỏ).
 * Trước đó, t được thu gọn chỉ còn các item xuất hiện trong Ck (item khác không thể
 * thuộc candidate nào), đây là kỹ thuật giảm giao dịch ở mục 6.2.3.
 */
function countCandidates(transactions, candidates, k) {
    const counts = new Map();
    const candidateItems = new Set();
    for (const c of candidates) {
        counts.set(itemsetKey(c), 0);
        for (const item of c) candidateItems.add(item);
    }

    for (const t of transactions) {
        if (t.length < k) continue;
        const reduced = t.filter((item) => candidateItems.has(item));
        if (reduced.length < k) continue;

        if (combinationsUpTo(reduced.length, k, candidates.length) <= candidates.length) {
            forEachSubset(reduced, k, (subset) => {
                const key = itemsetKey(subset);
                const current = counts.get(key);
                if (current !== undefined) counts.set(key, current + 1);
            });
        } else {
            const present = new Set(reduced);
            for (const c of candidates) {
                if (c.every((item) => present.has(item))) {
                    const key = itemsetKey(c);
                    counts.set(key, counts.get(key) + 1);
                }
            }
        }
    }
    return counts;
}

/**
 * Chạy Apriori.
 * @param {string[][]} transactions danh sách giao dịch
 * @param {{minSupport: number}} options minSupport: tỷ lệ (0,1) hoặc số đếm nguyên >= 1
 * @returns {{itemsets: {items: string[], support: number}[], stats: object}}
 */
function apriori(transactions, options = {}) {
    const D = normalizeTransactions(transactions);
    const minSupportCount = resolveMinSupportCount(options.minSupport, D.length);

    const levels = [];
    const all = [];

    let current = findFrequent1Itemsets(D, minSupportCount);
    levels.push({ k: 1, joined: null, candidates: null, frequent: current.length });
    all.push(...current);

    for (let k = 2; current.length > 0; k++) {
        const { candidates, joined } = aprioriGen(current);
        let next = [];
        if (candidates.length > 0) {
            const counts = countCandidates(D, candidates, k);
            for (const c of candidates) {
                const support = counts.get(itemsetKey(c));
                if (support >= minSupportCount) next.push({ items: c, support });
            }
            next = sortItemsets(next);
        }
        levels.push({ k, joined, candidates: candidates.length, frequent: next.length });
        all.push(...next);
        current = next;
    }

    return {
        itemsets: sortItemsets(all),
        stats: {
            algorithm: "apriori",
            transactionCount: D.length,
            minSupportCount,
            levels,
            totalCandidates: levels.reduce((sum, l) => sum + (l.candidates || 0), 0),
        },
    };
}

module.exports = {
    apriori,
    aprioriGen,
    findFrequent1Itemsets,
    hasInfrequentSubset,
};
