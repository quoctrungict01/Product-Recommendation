// Module khai phá tập mục phổ biến và luật kết hợp (Chương 6).
// Thuần JavaScript, không phụ thuộc MongoDB, nên kiểm thử và benchmark được offline.

const { apriori } = require("./apriori");
const { fpGrowth } = require("./fpgrowth");
const { generateRules, ruleMeasures } = require("./rules");
const { normalizeTransactions, transactionsFromOrders, resolveMinSupportCount } = require("./transactions");

const ALGORITHMS = {
    apriori,
    fpgrowth: fpGrowth,
    "fp-growth": fpGrowth,
};

/**
 * Khai phá tập phổ biến bằng thuật toán được chọn rồi sinh luật.
 * @param {string[][]} transactions
 * @param {{algorithm?: string, minSupport: number, minConfidence?: number}} options
 */
function mine(transactions, options = {}) {
    const { algorithm = "fpgrowth", minSupport, minConfidence = 0 } = options;
    const run = ALGORITHMS[String(algorithm).toLowerCase()];
    if (!run) throw new RangeError(`Thuật toán không hỗ trợ: ${algorithm}`);

    const { itemsets, stats } = run(transactions, { minSupport });
    const rules = generateRules(itemsets, { transactionCount: stats.transactionCount, minConfidence });
    return { itemsets, rules, stats };
}

module.exports = {
    apriori,
    fpGrowth,
    generateRules,
    ruleMeasures,
    mine,
    normalizeTransactions,
    transactionsFromOrders,
    resolveMinSupportCount,
};
