// Chọn và xếp hạng sản phẩm "mua kèm" từ luật kết hợp (hàm thuần, không truy cập DB).
//
// Luật phù hợp với sản phẩm đang xem P là luật có dạng  {P} ⇒ {Q}:
//   - vế trái đúng bằng {P}: ngữ cảnh duy nhất ta biết là khách đang xem P;
//   - vế phải đúng một sản phẩm Q: mỗi gợi ý ứng với một luật, dễ giải thích;
//   - lift > minLift (mặc định 1): loại luật tương quan âm hoặc độc lập (mục 6.3.2).
// Thứ tự: confidence giảm dần → lift giảm dần → support giảm dần → _id (để kết quả ổn định).
// Sau đó loại: chính P, sản phẩm trùng, sản phẩm không còn tồn tại, sản phẩm hết hàng.
// Nếu chưa đủ `limit`, bổ sung bằng fallback (cùng danh mục, rồi bán chạy) và đánh dấu rõ.

const SOURCE_RULE = "association-rule";
const SOURCE_FALLBACK = "fallback";

/** Tạo chỉ mục: productId -> các luật {productId} ⇒ {Q}. */
function indexSingleItemRules(rules) {
    const index = new Map();
    for (const rule of rules) {
        if (rule.antecedent.length !== 1 || rule.consequent.length !== 1) continue;
        const key = rule.antecedent[0];
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(rule);
    }
    for (const list of index.values()) list.sort(compareRules);
    return index;
}

function compareRules(a, b) {
    return (
        b.confidence - a.confidence ||
        b.lift - a.lift ||
        b.support - a.support ||
        (a.consequent[0] < b.consequent[0] ? -1 : a.consequent[0] > b.consequent[0] ? 1 : 0)
    );
}

const pct = (x) => `${Math.round(x * 100)}%`;

function explainRule(rule, viewedName, productName) {
    return (
        `${pct(rule.confidence)} đơn có "${viewedName}" cũng có "${productName}" ` +
        `(xuất hiện cùng nhau trong ${rule.supportCount} đơn, lift ${rule.lift.toFixed(2)}).`
    );
}

const isAvailable = (product) => Boolean(product) && product.is_stock !== false;

/**
 * @param {object} input
 * @param {string} input.productId     sản phẩm đang xem
 * @param {Map<string, object[]>} input.ruleIndex  kết quả indexSingleItemRules
 * @param {Map<string, object>} input.productsById  sản phẩm hiện có (đã đọc từ DB)
 * @param {Map<string, number>} input.itemCounts  số đơn chứa từng sản phẩm (cho fallback "bán chạy")
 * @param {{limit?: number, minLift?: number, fallback?: boolean}} [options]
 * @returns {{items: object[], matchedRuleCount: number, skipped: object}}
 */
function rankRecommendations(input, options = {}) {
    const { productId, ruleIndex, productsById, itemCounts = new Map() } = input;
    const { limit = 5, minLift = 1, fallback = true } = options;

    const viewed = productsById.get(productId);
    const viewedName = viewed ? viewed.name : productId;
    const chosen = new Set([productId]);
    const items = [];
    const skipped = { outOfStock: 0, missing: 0, lowLift: 0, duplicate: 0 };

    const candidates = ruleIndex.get(productId) || [];
    for (const rule of candidates) {
        if (items.length >= limit) break;
        const targetId = rule.consequent[0];
        if (chosen.has(targetId)) {
            skipped.duplicate++;
            continue;
        }
        if (!(rule.lift > minLift)) {
            skipped.lowLift++;
            continue;
        }
        const product = productsById.get(targetId);
        if (!product) {
            skipped.missing++;
            continue;
        }
        if (!isAvailable(product)) {
            skipped.outOfStock++;
            continue;
        }
        chosen.add(targetId);
        items.push({
            productId: targetId,
            source: SOURCE_RULE,
            rule: {
                antecedent: rule.antecedent,
                consequent: rule.consequent,
                support: rule.support,
                supportCount: rule.supportCount,
                confidence: rule.confidence,
                lift: rule.lift,
            },
            explanation: explainRule(rule, viewedName, product.name),
        });
    }

    if (fallback && items.length < limit) {
        const sales = (id) => itemCounts.get(id) || 0;
        const byPopularity = (a, b) => sales(b._id) - sales(a._id) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);
        const pool = [...productsById.values()].filter((p) => !chosen.has(p._id) && isAvailable(p));

        const sameCategory = viewed
            ? pool.filter((p) => p.category_id && p.category_id === viewed.category_id).sort(byPopularity)
            : [];
        const bestSellers = [...pool].sort(byPopularity);

        const push = (product, reason, explanation) => {
            if (items.length >= limit || chosen.has(product._id)) return;
            chosen.add(product._id);
            items.push({ productId: product._id, source: SOURCE_FALLBACK, fallbackReason: reason, rule: null, explanation });
        };
        for (const p of sameCategory) {
            push(p, "same-category", `Không đủ luật kết hợp: sản phẩm cùng danh mục, có trong ${sales(p._id)} đơn.`);
        }
        for (const p of bestSellers) {
            push(p, "best-seller", `Không đủ luật kết hợp: sản phẩm bán chạy, có trong ${sales(p._id)} đơn.`);
        }
    }

    return { items, matchedRuleCount: candidates.length, skipped };
}

module.exports = {
    SOURCE_RULE,
    SOURCE_FALLBACK,
    indexSingleItemRules,
    compareRules,
    rankRecommendations,
};
