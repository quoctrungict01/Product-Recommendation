// Các phương pháp gợi ý được đánh giá. Mỗi phương pháp là một "factory":
//   factory.fit(history, products) -> { recommend(query) -> [{productId, source}] }
// `history` là các đơn ĐƯỢC PHÉP dùng để học (không bao giờ chứa đơn đánh giá).
// Mọi phương pháp: không gợi ý chính sản phẩm đang xem, không trùng, bỏ sản phẩm hết hàng.
//
// Hệ thống hiện tại được đánh giá bằng CHÍNH code của website:
//   mine() (services/mining) + indexSingleItemRules/rankRecommendations (services/recommendation/ranking).

const { performance } = require("perf_hooks");
const { mine } = require("../../src/apps/services/mining");
const { indexSingleItemRules, rankRecommendations } = require("../../src/apps/services/recommendation/ranking");
const { toPlainProduct } = require("../../src/apps/services/recommendation/service");
const { createRandom } = require("../../src/apps/services/mining/synthetic");
const { assertMiningBudget } = require("./budget");

const BASELINE = "baseline";
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Số đơn trong lịch sử chứa từng sản phẩm. */
function itemCountsOf(history) {
    const counts = new Map();
    for (const o of history) for (const id of new Set(o.items)) counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
}

function availableProducts(products) {
    return products.filter((p) => p.is_stock !== false);
}

function popularityOrder(products, counts) {
    return [...products].sort((a, b) => (counts.get(b._id) || 0) - (counts.get(a._id) || 0) || byId(a._id, b._id));
}

const asItems = (ids, source = BASELINE) => ids.map((productId) => ({ productId, source }));

/** Băm chuỗi thành số 32-bit (FNV-1a), dùng tạo seed riêng cho từng truy vấn. */
function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// ---------------------------------------------------------------- baseline

/** Random: hoán vị ngẫu nhiên danh mục còn hàng. Seed riêng mỗi truy vấn nên kết quả không phụ thuộc thứ tự chạy. */
function randomRecommender({ seed = 42, k = 5 } = {}) {
    return {
        name: "random",
        label: `Random (seed ${seed})`,
        fit(history, products) {
            const pool = availableProducts(products).map((p) => p._id).sort(byId);
            return {
                recommend(query) {
                    const random = createRandom((seed ^ hashString(query)) >>> 0);
                    const ids = pool.filter((id) => id !== query);
                    for (let i = ids.length - 1; i > 0; i--) {
                        const j = Math.floor(random() * (i + 1));
                        [ids[i], ids[j]] = [ids[j], ids[i]];
                    }
                    return asItems(ids.slice(0, k));
                },
            };
        },
    };
}

/** Most Popular: sản phẩm có trong nhiều đơn lịch sử nhất. */
function mostPopularRecommender({ k = 5 } = {}) {
    return {
        name: "most-popular",
        label: "Most Popular",
        fit(history, products) {
            const ranked = popularityOrder(availableProducts(products), itemCountsOf(history)).map((p) => p._id);
            return { recommend: (query) => asItems(ranked.filter((id) => id !== query).slice(0, k)) };
        },
    };
}

/** Category-Based: sản phẩm cùng danh mục, bán chạy trước; nếu chưa đủ K thì bổ sung bằng Most Popular. */
function categoryBasedRecommender({ k = 5 } = {}) {
    return {
        name: "category-based",
        label: "Category-Based (cùng danh mục → bán chạy)",
        fit(history, products) {
            const ranked = popularityOrder(availableProducts(products), itemCountsOf(history));
            const categoryOf = new Map(products.map((p) => [p._id, p.category_id]));
            return {
                recommend(query) {
                    const category = categoryOf.get(query);
                    const same = ranked.filter((p) => p._id !== query && p.category_id === category).map((p) => p._id);
                    const rest = ranked.filter((p) => p._id !== query && p.category_id !== category).map((p) => p._id);
                    return asItems([...same, ...rest].slice(0, k));
                },
            };
        },
    };
}

/**
 * Co-occurrence: đếm số đơn có cả q và x, xếp giảm dần theo số đếm (logic cũ của
 * controllers/apis/productsuggestions.js: ngưỡng support 1% và confidence 1%, xếp theo số lần mua cùng).
 * Không bổ sung fallback, nên danh sách có thể ngắn hơn K.
 */
function cooccurrenceRecommender({ k = 5, minSupport = 0.01, minConfidence = 0.01 } = {}) {
    return {
        name: "co-occurrence",
        label: `Co-occurrence (logic cũ, sup ≥ ${minSupport * 100}%, conf ≥ ${minConfidence * 100}%)`,
        fit(history, products) {
            const counts = itemCountsOf(history);
            const available = new Set(availableProducts(products).map((p) => p._id));
            const pairs = new Map(); // q -> Map(x -> count)
            for (const o of history) {
                const items = [...new Set(o.items)];
                for (const a of items) {
                    for (const b of items) {
                        if (a === b) continue;
                        if (!pairs.has(a)) pairs.set(a, new Map());
                        pairs.get(a).set(b, (pairs.get(a).get(b) || 0) + 1);
                    }
                }
            }
            const n = history.length;
            return {
                recommend(query) {
                    const row = pairs.get(query);
                    if (!row) return [];
                    const qCount = counts.get(query) || 0;
                    const ids = [...row.entries()]
                        .filter(([x, c]) => x !== query && available.has(x) && c / n >= minSupport && c / qCount >= minConfidence)
                        .sort((a, b) => b[1] - a[1] || byId(a[0], b[0]))
                        .map(([x]) => x);
                    return asItems(ids.slice(0, k));
                },
            };
        },
    };
}

// ---------------------------------------------------------------- hệ thống hiện tại

/**
 * Luật kết hợp như website: mine() -> luật {q} ⇒ {x}, lift > 1, xếp confidence → lift → support,
 * loại hàng hết/trùng/chính q; `fallback: true` bổ sung cùng danh mục rồi bán chạy (giống API).
 */
function associationRuleRecommender({ algorithm = "fpgrowth", minSupport = 0.01, minConfidence = 0.2, fallback = true, k = 5, label } = {}) {
    return {
        name: `rules-${algorithm}-${fallback ? "with-fallback" : "rules-only"}`,
        label: label || `Luật kết hợp ${algorithm} (sup ${minSupport}, conf ${minConfidence})${fallback ? " + fallback" : ", chỉ luật"}`,
        params: { algorithm, minSupport, minConfidence, fallback },
        fit(history, products) {
            const transactions = history.map((o) => o.items);
            assertMiningBudget(transactions, minSupport); // dừng sớm nếu có nguy cơ bùng nổ
            const start = performance.now();
            const { rules, itemsets, stats } = mine(transactions, { algorithm, minSupport, minConfidence });
            const miningMs = performance.now() - start;
            const ruleIndex = indexSingleItemRules(rules);
            const productsById = new Map(products.map(toPlainProduct).map((p) => [p._id, p]));
            const itemCounts = itemCountsOf(history);
            return {
                stats: { miningMs, ruleCount: rules.length, itemsetCount: itemsets.length, minSupportCount: stats.minSupportCount },
                recommend(query) {
                    return rankRecommendations({ productId: query, ruleIndex, productsById, itemCounts }, { limit: k, fallback }).items.map(
                        (i) => ({ productId: i.productId, source: i.source })
                    );
                },
            };
        },
    };
}

module.exports = {
    BASELINE,
    itemCountsOf,
    hashString,
    randomRecommender,
    mostPopularRecommender,
    categoryBasedRecommender,
    cooccurrenceRecommender,
    associationRuleRecommender,
};
