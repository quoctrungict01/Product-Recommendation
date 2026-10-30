// Kiểm tra "ngân sách" trước khi khai phá, để không gây bùng nổ tập ứng viên hoặc treo máy.
// Chỉ quét dữ liệu một lần (O(tổng số item)); KHÔNG sửa Apriori/FP-Growth.
//
// Các đại lượng ước lượng:
//  - n1         : số item phổ biến (support ≥ min_sup)
//  - C2         : số ứng viên 2-itemset của Apriori = n1·(n1−1)/2
//  - maxLength  : độ dài giao dịch dài nhất sau khi bỏ item không phổ biến
//                 (FP-Growth trên một đường đi dài L sinh tới 2^L − 1 tổ hợp)
//  - upperBound : cận trên số tập phổ biến = Σ_t (2^{|t ∩ F1|} − 1), mọi tập phổ biến là tập con của một giao dịch

const { resolveMinSupportCount } = require("../../src/apps/services/mining/transactions");

const DEFAULT_LIMITS = Object.freeze({
    maxFrequentItems: 5000,
    maxCandidatePairs: 5_000_000,
    maxTransactionLength: 24,
    maxItemsetUpperBound: 20_000_000,
});

class MiningBudgetError extends Error {
    constructor(problems, estimate) {
        super(`Dừng trước khi khai phá để tránh bùng nổ tài nguyên:\n - ${problems.join("\n - ")}\nHãy tăng minSupport hoặc giảm dữ liệu.`);
        this.name = "MiningBudgetError";
        this.problems = problems;
        this.estimate = estimate;
    }
}

function estimateMiningCost(transactions, minSupport) {
    const minCount = resolveMinSupportCount(minSupport, transactions.length);
    const counts = new Map();
    for (const t of transactions) for (const x of new Set(t)) counts.set(x, (counts.get(x) || 0) + 1);
    const frequent = new Set([...counts].filter(([, c]) => c >= minCount).map(([x]) => x));
    let maxLength = 0;
    let upperBound = 0;
    for (const t of transactions) {
        let len = 0;
        for (const x of new Set(t)) if (frequent.has(x)) len++;
        maxLength = Math.max(maxLength, len);
        upperBound += len >= 53 ? Number.MAX_SAFE_INTEGER : 2 ** len - 1;
        if (upperBound > Number.MAX_SAFE_INTEGER / 2) upperBound = Number.MAX_SAFE_INTEGER;
    }
    const n1 = frequent.size;
    return { transactions: transactions.length, minSupportCount: minCount, items: counts.size, frequentItems: n1, candidatePairs: (n1 * (n1 - 1)) / 2, maxLength, upperBound };
}

/** Ném MiningBudgetError nếu ước lượng vượt giới hạn; trả về ước lượng nếu an toàn. */
function assertMiningBudget(transactions, minSupport, limits = DEFAULT_LIMITS) {
    const e = estimateMiningCost(transactions, minSupport);
    const L = { ...DEFAULT_LIMITS, ...limits };
    const problems = [];
    if (e.frequentItems > L.maxFrequentItems) problems.push(`${e.frequentItems} item phổ biến > giới hạn ${L.maxFrequentItems}`);
    if (e.candidatePairs > L.maxCandidatePairs) problems.push(`${e.candidatePairs} ứng viên 2-itemset > giới hạn ${L.maxCandidatePairs}`);
    if (e.maxLength > L.maxTransactionLength) problems.push(`giao dịch dài ${e.maxLength} item phổ biến > giới hạn ${L.maxTransactionLength}`);
    if (e.upperBound > L.maxItemsetUpperBound) problems.push(`cận trên số tập phổ biến ${e.upperBound} > giới hạn ${L.maxItemsetUpperBound}`);
    if (problems.length) throw new MiningBudgetError(problems, e);
    return e;
}

module.exports = { DEFAULT_LIMITS, MiningBudgetError, estimateMiningCost, assertMiningBudget };
