// Service gợi ý "mua kèm": đọc đơn hàng -> giao dịch -> khai phá (Apriori hoặc FP-Growth,
// dùng lại module services/mining) -> luật -> xếp hạng.
//
// Cache (trong bộ nhớ tiến trình):
//  - Snapshot giao dịch: đọc toàn bộ đơn một lần, dùng chung cho cả hai thuật toán.
//  - Mô hình luật: mỗi bộ (algorithm, minSupport, minConfidence) khai phá một lần.
//  - Làm mới khi: (1) quá TTL; (2) "dấu vân tay" đơn hàng (số đơn + _id mới nhất) thay đổi,
//    được kiểm tra tối đa mỗi `fingerprintIntervalMs`; (3) gọi invalidate() / POST /refresh.
//  - Nhiều request đồng thời cùng chờ một lần khai phá (không khai phá trùng).

const { performance } = require("perf_hooks");
const { mine } = require("../mining");
const { transactionsFromOrders } = require("../mining/transactions");
const { indexSingleItemRules, rankRecommendations } = require("./ranking");

const ALGORITHMS = ["apriori", "fpgrowth"];
const DEFAULTS = Object.freeze({ algorithm: "fpgrowth", minSupport: 0.01, minConfidence: 0.2, limit: 5 });
const LIMITS = Object.freeze({ minSupport: [0.002, 0.5], minConfidence: [0, 1], limit: [1, 5] });

class RecommendationError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "RecommendationError";
        this.status = status;
        this.code = code;
    }
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Kiểm tra và chuẩn hóa tham số truy vấn. Ném RecommendationError(400) nếu sai. */
function parseOptions(query = {}) {
    const read = (name, fallback) => {
        const raw = query[name];
        if (raw === undefined || raw === "") return fallback;
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new RecommendationError(400, "INVALID_PARAM", `${name} phải là số.`);
        return value;
    };
    const algorithm = String(query.algorithm || DEFAULTS.algorithm).toLowerCase().replace("-", "");
    if (!ALGORITHMS.includes(algorithm)) {
        throw new RecommendationError(400, "INVALID_ALGORITHM", "algorithm phải là 'apriori' hoặc 'fpgrowth'.");
    }
    const minSupport = read("minSupport", DEFAULTS.minSupport);
    const minConfidence = read("minConfidence", DEFAULTS.minConfidence);
    const limit = read("limit", DEFAULTS.limit);

    const [sLo, sHi] = LIMITS.minSupport;
    if (minSupport < sLo || minSupport > sHi) {
        throw new RecommendationError(400, "INVALID_PARAM", `minSupport phải nằm trong [${sLo}, ${sHi}] (tỷ lệ số đơn).`);
    }
    if (minConfidence < LIMITS.minConfidence[0] || minConfidence > LIMITS.minConfidence[1]) {
        throw new RecommendationError(400, "INVALID_PARAM", "minConfidence phải nằm trong [0, 1].");
    }
    if (!Number.isInteger(limit) || limit < LIMITS.limit[0] || limit > LIMITS.limit[1]) {
        throw new RecommendationError(400, "INVALID_PARAM", "limit phải là số nguyên từ 1 đến 5.");
    }
    return { algorithm, minSupport, minConfidence, limit };
}

/** Chuẩn hóa sản phẩm từ DB về dạng phẳng, _id và category_id là chuỗi, price là số. */
function toPlainProduct(doc) {
    const price = Number(doc.price);
    return {
        _id: String(doc._id),
        name: doc.name,
        image: doc.image,
        price: Number.isFinite(price) ? price : doc.price,
        category_id: doc.category_id ? String(doc.category_id) : null,
        is_stock: doc.is_stock !== false,
    };
}

/**
 * @param {object} deps
 * @param {() => Promise<object[]>} deps.loadOrders      đơn hàng dạng {items:[{prd_id}]}
 * @param {() => Promise<string>} deps.loadFingerprint   chuỗi thay đổi khi đơn hàng thay đổi
 * @param {() => Promise<object[]>} deps.loadProducts    sản phẩm hiện có
 * @param {{ttlMs?: number, fingerprintIntervalMs?: number, now?: () => number}} [config]
 */
function createRecommendationService(deps, config = {}) {
    const { loadOrders, loadFingerprint, loadProducts } = deps;
    const { ttlMs = 10 * 60 * 1000, fingerprintIntervalMs = 30 * 1000, now = () => Date.now() } = config;

    let snapshot = null; // { fingerprint, transactions, itemCounts, loadedAt, loadMs, version }
    let snapshotPromise = null;
    let lastFingerprintCheck = 0;
    let version = 0;
    let lastInvalidation = null;
    const models = new Map(); // key -> { promise, value }

    async function loadSnapshot() {
        const start = performance.now();
        const [orders, fingerprint] = await Promise.all([loadOrders(), loadFingerprint()]);
        const transactions = transactionsFromOrders(orders);
        const itemCounts = new Map();
        for (const t of transactions) for (const id of t) itemCounts.set(id, (itemCounts.get(id) || 0) + 1);
        version++;
        return { fingerprint, transactions, itemCounts, loadedAt: now(), loadMs: performance.now() - start, version };
    }

    async function getSnapshot() {
        if (snapshot && now() - snapshot.loadedAt > ttlMs) invalidate("ttl");
        if (snapshot && now() - lastFingerprintCheck >= fingerprintIntervalMs) {
            lastFingerprintCheck = now();
            const current = await loadFingerprint();
            if (current !== snapshot.fingerprint) invalidate("orders-changed");
        }
        if (snapshot) return snapshot;
        if (!snapshotPromise) {
            snapshotPromise = loadSnapshot()
                .then((s) => {
                    snapshot = s;
                    lastFingerprintCheck = now();
                    return s;
                })
                .finally(() => {
                    snapshotPromise = null;
                });
        }
        return snapshotPromise;
    }

    async function getModel({ algorithm, minSupport, minConfidence }) {
        const snap = await getSnapshot();
        const key = `${snap.version}|${algorithm}|${minSupport}|${minConfidence}`;
        const cached = models.get(key);
        if (cached?.value) return { ...cached.value, cache: "hit" };
        if (cached?.promise) return { ...(await cached.promise), cache: "hit" };

        const promise = (async () => {
            const start = performance.now();
            const { itemsets, rules, stats } = mine(snap.transactions, { algorithm, minSupport, minConfidence });
            const miningMs = performance.now() - start;
            return {
                algorithm,
                minSupport,
                minConfidence,
                ruleIndex: indexSingleItemRules(rules),
                ruleCount: rules.length,
                frequentItemsetCount: itemsets.length,
                transactionCount: stats.transactionCount,
                minSupportCount: stats.minSupportCount,
                miningMs,
                minedAt: new Date(now()).toISOString(),
                itemCounts: snap.itemCounts,
                snapshotVersion: snap.version,
            };
        })();
        models.set(key, { promise });
        try {
            const value = await promise;
            models.set(key, { value });
            return { ...value, cache: "miss" };
        } catch (err) {
            models.delete(key);
            throw err;
        }
    }

    async function recommend(productId, query = {}) {
        if (typeof productId !== "string" || !OBJECT_ID.test(productId)) {
            throw new RecommendationError(400, "INVALID_PRODUCT_ID", "productId không hợp lệ.");
        }
        const options = parseOptions(query);

        let products;
        let model;
        try {
            [products, model] = await Promise.all([loadProducts(), getModel(options)]);
        } catch (err) {
            if (err instanceof RecommendationError) throw err;
            const wrapped = new RecommendationError(503, "DATA_UNAVAILABLE", "Không đọc được dữ liệu sản phẩm/đơn hàng.");
            wrapped.cause = err;
            throw wrapped;
        }

        const productsById = new Map(products.map(toPlainProduct).map((p) => [p._id, p]));
        const viewed = productsById.get(productId);
        if (!viewed) throw new RecommendationError(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");

        const ranked = rankRecommendations(
            { productId, ruleIndex: model.ruleIndex, productsById, itemCounts: model.itemCounts },
            { limit: options.limit }
        );

        const items = ranked.items.map((item) => {
            const p = productsById.get(item.productId);
            return {
                product: { _id: p._id, name: p.name, image: p.image, price: p.price, category_id: p.category_id },
                source: item.source,
                ...(item.fallbackReason ? { fallbackReason: item.fallbackReason } : {}),
                rule: item.rule,
                explanation: item.explanation,
            };
        });

        return {
            productId,
            algorithm: options.algorithm,
            params: { minSupport: options.minSupport, minConfidence: options.minConfidence, limit: options.limit },
            items,
            meta: {
                ruleCount: model.ruleCount,
                matchedRuleCount: ranked.matchedRuleCount,
                ruleItemCount: items.filter((i) => i.source === "association-rule").length,
                fallbackCount: items.filter((i) => i.source === "fallback").length,
                skipped: ranked.skipped,
                frequentItemsetCount: model.frequentItemsetCount,
                transactionCount: model.transactionCount,
                minSupportCount: model.minSupportCount,
                miningMs: Number(model.miningMs.toFixed(2)),
                minedAt: model.minedAt,
                cache: model.cache,
            },
        };
    }

    function invalidate(reason = "manual") {
        snapshot = null;
        models.clear();
        lastInvalidation = { reason, at: new Date(now()).toISOString() };
        return lastInvalidation;
    }

    function status() {
        return {
            snapshot: snapshot
                ? {
                      transactionCount: snapshot.transactions.length,
                      loadedAt: new Date(snapshot.loadedAt).toISOString(),
                      loadMs: Number(snapshot.loadMs.toFixed(2)),
                      fingerprint: snapshot.fingerprint,
                      version: snapshot.version,
                  }
                : null,
            cachedModels: [...models.values()]
                .filter((m) => m.value)
                .map(({ value: v }) => ({
                    algorithm: v.algorithm,
                    minSupport: v.minSupport,
                    minConfidence: v.minConfidence,
                    ruleCount: v.ruleCount,
                    frequentItemsetCount: v.frequentItemsetCount,
                    miningMs: Number(v.miningMs.toFixed(2)),
                    minedAt: v.minedAt,
                })),
            ttlMs,
            fingerprintIntervalMs,
            lastInvalidation,
        };
    }

    return { recommend, invalidate, status, getModel };
}

module.exports = {
    ALGORITHMS,
    DEFAULTS,
    LIMITS,
    RecommendationError,
    parseOptions,
    toPlainProduct,
    createRecommendationService,
};
