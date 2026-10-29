// Sinh luật kết hợp từ tập mục phổ biến — mục 6.2.2 (công thức 6.4),
// và các độ đo đánh giá — mục 6.3.2 (lift, 6.8), 6.3.3 (Kulczynski 6.11, IR 6.13).
//
// Với mỗi tập phổ biến l và mỗi tập con khác rỗng s ⊂ l (s ≠ l):
//     luật s ⇒ (l − s),  confidence = support_count(l) / support_count(s).
// Mọi tập con của tập phổ biến đều phổ biến (tính chất Apriori),
// nên support của s và (l − s) luôn có sẵn trong kết quả khai phá.

const { itemsetKey, toSupportMap, compareItemsets } = require("./itemset");

/**
 * Tính các độ đo cho luật A ⇒ B.
 * @param {number} supAB support count của A ∪ B
 * @param {number} supA  support count của A
 * @param {number} supB  support count của B
 * @param {number} n     tổng số giao dịch |D|
 */
function ruleMeasures(supAB, supA, supB, n) {
    const confidence = supAB / supA; // P(B|A)
    const reverseConfidence = supAB / supB; // P(A|B)
    const unionCount = supA + supB - supAB; // số giao dịch chứa A hoặc B
    return {
        support: supAB / n,
        supportCount: supAB,
        confidence,
        // lift(A,B) = P(A∪B) / (P(A)P(B)) = confidence / P(B)
        lift: (supAB * n) / (supA * supB),
        // Kulc(A,B) = 1/2 (P(A|B) + P(B|A))
        kulczynski: (confidence + reverseConfidence) / 2,
        // IR(A,B) = |sup(A) − sup(B)| / (sup(A) + sup(B) − sup(A∪B))
        imbalanceRatio: unionCount === 0 ? 0 : Math.abs(supA - supB) / unionCount,
    };
}

/** Duyệt mọi tập con khác rỗng và thực sự (proper) của `items`, giữ thứ tự. */
function forEachProperSubset(items, callback) {
    const n = items.length;
    const total = 1 << n; // itemset trong giỏ hàng nhỏ, n < 31 là đủ
    for (let mask = 1; mask < total - 1; mask++) {
        const antecedent = [];
        const consequent = [];
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) antecedent.push(items[i]);
            else consequent.push(items[i]);
        }
        callback(antecedent, consequent);
    }
}

/**
 * Sinh luật kết hợp mạnh.
 * @param {{items: string[], support: number}[]} itemsets kết quả của apriori() hoặc fpGrowth()
 * @param {{transactionCount: number, minConfidence?: number}} options
 * @returns {object[]} danh sách luật, sắp xếp theo confidence rồi lift giảm dần
 */
function generateRules(itemsets, options = {}) {
    const { transactionCount, minConfidence = 0 } = options;
    if (!Number.isInteger(transactionCount) || transactionCount < 0) {
        throw new TypeError("transactionCount phải là số nguyên không âm.");
    }
    if (typeof minConfidence !== "number" || !(minConfidence >= 0 && minConfidence <= 1)) {
        throw new RangeError("minConfidence phải nằm trong đoạn [0, 1].");
    }

    const supportMap = toSupportMap(itemsets);
    const rules = [];

    for (const { items, support } of itemsets) {
        if (items.length < 2) continue;
        if (items.length > 30) {
            throw new RangeError("Itemset quá dài (> 30 item) để liệt kê tập con khi sinh luật.");
        }
        forEachProperSubset(items, (antecedent, consequent) => {
            const supA = supportMap.get(itemsetKey(antecedent));
            const supB = supportMap.get(itemsetKey(consequent));
            if (supA === undefined || supB === undefined) {
                throw new Error(
                    "Thiếu support của tập con. Danh sách itemsets phải đầy đủ (đóng theo tập con)."
                );
            }
            const measures = ruleMeasures(support, supA, supB, transactionCount);
            if (measures.confidence + 1e-12 >= minConfidence) {
                rules.push({ antecedent, consequent, ...measures });
            }
        });
    }

    return rules.sort(
        (a, b) =>
            b.confidence - a.confidence ||
            b.lift - a.lift ||
            compareItemsets({ items: a.antecedent }, { items: b.antecedent }) ||
            compareItemsets({ items: a.consequent }, { items: b.consequent })
    );
}

module.exports = {
    generateRules,
    ruleMeasures,
};
