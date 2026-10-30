// Kiểm thử script seed demo mà KHÔNG kết nối MongoDB.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { assertSafeDemoTarget, parseMongoUri, describeTarget, SeedSafetyError, demoObjectIdHex } = require("../../scripts/seed-demo/safety");
const { buildPlan, validatePlan, summarizePlan, planTransactions, IMAGE_DIR } = require("../../scripts/seed-demo/plan");
const { loadModelsOffline, mongoose } = require("../../scripts/seed-demo/models");
const { CATEGORIES, PRODUCTS } = require("../../scripts/seed-demo/catalog");
const { parseArgs } = require("../../scripts/seed-demo");
const { fpGrowth } = require("../../src/apps/services/mining/fpgrowth");
const { generateRules } = require("../../src/apps/services/mining/rules");

const models = loadModelsOffline();

// ---------------------------------------------------------------- an toàn
test("Chấp nhận MongoDB localhost với database GR2", () => {
    for (const uri of [
        "mongodb://127.0.0.1:27017/GR2",
        "mongodb://localhost/GR2",
        "mongodb://[::1]:27017/GR2?directConnection=true",
        "mongodb://user:secret@127.0.0.1:27017/GR2?authSource=admin",
    ]) {
        assert.equal(assertSafeDemoTarget(uri, { nodeEnv: "development" }).dbName, "GR2", uri);
    }
});

test("Từ chối database bên ngoài, sai tên, thiếu tên hoặc môi trường production", () => {
    const rejected = [
        "mongodb+srv://user:secret@cluster0.abcde.mongodb.net/GR2",
        "mongodb://10.0.0.5:27017/GR2",
        "mongodb://db.example.com:27017/GR2",
        "mongodb://127.0.0.1:27017,db.example.com:27017/GR2?replicaSet=rs0",
        "mongodb://127.0.0.1:27017/",
        "mongodb://127.0.0.1:27017",
        "mongodb://127.0.0.1:27017/GR2_prod",
        "mongodb://127.0.0.1:27017/gr2",
        "postgres://127.0.0.1/GR2",
        "",
    ];
    for (const uri of rejected) {
        assert.throws(() => assertSafeDemoTarget(uri, { nodeEnv: "development" }), SeedSafetyError, uri);
    }
    assert.throws(() => assertSafeDemoTarget("mongodb://127.0.0.1/GR2", { nodeEnv: "production" }), SeedSafetyError);
    assert.throws(() => assertSafeDemoTarget(undefined), SeedSafetyError);
});

test("Thông báo lỗi và mô tả đích không lộ mật khẩu", () => {
    try {
        assertSafeDemoTarget("mongodb://admin:SieuBiMat123@db.example.com/GR2", { nodeEnv: "development" });
        assert.fail("phải ném lỗi");
    } catch (err) {
        assert.ok(!err.message.includes("SieuBiMat123"));
        assert.ok(!err.message.includes("admin:"));
    }
    const described = describeTarget(parseMongoUri("mongodb://admin:SieuBiMat123@127.0.0.1:27017/GR2"));
    assert.equal(described, "mongodb://***@127.0.0.1:27017/GR2");
});

test("Nạp model thật mà không mở kết nối nào", () => {
    assert.equal(mongoose.connection.readyState, 0);
    assert.equal(models.ProductModel.collection.collectionName, "products");
    assert.equal(models.OrderModel.schema.path("items.prd_id")?.instance ?? models.OrderModel.schema.path("items").schema.path("prd_id").instance, "ObjectID");
});

test("parseArgs: từ chối tham số nguy hiểm hoặc sai", () => {
    assert.throws(() => parseArgs(["--apply", "--offline"]));
    assert.throws(() => parseArgs(["--images", "internet"]));
    assert.throws(() => parseArgs(["--orders", "0"]));
    assert.throws(() => parseArgs(["--drop"]));
    assert.equal(parseArgs([]).apply, false); // mặc định là dry-run
});

// ---------------------------------------------------------------- kế hoạch
const plan = buildPlan();

test("Số lượng bản ghi: 10 danh mục, 41 sản phẩm (30–50), 1.000 đơn", () => {
    const s = summarizePlan(plan);
    assert.equal(s.categories.total, CATEGORIES.length);
    assert.equal(s.categories.total, 10);
    assert.equal(s.products.total, 41);
    assert.ok(s.products.total >= 30 && s.products.total <= 50);
    assert.equal(s.orders.total, 1000);
    assert.ok(s.products.featured > 0, "trang chủ cần sản phẩm is_featured");
});

test("Kế hoạch hợp lệ theo schema thật và mọi prd_id thuộc danh sách sản phẩm", () => {
    assert.deepEqual(validatePlan(plan, models), []);
    const productIds = new Set(plan.products.map((p) => String(p._id)));
    for (const o of plan.orders) for (const i of o.doc.items) assert.ok(productIds.has(String(i.prd_id)));
});

test("Kế hoạch chỉ chứa categories, products, orders — không có tài khoản người dùng", () => {
    assert.deepEqual(Object.keys(plan).filter((k) => Array.isArray(plan[k])).sort(), ["categories", "orders", "products"]);
    const text = JSON.stringify(plan);
    assert.ok(!/password|role/i.test(text));
});

test("Chạy lại cho đúng cùng _id và cùng dữ liệu (idempotent)", () => {
    const again = buildPlan();
    assert.deepEqual(JSON.stringify(again), JSON.stringify(plan));
    assert.equal(demoObjectIdHex("product", "iphone-15"), demoObjectIdHex("product", "iphone-15"));
    assert.match(demoObjectIdHex("order", "1"), /^[0-9a-f]{24}$/);
    const ids = [...plan.categories, ...plan.products, ...plan.orders].map((x) => String(x._id));
    assert.equal(new Set(ids).size, ids.length, "không trùng _id");
});

test("Seed khác cho đơn khác nhưng sản phẩm giữ nguyên _id", () => {
    const other = buildPlan({ seed: 1 });
    assert.deepEqual(other.products.map((p) => String(p._id)), plan.products.map((p) => String(p._id)));
    assert.notDeepEqual(other.orders.map((o) => String(o._id)), plan.orders.map((o) => String(o._id)));
});

test("Trùng tên với dữ liệu đang có thì dùng lại bản ghi cũ, không chèn bản sao", () => {
    const existingId = "65af7feeb9edc11b2f837b03";
    const withExisting = buildPlan({
        existing: {
            categories: [{ _id: "65af7f81b9edc11b2f837af4", name: "iphone" }],
            products: [{ _id: existingId, name: "  IPHONE 15 128GB ", price: "18990000" }],
        },
    });
    const iphone = withExisting.products.find((p) => p.key === "iphone-15");
    assert.equal(iphone.action, "reuse");
    assert.equal(String(iphone._id), existingId);
    assert.equal(iphone.unitPrice, 18990000);
    assert.equal(withExisting.categories.find((c) => c.key === "iphone").action, "reuse");

    const ordersWithIphone = withExisting.orders.filter((o) => o.doc.items.some((i) => String(i.prd_id) === existingId));
    assert.ok(ordersWithIphone.length > 0);
    for (const o of ordersWithIphone) {
        assert.equal(o.doc.items.find((i) => String(i.prd_id) === existingId).price, 18990000);
    }
    assert.deepEqual(validatePlan(withExisting, models), []);
});

test("Ảnh: file minh họa tồn tại; chế độ existing chỉ dùng ảnh sản phẩm có sẵn, không dùng 888.jpg", () => {
    for (const p of plan.products) assert.ok(fs.existsSync(path.join(IMAGE_DIR, p.doc.image)), p.doc.image);
    const existing = buildPlan({ imageMode: "existing" });
    assert.deepEqual(validatePlan(existing, models), []);
    assert.ok(existing.products.every((p) => p.doc.image !== "888.jpg"));
    assert.ok(existing.products.every((p) => !/^https?:/i.test(p.doc.image)), "frontend tự nối BASE_URL nên không dùng URL tuyệt đối");
});

test("Dữ liệu giả lập không dùng thông tin liên hệ thật", () => {
    for (const o of plan.orders) {
        assert.match(o.doc.email, /@example\.com$/);
        assert.match(o.doc.phone, /^000000\d{4}$/);
        assert.match(o.doc.fullName, /^Khách demo \d{4}$/);
    }
});

test("Luật cài sẵn tìm lại được bằng FP-Growth (min_sup 1,5%)", () => {
    // Cặp {kính, ốp Redmi} có 19/1000 đơn với seed mặc định, nên dùng 1,5% thay vì 2%.
    const transactions = planTransactions(plan);
    const { itemsets, stats } = fpGrowth(transactions, { minSupport: 0.015 });
    const rules = generateRules(itemsets, { transactionCount: stats.transactionCount, minConfidence: 0.3 });
    const find = (a, c) => rules.find((r) => r.antecedent.join() === a && r.consequent.join() === c);

    const iphoneCase = find("iPhone 15 128GB", "Ốp lưng silicon iPhone 15");
    assert.ok(iphoneCase && iphoneCase.confidence > 0.6 && iphoneCase.lift > 3, "iPhone 15 ⇒ ốp lưng");
    const s24Glass = find("Ốp lưng Galaxy S24 Ultra", "Kính cường lực Galaxy S24 Ultra");
    assert.ok(s24Glass && s24Glass.lift > 3, "ốp S24U ⇒ kính S24U");
    const redmi = find("Kính cường lực Redmi Note 13 Pro series", "Ốp lưng Redmi Note 13 Pro series");
    assert.ok(redmi && redmi.confidence > 0.7 && redmi.lift > 3, "kính Redmi ⇒ ốp Redmi");
});

test("Mọi sản phẩm trong catalog có trong ít nhất một đơn", () => {
    const used = new Set(plan.orders.flatMap((o) => o.doc.items.map((i) => String(i.prd_id))));
    const unused = plan.products.filter((p) => !used.has(String(p._id))).map((p) => p.key);
    assert.deepEqual(unused, []);
    assert.equal(PRODUCTS.length, plan.products.length);
});
