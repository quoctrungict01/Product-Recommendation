const test = require("node:test");
const assert = require("node:assert/strict");

const { createRecommendationService, parseOptions, RecommendationError } = require("../../src/apps/services/recommendation/service");
const { P, products, makeOrders } = require("./fixtures");

const QUERY = { minSupport: "0.05", minConfidence: "0.1" };

/** Loader giả có đếm số lần gọi và cho phép đổi dữ liệu/ném lỗi. */
function fakeDeps({ orders = makeOrders(), items = products } = {}) {
    const state = { orders, products: items, fingerprint: "v1", calls: { orders: 0, products: 0, fingerprint: 0 }, fail: {} };
    const maybeFail = async (name, value) => {
        state.calls[name]++;
        if (state.fail[name]) throw new Error(`boom-${name}`);
        return value();
    };
    return {
        state,
        deps: {
            loadOrders: () => maybeFail("orders", () => state.orders),
            loadProducts: () => maybeFail("products", () => state.products),
            loadFingerprint: () => maybeFail("fingerprint", () => state.fingerprint),
        },
    };
}

const stripTiming = (data) => ({ ...data, algorithm: "-", meta: { ...data.meta, miningMs: 0, minedAt: "-", cache: "-" } });

test("Gợi ý đúng thứ tự, loại hết hàng/lift<=1, bổ sung fallback và đánh dấu nguồn", async () => {
    const { deps } = fakeDeps();
    const service = createRecommendationService(deps);
    const data = await service.recommend(P.phone, { ...QUERY, algorithm: "fpgrowth" });

    assert.deepEqual(
        data.items.map((i) => [i.product.name, i.source, i.fallbackReason || null]),
        [
            ["Ốp X", "association-rule", null], // conf 80%, lift 2.67
            ["Kính X", "association-rule", null], // conf 53%, lift 2.67
            ["Phone Z", "fallback", "same-category"],
            ["Phone Y", "fallback", "same-category"],
            ["Cáp phổ biến", "fallback", "best-seller"],
        ]
    );
    const [first] = data.items;
    assert.equal(first.rule.supportCount, 12);
    assert.ok(Math.abs(first.rule.confidence - 0.8) < 1e-12);
    assert.ok(Math.abs(first.rule.lift - 40 / 15) < 1e-12);
    assert.ok(Math.abs(first.rule.support - 12 / 40) < 1e-12);
    assert.equal(first.product.price, 200000, "price String trong DB được trả về dạng số");

    assert.equal(data.meta.ruleItemCount, 2);
    assert.equal(data.meta.fallbackCount, 3);
    assert.equal(data.meta.transactionCount, 40);
    assert.equal(data.meta.minSupportCount, 2);
    assert.deepEqual(data.meta.skipped, { outOfStock: 1, missing: 0, lowLift: 1, duplicate: 0 });
    assert.ok(!data.items.some((i) => i.product._id === P.phone || i.product._id === P.soldOut));
});

test("Apriori và FP-Growth cho cùng gợi ý trên cùng đầu vào", async () => {
    const { deps } = fakeDeps();
    const service = createRecommendationService(deps);
    for (const productId of Object.values(P)) {
        for (const q of [QUERY, { minSupport: "0.1", minConfidence: "0.3" }, { minSupport: "0.025", minConfidence: "0" }]) {
            const a = await service.recommend(productId, { ...q, algorithm: "apriori" });
            const f = await service.recommend(productId, { ...q, algorithm: "fpgrowth" });
            assert.equal(a.algorithm, "apriori");
            assert.equal(f.algorithm, "fpgrowth");
            assert.deepEqual(stripTiming(a), stripTiming(f), `${productId} ${JSON.stringify(q)}`);
        }
    }
});

test("Cache: đọc đơn một lần, mỗi bộ tham số khai phá một lần, request đồng thời dùng chung", async () => {
    const { deps, state } = fakeDeps();
    const service = createRecommendationService(deps);

    const [r1, r2] = await Promise.all([service.recommend(P.phone, QUERY), service.recommend(P.caseA, QUERY)]);
    assert.equal(state.calls.orders, 1);
    assert.deepEqual([r1.meta.cache, r2.meta.cache].sort(), ["hit", "miss"]);

    const r3 = await service.recommend(P.glass, QUERY);
    assert.equal(r3.meta.cache, "hit");
    assert.equal(r3.meta.minedAt, r1.meta.minedAt);

    const r4 = await service.recommend(P.phone, { ...QUERY, algorithm: "apriori" });
    assert.equal(r4.meta.cache, "miss", "thuật toán khác là mô hình khác");
    assert.equal(state.calls.orders, 1, "nhưng dùng chung snapshot đơn hàng");

    assert.equal(service.status().cachedModels.length, 2);
    assert.equal(state.calls.products, 4, "sản phẩm đọc mới mỗi request để biết còn hàng");
});

test("Cache làm mới khi đơn hàng thay đổi (dấu vân tay), khi quá TTL, và khi invalidate()", async () => {
    let clock = 1_000_000;
    const { deps, state } = fakeDeps();
    const service = createRecommendationService(deps, { ttlMs: 60_000, fingerprintIntervalMs: 5_000, now: () => clock });

    await service.recommend(P.phone, QUERY);
    assert.equal(state.calls.orders, 1);

    // Có đơn mới nhưng chưa tới lượt kiểm tra dấu vân tay: vẫn dùng cache.
    state.orders = [...state.orders, ...Array.from({ length: 40 }, () => ({ items: [{ prd_id: P.phone }, { prd_id: P.charger }] }))];
    state.fingerprint = "v2";
    clock += 1_000;
    assert.equal((await service.recommend(P.phone, QUERY)).meta.transactionCount, 40);

    // Tới lượt kiểm tra: phát hiện thay đổi và khai phá lại.
    clock += 5_000;
    const fresh = await service.recommend(P.phone, QUERY);
    assert.equal(state.calls.orders, 2);
    assert.equal(fresh.meta.transactionCount, 80);
    assert.equal(fresh.meta.cache, "miss");
    assert.equal(fresh.items[0].product.name, "Sạc 20W", "luật mới phone ⇒ sạc giờ mạnh nhất");
    assert.equal(service.status().lastInvalidation.reason, "orders-changed");

    clock += 61_000;
    await service.recommend(P.phone, QUERY);
    assert.equal(state.calls.orders, 3);
    assert.equal(service.status().lastInvalidation.reason, "ttl");

    service.invalidate();
    assert.equal(service.status().snapshot, null);
    await service.recommend(P.phone, QUERY);
    assert.equal(state.calls.orders, 4);
});

test("Không có đơn hàng nào: không có luật, toàn bộ là fallback", async () => {
    const { deps } = fakeDeps({ orders: [] });
    const service = createRecommendationService(deps);
    for (const algorithm of ["apriori", "fpgrowth"]) {
        const data = await service.recommend(P.phone, { algorithm });
        assert.equal(data.meta.transactionCount, 0);
        assert.equal(data.meta.ruleCount, 0);
        assert.equal(data.items.length, 5);
        assert.ok(data.items.every((i) => i.source === "fallback" && i.rule === null));
        assert.deepEqual(data.items.slice(0, 2).map((i) => i.fallbackReason), ["same-category", "same-category"]);
    }
});

test("Sản phẩm không tồn tại → 404; productId sai định dạng → 400", async () => {
    const { deps } = fakeDeps();
    const service = createRecommendationService(deps);
    await assert.rejects(service.recommend("a".repeat(24)), (e) => e instanceof RecommendationError && e.status === 404);
    for (const bad of ["abc", "", "zzzzzzzzzzzzzzzzzzzzzzzz", undefined, "1".repeat(25)]) {
        await assert.rejects(service.recommend(bad), (e) => e.status === 400 && e.code === "INVALID_PRODUCT_ID", String(bad));
    }
});

test("Lỗi DB → 503 DATA_UNAVAILABLE, không lưu lỗi vào cache, lần sau thử lại được", async () => {
    const { deps, state } = fakeDeps();
    const service = createRecommendationService(deps);

    state.fail.orders = true;
    await assert.rejects(service.recommend(P.phone, QUERY), (e) => e.status === 503 && e.code === "DATA_UNAVAILABLE");
    state.fail.orders = false;

    state.fail.products = true;
    await assert.rejects(service.recommend(P.phone, QUERY), (e) => e.status === 503);
    state.fail.products = false;

    const ok = await service.recommend(P.phone, QUERY);
    assert.equal(ok.items.length, 5);

    state.fail.fingerprint = true; // lỗi khi kiểm tra thay đổi cũng phải báo lỗi rõ ràng
    const s2 = createRecommendationService(deps, { fingerprintIntervalMs: 0 });
    await assert.rejects(s2.recommend(P.phone, QUERY), (e) => e.status === 503);
});

test("parseOptions: giá trị mặc định và kiểm tra tham số", () => {
    assert.deepEqual(parseOptions({}), { algorithm: "fpgrowth", minSupport: 0.01, minConfidence: 0.2, limit: 5 });
    assert.equal(parseOptions({ algorithm: "FP-Growth" }).algorithm, "fpgrowth");
    assert.equal(parseOptions({ algorithm: "APRIORI" }).algorithm, "apriori");
    const bad = [
        { algorithm: "eclat" },
        { minSupport: "0" },
        { minSupport: "0.001" }, // quá nhỏ: chặn khai phá bùng nổ
        { minSupport: "0.9" },
        { minSupport: "abc" },
        { minConfidence: "1.5" },
        { minConfidence: "-0.1" },
        { limit: "6" },
        { limit: "0" },
        { limit: "2.5" },
    ];
    for (const q of bad) assert.throws(() => parseOptions(q), (e) => e.status === 400, JSON.stringify(q));
});
