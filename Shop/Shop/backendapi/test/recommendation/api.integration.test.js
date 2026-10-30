// Integration test qua HTTP thật: Express + router gợi ý + service với dữ liệu giả.
// Không cần MongoDB.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const recommendationRouter = require("../../src/routers/recommendation");
const { createRecommendationService } = require("../../src/apps/services/recommendation/service");
const { createRecommendationController } = require("../../src/apps/controllers/apis/recommendation");
const { P, products, makeOrders } = require("./fixtures");

function startServer(deps) {
    const service = createRecommendationService(deps);
    const app = express();
    app.use("/api/v1/recommendations", recommendationRouter.createRecommendationRouter(() => service));
    return new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            const base = `http://127.0.0.1:${server.address().port}/api/v1/recommendations`;
            resolve({ server, base, service });
        });
    });
}

const okDeps = {
    loadOrders: async () => makeOrders(),
    loadProducts: async () => products,
    loadFingerprint: async () => "v1",
};

test("GET /recommendations/products/:id trả JSON đúng cấu trúc cho cả hai thuật toán", async (t) => {
    const { server, base } = await startServer(okDeps);
    t.after(() => server.close());

    const results = {};
    for (const algorithm of ["apriori", "fpgrowth"]) {
        const res = await fetch(`${base}/products/${P.phone}?algorithm=${algorithm}&minSupport=0.05&minConfidence=0.1`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type"), /application\/json/);
        const body = await res.json();
        assert.equal(body.status, "success");
        assert.equal(body.data.algorithm, algorithm);
        assert.equal(body.data.items.length, 5);
        for (const item of body.data.items) {
            assert.ok(["association-rule", "fallback"].includes(item.source));
            assert.deepEqual(Object.keys(item.product).sort(), ["_id", "category_id", "image", "name", "price"]);
            if (item.source === "association-rule") {
                assert.equal(typeof item.rule.confidence, "number");
                assert.equal(typeof item.rule.lift, "number");
                assert.equal(typeof item.rule.support, "number");
            } else {
                assert.equal(item.rule, null);
                assert.ok(item.fallbackReason);
            }
        }
        assert.equal(typeof body.data.meta.miningMs, "number");
        results[algorithm] = body.data.items.map((i) => [i.product._id, i.source]);
    }
    assert.deepEqual(results.apriori, results.fpgrowth);
});

test("Mã lỗi HTTP: 400 tham số sai, 404 không có sản phẩm, 503 lỗi DB", async (t) => {
    const { server, base } = await startServer(okDeps);
    t.after(() => server.close());

    const expectError = async (url, status, code) => {
        const res = await fetch(url);
        assert.equal(res.status, status, url);
        const body = await res.json();
        assert.equal(body.status, "error");
        assert.equal(body.code, code);
        assert.ok(!("stack" in body));
    };
    await expectError(`${base}/products/not-an-id`, 400, "INVALID_PRODUCT_ID");
    await expectError(`${base}/products/${P.phone}?algorithm=eclat`, 400, "INVALID_ALGORITHM");
    await expectError(`${base}/products/${P.phone}?limit=50`, 400, "INVALID_PARAM");
    await expectError(`${base}/products/${"b".repeat(24)}`, 404, "PRODUCT_NOT_FOUND");

    const broken = await startServer({ ...okDeps, loadOrders: async () => { throw new Error("ECONNREFUSED 127.0.0.1:27017"); } });
    t.after(() => broken.server.close());
    const original = console.error;
    console.error = () => {}; // lỗi được log phía server; không in ra khi test
    try {
        await expectError(`${broken.base}/products/${P.phone}`, 503, "DATA_UNAVAILABLE");
    } finally {
        console.error = original;
    }
});

test("GET /status và POST /refresh (từ localhost) làm mới cache", async (t) => {
    let orderLoads = 0;
    const { server, base } = await startServer({ ...okDeps, loadOrders: async () => (orderLoads++, makeOrders()) });
    t.after(() => server.close());

    await fetch(`${base}/products/${P.phone}`);
    let status = await (await fetch(`${base}/status`)).json();
    assert.equal(status.data.snapshot.transactionCount, 40);
    assert.equal(status.data.cachedModels.length, 1);

    const refresh = await fetch(`${base}/refresh`, { method: "POST" });
    assert.equal(refresh.status, 200);
    status = await (await fetch(`${base}/status`)).json();
    assert.equal(status.data.snapshot, null);

    await fetch(`${base}/products/${P.phone}`);
    assert.equal(orderLoads, 2);
});

test("POST /refresh từ máy khác bị từ chối 403", () => {
    const controller = createRecommendationController(() => ({ invalidate: () => assert.fail("không được gọi") }));
    let statusCode;
    let body;
    const res = { status: (c) => ((statusCode = c), res), json: (b) => ((body = b), res) };
    controller.refresh({ socket: { remoteAddress: "192.168.1.20" } }, res);
    assert.equal(statusCode, 403);
    assert.equal(body.code, "FORBIDDEN");
});

test("Nạp router mặc định không mở kết nối MongoDB (model chỉ được require khi có request)", () => {
    const mongoose = require("mongoose");
    assert.equal(mongoose.connection.readyState, 0);
    assert.equal(typeof recommendationRouter.getDefaultService, "function");
});
