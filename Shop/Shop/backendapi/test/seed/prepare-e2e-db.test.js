// Script chuẩn bị database thử: chỉ 127.0.0.1:27017, nguồn đúng GR2, đích đúng GR2_E2E, không bao giờ ghi vào GR2.
// Dùng MongoClient giả ghi lại mọi thao tác — không cần và không chạm MongoDB thật.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLocalUri, assertPlan, assertDbNames, anonymizeOrder, main, SOURCE_DB, TARGET_DB } = require("../../scripts/e2e/prepare-e2e-db");

const GR2 = "mongodb://127.0.0.1:27017/GR2";
const E2E = "mongodb://127.0.0.1:27017/GR2_E2E";
const quiet = () => {};

test("Hằng số: nguồn GR2, đích GR2_E2E", () => {
    assert.equal(SOURCE_DB, "GR2");
    assert.equal(TARGET_DB, "GR2_E2E");
});

test("Chỉ chấp nhận đích chính xác GR2_E2E (không nhận tên khác kết thúc bằng _E2E)", () => {
    assert.equal(assertPlan(GR2, E2E).target.db, "GR2_E2E");
    for (const db of ["SHOP_E2E", "TEST_E2E", "GR2_E2E_2", "GR2_E2E_", "XGR2_E2E", "gr2_e2e", "GR2_e2e", "Gr2_E2E", "GR2", "GR2-E2E", "GR2E2E", "_E2E"]) {
        assert.throws(() => assertPlan(GR2, `mongodb://127.0.0.1:27017/${db}`), /Đích phải đúng database GR2_E2E|dạng/, db);
    }
});

test("Chỉ chấp nhận nguồn chính xác GR2", () => {
    for (const db of ["gr2", "GR2_E2E", "GR2_BACKUP", "GR", "test", "admin"]) {
        assert.throws(() => assertPlan(`mongodb://127.0.0.1:27017/${db}`, E2E), /Nguồn phải đúng database GR2/, db);
    }
});

test("Chỉ chấp nhận MongoDB tại 127.0.0.1:27017 cho cả nguồn và đích", () => {
    // Bỏ trống cổng = 27017 mặc định; tham số truy vấn được giữ.
    assert.deepEqual(parseLocalUri("mongodb://127.0.0.1/GR2", "x"), { host: "127.0.0.1", port: 27017, db: "GR2" });
    assert.equal(parseLocalUri("mongodb://127.0.0.1:27017/GR2_E2E?directConnection=true", "x").db, "GR2_E2E");
    const bad = [
        "mongodb://localhost:27017/DB",
        "mongodb://LOCALHOST/DB",
        "mongodb://[::1]:27017/DB",
        "mongodb://127.0.0.2:27017/DB",
        "mongodb://0.0.0.0:27017/DB",
        "mongodb://10.0.0.5:27017/DB",
        "mongodb://db.example.com:27017/DB",
        "mongodb://127.0.0.1:27018/DB",
        "mongodb://127.0.0.1:2701/DB",
        "mongodb://127.0.0.1:27017,127.0.0.1:27018/DB",
        "mongodb+srv://cluster.example.net/DB",
        "mongodb://127.0.0.1:27017/",
        "mongodb://127.0.0.1:27017",
        "http://127.0.0.1:27017/DB",
        "",
        undefined,
    ];
    for (const uri of bad) {
        assert.throws(() => assertPlan(uri && uri.replace("DB", "GR2"), E2E), /127\.0\.0\.1:27017/, `nguồn ${uri}`);
        assert.throws(() => assertPlan(GR2, uri && uri.replace("DB", "GR2_E2E")), /127\.0\.0\.1:27017/, `đích ${uri}`);
    }
});

test("Thông báo lỗi không lộ chuỗi kết nối / mật khẩu", () => {
    try {
        assertPlan("mongodb://user:bimat@10.0.0.5:27017/GR2", E2E);
        assert.fail("phải ném lỗi");
    } catch (err) {
        assert.ok(!err.message.includes("bimat") && !err.message.includes("10.0.0.5"));
    }
});

test("assertDbNames: database thực tế đã mở phải đúng GR2 -> GR2_E2E", () => {
    assert.doesNotThrow(() => assertDbNames({ databaseName: "GR2" }, { databaseName: "GR2_E2E" }));
    assert.throws(() => assertDbNames({ databaseName: "GR2" }, { databaseName: "GR2" }), /Từ chối/);
    assert.throws(() => assertDbNames({ databaseName: "GR2_E2E" }, { databaseName: "GR2" }), /Từ chối/);
    assert.throws(() => assertDbNames({ databaseName: "GR2" }, { databaseName: "SHOP_E2E" }), /Từ chối/);
});

// ---------- MongoClient giả ----------

const WRITE_OPS = ["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany", "findOneAndUpdate", "findOneAndDelete", "bulkWrite", "createIndex", "drop"];

/**
 * @param {object} seed  { "GR2": { orders: [...] }, "GR2_E2E": { ... } }
 * @param {object} rename  ép db(name) trả database có tên khác (mô phỏng sai lệch)
 */
function fakeMongo(seed, { rename = {} } = {}) {
    const ops = []; // { db, coll, op }
    const uris = [];
    const docsOf = (db, coll) => ((seed[db] || {})[coll] || []);
    class MongoClient {
        constructor(uri) {
            uris.push(uri);
            this.uri = uri;
        }
        async connect() {}
        async close() {}
        db(name) {
            const dbName = rename[name] || name;
            return {
                databaseName: dbName,
                listCollections: () => ({ toArray: async () => Object.keys(seed[dbName] || {}).map((n) => ({ name: n })) }),
                collection: (coll) => {
                    const c = {
                        find: () => {
                            ops.push({ db: dbName, coll, op: "find" });
                            const q = { sort: () => q, toArray: async () => docsOf(dbName, coll).map((d) => ({ ...d })) };
                            return q;
                        },
                        countDocuments: async () => (ops.push({ db: dbName, coll, op: "countDocuments" }), docsOf(dbName, coll).length),
                        estimatedDocumentCount: async () => (ops.push({ db: dbName, coll, op: "estimatedDocumentCount" }), docsOf(dbName, coll).length),
                    };
                    for (const op of WRITE_OPS) c[op] = async () => (ops.push({ db: dbName, coll, op, write: true }), {});
                    return c;
                },
            };
        }
    }
    return { mongodb: { MongoClient }, ops, uris };
}

const SOURCE_DATA = {
    categories: [{ _id: "c1", name: "Ốp lưng" }],
    products: [{ _id: "p1", name: "Ốp lưng iPhone 15", price: "290000" }],
    orders: [{ _id: "o1", fullName: "Người Thật", email: "that@gmail.com", phone: "0987654321", address: "12 Phố Huế", user_id: "u1", totalPrice: 290000, items: [{ prd_id: "p1", name: "Ốp lưng iPhone 15", price: 290000, qty: 1 }] }],
    users: [{ _id: "u1", email: "that@gmail.com", password: "$2b$12$hash" }],
    comments: [{ _id: "cm1", email: "that@gmail.com" }],
};

test("Xem trước (mặc định): không có lệnh ghi nào ở bất kỳ database nào", async () => {
    const { mongodb, ops } = fakeMongo({ GR2: SOURCE_DATA });
    const r = await main({ argv: [], env: { DB_URI: GR2, E2E_DB_URI: E2E }, mongodb, log: quiet });
    assert.equal(r.applied, false);
    assert.deepEqual(r.counts, { categories: 1, products: 1, orders: 1 });
    assert.deepEqual(ops.filter((o) => o.write), []);
});

test("--apply: chỉ ghi vào GR2_E2E; GR2 chỉ bị đọc; không sao chép users/comments; đơn hàng đã ẩn danh", async () => {
    const { mongodb, ops, uris } = fakeMongo({ GR2: SOURCE_DATA });
    let inserted = [];
    const origDb = mongodb.MongoClient.prototype.db;
    mongodb.MongoClient.prototype.db = function db(name) {
        const d = origDb.call(this, name);
        const col = d.collection;
        d.collection = (coll) => {
            const c = col(coll);
            const ins = c.insertMany;
            c.insertMany = async (docs) => {
                inserted.push({ db: d.databaseName, coll, docs });
                return ins(docs);
            };
            return c;
        };
        return d;
    };
    const r = await main({ argv: ["--apply"], env: { DB_URI: GR2, E2E_DB_URI: E2E }, mongodb, log: quiet });
    assert.equal(r.applied, true);
    assert.deepEqual(uris, [GR2, E2E]);
    const writes = ops.filter((o) => o.write);
    assert.ok(writes.length > 0);
    assert.ok(writes.every((o) => o.db === "GR2_E2E"), `có lệnh ghi ngoài GR2_E2E: ${JSON.stringify(writes.filter((o) => o.db !== "GR2_E2E"))}`);
    assert.ok(ops.filter((o) => o.db === "GR2").every((o) => ["find", "countDocuments"].includes(o.op)), "GR2 chỉ bị đọc");
    assert.deepEqual(inserted.map((i) => i.coll).sort(), ["categories", "orders", "products"]);
    const text = JSON.stringify(inserted);
    for (const pii of ["Người Thật", "that@gmail.com", "0987654321", "Phố Huế", "$2b$", "u1\""]) assert.ok(!text.includes(pii), `lộ ${pii}`);
    assert.deepEqual(writes.filter((o) => o.op === "createIndex").map((o) => o.coll).sort(), ["coupons", "orders", "users"]);
});

test("--apply bị từ chối khi GR2_E2E đã có dữ liệu: không ghi gì", async () => {
    const { mongodb, ops } = fakeMongo({ GR2: SOURCE_DATA, GR2_E2E: { products: [{ _id: "x" }] } });
    await assert.rejects(main({ argv: ["--apply"], env: { DB_URI: GR2, E2E_DB_URI: E2E }, mongodb, log: quiet }), /không trống/);
    assert.deepEqual(ops.filter((o) => o.write), []);
});

test("--apply bị từ chối nếu database thực tế mở ra không đúng GR2_E2E (vd. driver trả GR2): không ghi gì", async () => {
    for (const rename of [{ GR2_E2E: "GR2" }, { GR2_E2E: "SHOP_E2E" }, { GR2: "GR2_E2E" }]) {
        const { mongodb, ops } = fakeMongo({ GR2: SOURCE_DATA }, { rename });
        await assert.rejects(main({ argv: ["--apply"], env: { DB_URI: GR2, E2E_DB_URI: E2E }, mongodb, log: quiet }), /Từ chối/, JSON.stringify(rename));
        assert.deepEqual(ops.filter((o) => o.write), [], JSON.stringify(rename));
    }
});

test("Cấu hình sai -> dừng TRƯỚC khi tạo kết nối", async () => {
    const { mongodb, uris } = fakeMongo({ GR2: SOURCE_DATA });
    const cases = [
        [{ DB_URI: GR2 }, [], /E2E_DB_URI/],
        [{ DB_URI: GR2, E2E_DB_URI: E2E }, ["--reset"], /không hỗ trợ/],
        [{ DB_URI: GR2, E2E_DB_URI: GR2 }, ["--apply"], /GR2_E2E/],
        [{ DB_URI: GR2, E2E_DB_URI: "mongodb://127.0.0.1:27017/SHOP_E2E" }, ["--apply"], /GR2_E2E/],
        [{ DB_URI: GR2, E2E_DB_URI: "mongodb://localhost:27017/GR2_E2E" }, ["--apply"], /127\.0\.0\.1:27017/],
        [{ DB_URI: "mongodb://127.0.0.1:27018/GR2", E2E_DB_URI: E2E }, ["--apply"], /127\.0\.0\.1:27017/],
        [{ DB_URI: E2E, E2E_DB_URI: E2E }, ["--apply"], /Nguồn phải đúng database GR2/],
    ];
    for (const [env, argv, re] of cases) await assert.rejects(main({ argv, env, mongodb, log: quiet }), re, JSON.stringify(env));
    assert.deepEqual(uris, [], "không MongoClient nào được tạo");
});

test("Ẩn danh đơn hàng: giữ sản phẩm/tiền/thời gian, thay thông tin khách, bỏ user_id/địa chỉ/coupon", () => {
    const order = {
        _id: "o1", fullName: "Nguyễn Văn Thật", phone: "0987654321", email: "that@gmail.com", address: "12 Phố Huế",
        user_id: "u1", shipping_address: { province: "Hà Nội" }, coupon: { code: "X" }, status: "delivered", status_history: [{ by: "u2" }],
        totalPrice: 500000, createdAt: "2026-01-01T00:00:00.000Z",
        items: [{ prd_id: "p1", name: "Ốp lưng", price: 250000, qty: 2, image: "a.jpg", secret: "x" }],
    };
    const out = anonymizeOrder(order, 6);
    assert.deepEqual(out.items, [{ prd_id: "p1", name: "Ốp lưng", price: 250000, qty: 2, image: "a.jpg" }]);
    assert.equal(out.totalPrice, 500000);
    assert.equal(out.createdAt, order.createdAt);
    assert.equal(out.fullName, "Khách thử 7");
    assert.equal(out.email, "khach0007@e2e.test");
    assert.match(out.phone, /^0900\d{6}$/);
    for (const f of ["user_id", "shipping_address", "coupon", "status", "status_history"]) assert.ok(!(f in out), f);
    const text = JSON.stringify(out);
    for (const pii of ["Thật", "0987654321", "gmail", "Phố Huế"]) assert.ok(!text.includes(pii), pii);
});
