// Đợt 6B: giới hạn tần suất (429), CORS theo origin cấu hình, kết nối MongoDB lỗi không làm sập backend.
const test = require("node:test");
const assert = require("node:assert/strict");
const { oid, installFakeDb, makeUser, startServer } = require("./fake-app");
const { createRateLimiter } = require("../../src/libs/rate-limit");
const { parseAllowedOrigins, normalizeOrigin, DEFAULT_ORIGINS } = require("../../src/libs/cors-policy");
const { createConnector, safeMessage } = require("../../src/common/database");
const { errorHandler } = require("../../src/apps/middlewares/error");

const PRODUCT = { _id: oid(), name: "Ốp lưng", category_id: oid(), image: "a.jpg", price: "290000", promotion: "0", is_stock: true };
const COUPON = { _id: oid(), code: "GIAM10", type: "percent", value: 10, min_order: 0, max_discount: null, starts_at: null, ends_at: null, usage_limit: null, used_count: 0, is_active: true };

async function setup(t) {
    const store = installFakeDb(t, { products: [PRODUCT], coupons: [COUPON] });
    await makeUser(store, { email: "alice@shop.vn", password: "matkhau-dung-1" });
    const call = await startServer(t);
    return { store, call };
}

// ---------- Giới hạn tần suất ----------

test("Đăng nhập: 10 lần sai cùng email -> lần 11 bị 429 kèm Retry-After; email khác vẫn thử được", async (t) => {
    const { call } = await setup(t);
    const login = (email, password) => call("POST", "/auth/login", { body: { email, password } });
    for (let i = 0; i < 10; i++) assert.equal((await login("alice@shop.vn", `sai-${i}`)).status, 401);
    const blocked = await login("alice@shop.vn", "matkhau-dung-1"); // kể cả mật khẩu đúng: đang bị khóa tạm
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, "RATE_LIMITED");
    assert.match(blocked.body.message, /quá nhiều lần.*thử lại sau \d+ phút/);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.ok(!/sai-|matkhau/.test(blocked.text), "không phản hồi lại mật khẩu");
    assert.equal((await login("Alice@Shop.vn ", "x")).status, 429, "email chuẩn hóa: không lách bằng chữ hoa/khoảng trắng");
    assert.equal((await login("bob@shop.vn", "x")).status, 401, "email khác chưa bị khóa");
});

test("Đăng nhập: lần đăng nhập ĐÚNG không bị tính -> dùng bình thường không bao giờ bị 429", async (t) => {
    const { call } = await setup(t);
    for (let i = 0; i < 40; i++) assert.equal((await call("POST", "/auth/login", { body: { email: "alice@shop.vn", password: "matkhau-dung-1" } })).status, 200, `lần ${i + 1}`);
});

test("Đăng nhập: 30 lần sai từ một IP (nhiều email) -> 429", async (t) => {
    const { call } = await setup(t);
    for (let i = 0; i < 30; i++) assert.equal((await call("POST", "/auth/login", { body: { email: `u${i}@x.vn`, password: "x" } })).status, 401);
    assert.equal((await call("POST", "/auth/login", { body: { email: "moi@x.vn", password: "x" } })).status, 429);
});

test("Đăng ký: 10 lần / giờ / IP; Xem trước mã giảm giá: 30 lần / 10 phút / IP", async (t) => {
    const { call } = await setup(t);
    for (let i = 0; i < 10; i++) assert.equal((await call("POST", "/auth/register", { body: { email: `n${i}@x.vn`, password: "matkhau-moi-1" } })).status, 201);
    const reg = await call("POST", "/auth/register", { body: { email: "n10@x.vn", password: "matkhau-moi-1" } });
    assert.equal(reg.status, 429);
    assert.match(reg.body.message, /đăng ký/);

    const preview = () => call("POST", "/coupons/preview", { body: { code: "GIAM10", items: [{ prd_id: PRODUCT._id, qty: 1 }] } });
    const first = await preview();
    assert.equal(first.status, 200, first.text);
    assert.equal(first.headers.get("ratelimit-remaining"), "29");
    for (let i = 0; i < 29; i++) await preview();
    const over = await preview();
    assert.equal(over.status, 429);
    assert.match(over.body.message, /mã giảm giá/);
    assert.ok(!/GIAM10/.test(over.text), "không phản hồi lại mã");
});

test("createRateLimiter: hết cửa sổ thì đếm lại; giới hạn số khóa trong bộ nhớ; khóa được băm", () => {
    let now = 0;
    const l = createRateLimiter({ windowMs: 1000, max: 2, message: "Quá nhiều.", key: (req) => req.k, maxKeys: 3, now: () => now });
    const run = (k) => {
        let err = null;
        const headers = {};
        l.middleware({ k }, { set: (h, v) => (headers[h] = v), on: () => {} }, (e) => (err = e || null));
        return { err, headers };
    };
    assert.equal(run("a").err, null);
    assert.equal(run("a").err, null);
    const third = run("a");
    assert.equal(third.err.status, 429);
    assert.equal(third.headers["Retry-After"], "1");
    now = 1000;
    assert.equal(run("a").err, null, "cửa sổ mới");
    for (const k of ["b", "c", "d", "e"]) run(k);
    assert.ok(l.size() <= 3, "không giữ quá maxKeys khóa");
    assert.throws(() => createRateLimiter({ windowMs: 0, max: 1, message: "x" }));
});

// ---------- CORS ----------

test("CORS: origin hợp lệ được cấp header; origin lạ bị 403; không có Origin (Postman, server) vẫn chạy", async (t) => {
    const { call } = await setup(t);
    const ok = await call("GET", "/categories", { headers: { origin: "http://localhost:3001" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:3001");

    const pre = await call("OPTIONS", "/auth/login", { headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "content-type,authorization" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.match(pre.headers.get("access-control-allow-headers"), /Authorization/);

    for (const origin of ["http://evil.example", "http://localhost:3002", "null"]) {
        const bad = await call("POST", "/auth/login", { headers: { origin }, body: { email: "alice@shop.vn", password: "matkhau-dung-1" } });
        assert.equal(bad.status, 403, origin);
        assert.equal(bad.body.code, "CORS_FORBIDDEN");
        assert.equal(bad.headers.get("access-control-allow-origin"), null);
    }
    const badPre = await call("OPTIONS", "/auth/login", { headers: { origin: "http://evil.example", "access-control-request-method": "POST" } });
    assert.equal(badPre.headers.get("access-control-allow-origin"), null);

    const noOrigin = await call("GET", "/categories");
    assert.equal(noOrigin.status, 200);
    assert.equal(noOrigin.headers.get("access-control-allow-origin"), null);
});

test("CORS: đọc CORS_ORIGINS, chuẩn hóa dấu / cuối, bỏ mục sai; trống -> mặc định localhost:3000/3001", () => {
    assert.deepEqual(parseAllowedOrigins(undefined), [...DEFAULT_ORIGINS]);
    assert.deepEqual(parseAllowedOrigins("  "), [...DEFAULT_ORIGINS]);
    assert.deepEqual(parseAllowedOrigins("https://shop.vn/, http://admin.shop.vn:8080 ,javascript:alert(1),rác,https://shop.vn"), ["https://shop.vn", "http://admin.shop.vn:8080"]);
    assert.equal(normalizeOrigin("null"), null);
    assert.equal(normalizeOrigin("HTTP://LOCALHOST:3000"), "http://localhost:3000");
});

// ---------- Kết nối MongoDB ----------

function fakeMongoose(results) {
    const handlers = {};
    const calls = [];
    return {
        calls,
        handlers,
        connection: { on: (ev, fn) => (handlers[ev] = fn) },
        connect: (uri) => {
            calls.push(uri);
            const r = results.shift();
            return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
        },
    };
}
const flush = () => new Promise((r) => setImmediate(r));

test("Database: chỉ kết nối một lần dù nhiều model gọi; lỗi được bắt, thử lại với thời gian chờ tăng dần, không lộ mật khẩu", async (t) => {
    const unhandled = [];
    const onUnhandled = (e) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    t.after(() => process.off("unhandledRejection", onUnhandled));

    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:27017 (mongodb://user:bimat@127.0.0.1/GR2)"), { name: "MongooseServerSelectionError" });
    const m = fakeMongoose([refused, refused, "ok"]);
    const logs = [];
    const scheduled = [];
    const db = createConnector({ mongoose: m, getUri: () => "mongodb://user:bimat@127.0.0.1/GR2", log: (x) => logs.push(x), logError: (x) => logs.push(x), schedule: (fn, ms) => scheduled.push({ fn, ms }), baseDelayMs: 5000, maxDelayMs: 30000 });

    for (let i = 0; i < 7; i++) assert.equal(db(), m, "trả về mongoose");
    await flush();
    assert.equal(m.calls.length, 1, "7 model -> 1 lần connect");
    assert.equal(db.state.connected, false);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].ms, 5000);
    scheduled.shift().fn();
    await flush();
    assert.equal(scheduled[0].ms, 10000, "chờ tăng dần");
    scheduled.shift().fn();
    await flush();
    assert.equal(db.state.connected, true);
    assert.equal(m.calls.length, 3);
    assert.ok(logs.some((l) => /Không kết nối được MongoDB \(lần 1\)/.test(l)));
    assert.ok(!logs.join("\n").includes("bimat"), "log không chứa mật khẩu trong chuỗi kết nối");
    assert.equal(unhandled.length, 0, "không có unhandled rejection");
    // Có listener "error" -> lỗi sau khi đã kết nối không ném ra ngoài làm sập tiến trình.
    assert.doesNotThrow(() => m.handlers.error(new Error("mất mạng")));
});

test("Database: DB_URI sai định dạng -> báo lỗi cấu hình, không thử lại vô hạn; connect ném đồng bộ cũng được bắt", async () => {
    const m = fakeMongoose([Object.assign(new Error("Invalid scheme"), { name: "MongoParseError" })]);
    const scheduled = [];
    const logs = [];
    const db = createConnector({ mongoose: m, getUri: () => "abc", log: () => {}, logError: (x) => logs.push(x), schedule: (fn, ms) => scheduled.push(ms) });
    db();
    await flush();
    assert.equal(scheduled.length, 0);
    assert.equal(db.state.gaveUp, true);
    assert.match(logs[0], /cấu hình DB_URI/);

    const throwing = { connection: { on() {} }, connect: () => { throw Object.assign(new Error("sync"), { name: "MongoNetworkError" }); } };
    const later = [];
    createConnector({ mongoose: throwing, getUri: () => "x", log: () => {}, logError: () => {}, schedule: (fn, ms) => later.push(ms) })();
    await flush();
    assert.deepEqual(later, [5000]);
    assert.equal(safeMessage(new Error("x mongodb+srv://a:b@h/db y")), "x mongodb://*** y");
});

test("API khi MongoDB không kết nối được -> 503 có thông báo rõ, không phải 500", () => {
    for (const err of [
        Object.assign(new Error("x"), { name: "MongooseServerSelectionError" }),
        Object.assign(new Error("Operation `products.find()` buffering timed out after 10000ms"), { name: "MongooseError" }),
    ]) {
        let status;
        let body;
        const res = { headersSent: false, status: (s) => ((status = s), res), json: (b) => (body = b) };
        const orig = console.error;
        console.error = () => {};
        try {
            errorHandler(err, { method: "GET", originalUrl: "/api/v1/products" }, res, () => {});
        } finally {
            console.error = orig;
        }
        assert.equal(status, 503);
        assert.equal(body.code, "DB_UNAVAILABLE");
    }
});
