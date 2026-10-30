// Coupon (xem trước, đặt hàng, tranh lượt đồng thời, hoàn lượt) và thống kê doanh thu (chỉ đơn Đã giao).
// App Express thật + dữ liệu giả trong bộ nhớ — không chạm MongoDB GR2.
const test = require("node:test");
const assert = require("node:assert/strict");
const { oid, models, installFakeDb, makeUser, tokenFor, startServer } = require("../security/fake-app");
const { couponDiscount, couponProblem, validateCouponBody } = require("../../src/libs/coupon");
const { parseRange, revenueSeries, periodCards, topProducts, dayKey } = require("../../src/libs/stats");

const CAT = { _id: oid(), name: "Điện thoại" };
const P = (name, price, promotion = "0", extra = {}) => ({ _id: oid(), name, category_id: CAT._id, image: "a.jpg", price, promotion, status: "Mới", accessories: "-", details: "d", is_stock: true, ...extra });
const PHONE = P("iPhone 15", "20000000", "1000000"); // bán 19.000.000
const CASE = P("Ốp lưng", "300000"); // không giảm
const DAY = 24 * 3600 * 1000;
const C = (code, extra = {}) => ({ _id: oid(), code, description: "", type: "fixed", value: 100000, min_order: 0, max_discount: null, starts_at: null, ends_at: null, usage_limit: null, used_count: 0, is_active: true, ...extra });
const ORDER = { fullName: "Khách", phone: "0912345678", email: "khach@mail.vn", address: "1 Đại Cồ Việt, Hà Nội" };

async function setup(t, seed = {}) {
    const store = installFakeDb(t, { categories: [CAT], products: [PHONE, CASE], ...seed });
    const admin = await makeUser(store, { email: "admin@shop.vn", role: "admin" });
    const alice = await makeUser(store, { email: "alice@shop.vn" });
    const call = await startServer(t);
    return { store, call, admin, alice, tokens: { admin: tokenFor(admin), alice: tokenFor(alice) } };
}
const coupon = (store, code) => store.coupons.find((c) => c.code === code);

test("quy tắc tính coupon: cố định, phần trăm có trần, không vượt tạm tính, điều kiện dùng", () => {
    assert.equal(couponDiscount({ type: "fixed", value: 100000 }, 300000), 100000);
    assert.equal(couponDiscount({ type: "fixed", value: 500000 }, 300000), 300000, "không giảm quá tạm tính -> tổng >= 0");
    assert.equal(couponDiscount({ type: "percent", value: 10 }, 19300000), 1930000);
    assert.equal(couponDiscount({ type: "percent", value: 10, max_discount: 500000 }, 19300000), 500000);
    assert.equal(couponDiscount({ type: "percent", value: 15 }, 333), 49, "làm tròn xuống");
    assert.equal(couponDiscount({ type: "percent", value: 100 }, 300000), 300000);
    const now = new Date("2026-06-01T00:00:00Z");
    assert.match(couponProblem(null, 1), /không tồn tại/);
    assert.match(couponProblem({ ...C("A"), is_active: false }, 1, now), /vô hiệu hóa/);
    assert.match(couponProblem({ ...C("A"), ends_at: "2026-05-31T23:59:59Z" }, 1, now), /hết hạn/);
    assert.match(couponProblem({ ...C("A"), starts_at: "2026-06-02T00:00:00Z" }, 1, now), /chưa đến/);
    assert.match(couponProblem({ ...C("A"), usage_limit: 3, used_count: 3 }, 1, now), /hết lượt/);
    assert.match(couponProblem({ ...C("A"), min_order: 500000 }, 499999, now), /tối thiểu 500\.000đ/);
    assert.equal(couponProblem(C("A"), 1, now), null);
});

test("validate dữ liệu coupon của admin", () => {
    const ok = validateCouponBody({ code: " sale-10 ", type: "percent", value: "10", max_discount: 500000, ends_at: "2026-12-31T16:59:59Z" });
    assert.equal(ok.code, "SALE-10");
    assert.equal(ok.value, 10);
    assert.equal(ok.min_order, 0);
    assert.equal(ok.usage_limit, null);
    const bad = [
        { code: "ab", type: "fixed", value: 1 },
        { code: "MÃ GIẢM", type: "fixed", value: 1 },
        { code: "SALE", type: "other", value: 1 },
        { code: "SALE", type: "percent", value: 101 },
        { code: "SALE", type: "percent", value: 0 },
        { code: "SALE", type: "fixed", value: -5 },
        { code: "SALE", type: "fixed", value: 1.5 },
        { code: "SALE", type: "fixed", value: 1, starts_at: "2026-02-01", ends_at: "2026-01-01" },
        { code: "SALE", type: "fixed", value: 1, ends_at: "không phải ngày" },
        { code: "SALE", type: "fixed", value: 1, used_count: 0 },
        { code: "SALE", type: "fixed", value: 1, is_active: "yes" },
    ];
    for (const body of bad) assert.throws(() => validateCouponBody(body), (e) => e.status === 400, JSON.stringify(body));
    assert.throws(() => validateCouponBody({ code: "SALE", type: "fixed", value: 1, usage_limit: 2 }, { code: "SALE", used_count: 5 }), /không được nhỏ hơn/);
    assert.throws(() => validateCouponBody({ code: "KHAC", type: "fixed", value: 1 }, { code: "SALE", used_count: 1 }), /không đổi được mã/);
});

test("xem trước coupon: tính từ giá DB sau khuyến mãi, KHÔNG trừ lượt; lỗi rõ ràng cho mã sai/hết hạn/hết lượt", async (t) => {
    const { call, store } = await setup(t, {
        coupons: [C("GIAM10", { type: "percent", value: 10, max_discount: 5000000, usage_limit: 1 }), C("HETHAN", { ends_at: new Date(Date.now() - DAY).toISOString() }), C("HETLUOT", { usage_limit: 2, used_count: 2 }), C("TOITHIEU", { min_order: 1000000 })],
    });
    const items = [{ prd_id: PHONE._id, qty: 1, price: 1 }, { prd_id: CASE._id, qty: 1 }];
    const res = await call("POST", "/coupons/preview", { body: { code: "giam10", items } });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.data, { code: "GIAM10", description: "", type: "percent", value: 10, subtotal_original: 20300000, product_discount: 1000000, subtotal: 19300000, coupon_discount: 1930000, total: 17370000 });
    for (let i = 0; i < 3; i++) await call("POST", "/coupons/preview", { body: { code: "GIAM10", items } });
    assert.equal(coupon(store, "GIAM10").used_count, 0, "xem trước không trừ lượt");
    const cases = [
        ["KHONGCO", /không tồn tại/],
        ["HETHAN", /hết hạn/],
        ["HETLUOT", /hết lượt/],
        ["x", /không tồn tại/],
    ];
    for (const [code, msg] of cases) {
        const r = await call("POST", "/coupons/preview", { body: { code, items } });
        assert.equal(r.status, 400, code);
        assert.match(r.body.message, msg);
    }
    const small = await call("POST", "/coupons/preview", { body: { code: "TOITHIEU", items: [{ prd_id: CASE._id, qty: 1 }] } });
    assert.equal(small.status, 400);
    assert.match(small.body.message, /tối thiểu 1\.000\.000đ/);
    assert.equal((await call("POST", "/coupons/preview", { body: { code: "GIAM10", items: [] } })).status, 400);
});

test("đặt hàng có coupon: backend tính giá, lưu chi tiết giá + coupon, trừ đúng 1 lượt; khách chưa đăng nhập vẫn dùng được", async (t) => {
    const { call, store } = await setup(t, { coupons: [C("GIAM10", { type: "percent", value: 10, max_discount: 1500000, usage_limit: 5 })] });
    const res = await call("POST", "/order", { body: { ...ORDER, coupon_code: " giam10 ", totalPrice: 1, items: [{ prd_id: PHONE._id, qty: 1, price: 1 }, { prd_id: CASE._id, qty: 2 }] } });
    assert.equal(res.status, 201, res.text);
    const saved = store.orders.at(-1);
    assert.equal(saved.subtotal_original, 20000000 + 600000);
    assert.equal(saved.product_discount, 1000000);
    assert.equal(saved.subtotal, 19600000);
    assert.equal(saved.coupon_discount, 1500000, "10% = 1.960.000 nhưng trần 1.500.000");
    assert.equal(saved.totalPrice, 18100000);
    assert.deepEqual({ code: saved.coupon.code, type: saved.coupon.type, value: saved.coupon.value, discount: saved.coupon.discount }, { code: "GIAM10", type: "percent", value: 10, discount: 1500000 });
    assert.deepEqual(saved.items.map((i) => [i.original_price, i.price, i.qty]), [[20000000, 19000000, 1], [300000, 300000, 2]]);
    assert.equal(saved.user_id, null, "khách vãng lai");
    assert.equal(coupon(store, "GIAM10").used_count, 1);
    assert.equal(res.body.data.coupon_discount, 1500000);
    assert.equal(res.body.data.totalPrice, 18100000);
    // Không có coupon: tổng = tạm tính sau khuyến mãi, coupon_discount = 0.
    const plain = await call("POST", "/order", { body: { ...ORDER, items: [{ prd_id: CASE._id, qty: 1 }] } });
    assert.equal(plain.status, 201);
    assert.equal(store.orders.at(-1).totalPrice, 300000);
    assert.equal(store.orders.at(-1).coupon, undefined);
});

test("không giảm hai lần, tổng không âm: một mã/đơn, mã lớn hơn tạm tính -> tổng 0", async (t) => {
    const { call, store } = await setup(t, { coupons: [C("BIG", { value: 999999999 }), C("A1"), C("A2")] });
    const res = await call("POST", "/order", { body: { ...ORDER, coupon_code: "BIG", items: [{ prd_id: CASE._id, qty: 1 }] } });
    assert.equal(res.status, 201, res.text);
    assert.equal(store.orders.at(-1).totalPrice, 0);
    assert.equal(store.orders.at(-1).coupon_discount, 300000);
    for (const coupon_code of [["A1", "A2"], { code: "A1" }, 123]) {
        const r = await call("POST", "/order", { body: { ...ORDER, coupon_code, items: [{ prd_id: CASE._id, qty: 1 }] } });
        assert.equal(r.status, 400, JSON.stringify(coupon_code));
    }
    assert.equal(coupon(store, "A1").used_count + coupon(store, "A2").used_count, 0);
    // Coupon phần trăm tính trên giá SAU khuyến mãi sản phẩm (19.000.000), không phải giá gốc.
    store.coupons.push(C("P50", { type: "percent", value: 50 }));
    await call("POST", "/order", { body: { ...ORDER, coupon_code: "P50", items: [{ prd_id: PHONE._id, qty: 1 }] } });
    assert.equal(store.orders.at(-1).coupon_discount, 9500000);
    assert.equal(store.orders.at(-1).totalPrice, 9500000);
});

test("nhiều đơn đồng thời tranh 2 lượt cuối: đúng 2 đơn thành công, không vượt lượt", async (t) => {
    const { call, store } = await setup(t, { coupons: [C("FLASH", { usage_limit: 3, used_count: 1 })] });
    const results = await Promise.all(Array.from({ length: 8 }, () => call("POST", "/order", { body: { ...ORDER, coupon_code: "FLASH", items: [{ prd_id: CASE._id, qty: 1 }] } })));
    const ok = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status !== 201);
    assert.equal(ok.length, 2, results.map((r) => r.status).join(","));
    assert.ok(failed.every((r) => [400, 409].includes(r.status) && /hết lượt/.test(r.body.message)), failed.map((r) => r.text).join("\n"));
    assert.equal(coupon(store, "FLASH").used_count, 3);
    assert.equal(store.orders.filter((o) => o.coupon && o.coupon.code === "FLASH").length, 2);
});

test("lưu đơn thất bại sau khi đã giữ lượt -> trả lại lượt; sản phẩm hết hàng -> không giữ lượt", async (t) => {
    const { call, store } = await setup(t, { coupons: [C("ONE", { usage_limit: 1 })] });
    const original = models.Order.prototype.save;
    t.mock.method(models.Order.prototype, "save", async () => {
        throw new Error("mất kết nối DB giả lập");
    });
    const quiet = console.error;
    console.error = () => {};
    let res;
    try {
        res = await call("POST", "/order", { body: { ...ORDER, coupon_code: "ONE", items: [{ prd_id: CASE._id, qty: 1 }] } });
    } finally {
        console.error = quiet;
    }
    assert.equal(res.status, 500);
    assert.equal(coupon(store, "ONE").used_count, 0, "lượt được hoàn");
    assert.equal(store.orders.length, 0);
    models.Order.prototype.save.mock.mockImplementation(original);
    store.products.find((p) => p._id === CASE._id).is_stock = false;
    const sold = await call("POST", "/order", { body: { ...ORDER, coupon_code: "ONE", items: [{ prd_id: CASE._id, qty: 1 }] } });
    assert.equal(sold.status, 400);
    assert.equal(coupon(store, "ONE").used_count, 0);
    store.products.find((p) => p._id === CASE._id).is_stock = true;
    const ok = await call("POST", "/order", { body: { ...ORDER, coupon_code: "ONE", items: [{ prd_id: CASE._id, qty: 1 }] } });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(coupon(store, "ONE").used_count, 1, "lượt duy nhất vẫn dùng được sau khi được hoàn");
});

test("API quản trị coupon và thống kê: khách 401, thành viên 403; admin tạo/sửa/vô hiệu hóa", async (t) => {
    const { call, store, tokens } = await setup(t, { coupons: [C("CU")] });
    const id = store.coupons[0]._id;
    const routes = [
        ["GET", "/coupons/admin"],
        ["POST", "/coupons/admin", { code: "MOI", type: "fixed", value: 1000 }],
        ["GET", `/coupons/admin/${id}`],
        ["PUT", `/coupons/admin/${id}`, { code: "CU", type: "fixed", value: 2000 }],
        ["PATCH", `/coupons/admin/${id}/status`, { is_active: false }],
        ["GET", "/stats/summary"],
        ["GET", "/stats/revenue"],
        ["GET", "/stats/top-products"],
    ];
    for (const [method, p, body] of routes) {
        assert.equal((await call(method, p, { body })).status, 401, `khách ${method} ${p}`);
        assert.equal((await call(method, p, { body, token: tokens.alice })).status, 403, `thành viên ${method} ${p}`);
    }
    const token = tokens.admin;
    const created = await call("POST", "/coupons/admin", { token, body: { code: "tet2027", type: "percent", value: 15, max_discount: 300000, min_order: 1000000, usage_limit: 100, ends_at: "2027-02-28T16:59:59Z" } });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.data.code, "TET2027");
    assert.equal(created.body.data.state, "active");
    assert.equal((await call("POST", "/coupons/admin", { token, body: { code: "TET2027", type: "fixed", value: 1 } })).status, 409, "trùng mã");
    assert.equal((await call("POST", "/coupons/admin", { token, body: { code: "X1", type: "fixed", value: 1, used_count: 99 } })).status, 400, "không cho đặt used_count");
    const cid = created.body.data._id;
    const upd = await call("PUT", `/coupons/admin/${cid}`, { token, body: { code: "TET2027", type: "fixed", value: 50000, usage_limit: 10 } });
    assert.equal(upd.status, 200, upd.text);
    assert.equal(upd.body.data.type, "fixed");
    const off = await call("PATCH", `/coupons/admin/${cid}/status`, { token, body: { is_active: false } });
    assert.equal(off.body.data.state, "disabled");
    const pv = await call("POST", "/coupons/preview", { body: { code: "TET2027", items: [{ prd_id: PHONE._id, qty: 1 }] } });
    assert.match(pv.body.message, /vô hiệu hóa/);
    assert.equal((await call("PATCH", `/coupons/admin/${cid}/status`, { token, body: { is_active: "no" } })).status, 400);
    const list = await call("GET", "/coupons/admin?state=disabled", { token });
    assert.deepEqual(list.body.data.docs.map((c) => c.code), ["TET2027"]);
    assert.equal((await call("GET", "/coupons/admin?q=tet", { token })).body.data.total, 1);
    assert.equal((await call("GET", "/coupons/admin?state=xyz", { token })).status, 400);
    // Mã đã dùng: không đổi được code, không hạ giới hạn dưới số đã dùng.
    store.coupons.find((c) => c._id === cid).used_count = 4;
    assert.equal((await call("PUT", `/coupons/admin/${cid}`, { token, body: { code: "TET2028", type: "fixed", value: 1 } })).status, 400);
    assert.equal((await call("PUT", `/coupons/admin/${cid}`, { token, body: { code: "TET2027", type: "fixed", value: 1, usage_limit: 3 } })).status, 400);
});

// ------------------------------------------------------------------------------------------- Thống kê

const at = (iso) => new Date(iso).toISOString();
const delivered = (iso, totalPrice, items, extra = {}) => ({ _id: oid(), status: "delivered", delivered_at: at(iso), createdAt: at(iso), totalPrice, items, ...extra });

test("thống kê (hàm thuần): chỉ đơn Đã giao, theo ngày giao giờ Việt Nam, giá đã lưu", () => {
    const pA = oid();
    const pB = oid();
    const orders = [
        delivered("2026-03-01T17:30:00Z", 1000, [{ prd_id: pA, price: 500, qty: 2 }]), // 00:30 ngày 02/03 giờ VN
        delivered("2026-03-02T10:00:00Z", 3000, [{ prd_id: pB, price: 3000, qty: 1 }]),
        { _id: oid(), status: "shipping", totalPrice: 9999, createdAt: at("2026-03-02T01:00:00Z"), items: [{ prd_id: pA, price: 9999, qty: 9 }] },
        { _id: oid(), status: "cancelled", totalPrice: 9999, createdAt: at("2026-03-02T01:00:00Z"), items: [] },
        { _id: oid(), totalPrice: 9999, createdAt: at("2026-03-02T01:00:00Z"), items: [{ prd_id: pA, price: 1, qty: 99 }] }, // đơn demo cũ
        // Giao trước đợt 5 (chưa có delivered_at): dùng mốc trong status_history.
        { _id: oid(), status: "delivered", totalPrice: 500, createdAt: at("2026-02-20T00:00:00Z"), status_history: [{ from: "shipping", to: "delivered", at: at("2026-03-03T03:00:00Z") }], items: [{ prd_id: pA, price: 500, qty: 1 }] },
    ];
    const range = parseRange({ from: "2026-03-01", to: "2026-03-03" }, new Date("2026-03-10T00:00:00Z"));
    const { series, totals } = revenueSeries(orders, range);
    assert.deepEqual(series, [
        { key: "2026-03-01", revenue: 0, orders: 0 },
        { key: "2026-03-02", revenue: 4000, orders: 2 },
        { key: "2026-03-03", revenue: 500, orders: 1 },
    ]);
    assert.deepEqual(totals, { revenue: 4500, orders: 3, average_order_value: 1500 });
    const month = revenueSeries(orders, parseRange({ from: "2026-01-15", to: "2026-03-31", group: "month" }));
    assert.deepEqual(month.series.map((b) => [b.key, b.revenue]), [["2026-01", 0], ["2026-02", 0], ["2026-03", 4500]]);
    const cards = periodCards(orders, new Date("2026-03-02T12:00:00Z"));
    assert.deepEqual([cards.today.revenue, cards.month.revenue, cards.year.revenue], [4000, 4500, 4500]);
    const top = topProducts(orders, { sort: "qty" });
    assert.deepEqual(top.map((r) => [r.prd_id, r.qty, r.revenue]), [[pA, 3, 1500], [pB, 1, 3000]], "không cộng đơn đang giao/đơn demo");
    assert.equal(topProducts(orders, { sort: "revenue" })[0].prd_id, pB);
    assert.equal(dayKey("2026-03-01T17:00:00Z"), "2026-03-02");
    for (const q of [{ from: "2026-02-30" }, { from: "03/01/2026" }, { from: "2026-03-05", to: "2026-03-01" }, { group: "week" }, { from: "2020-01-01", to: "2026-01-01" }]) {
        assert.throws(() => parseRange(q), (e) => e.status === 400, JSON.stringify(q));
    }
    assert.equal(parseRange({}, new Date("2026-03-10T00:00:00Z")).keys.length, 30, "mặc định 30 ngày");
});

test("API thống kê: đơn demo/chờ/đang giao/hủy không tính doanh thu; đếm trạng thái; sản phẩm bán chạy", async (t) => {
    const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const legacy = Array.from({ length: 5 }, () => ({ _id: oid(), fullName: "Demo", totalPrice: 777777, createdAt: iso(now - 2 * DAY), items: [{ _id: oid(), prd_id: PHONE._id, price: 777777, qty: 1 }] }));
    const orders = [
        ...legacy,
        { _id: oid(), status: "delivered", delivered_at: iso(now - 1000), createdAt: iso(now - DAY), totalPrice: 18100000, items: [{ prd_id: PHONE._id, price: 19000000, qty: 1 }], coupon_discount: 900000 },
        { _id: oid(), status: "delivered", delivered_at: iso(now - 2000), createdAt: iso(now - DAY), totalPrice: 600000, items: [{ prd_id: CASE._id, price: 300000, qty: 2 }] },
        { _id: oid(), status: "shipping", createdAt: iso(now - DAY), totalPrice: 5000000, items: [{ prd_id: CASE._id, price: 300000, qty: 9 }] },
        { _id: oid(), status: "cancelled", createdAt: iso(now - DAY), totalPrice: 7000000, items: [] },
        { _id: oid(), status: "confirmed", createdAt: iso(now - DAY), totalPrice: 1, items: [] },
    ];
    const { call, store, tokens } = await setup(t, { orders });
    const before = JSON.stringify(store.orders);
    const token = tokens.admin;
    const sum = await call("GET", "/stats/summary", { token });
    assert.equal(sum.status, 200, sum.text);
    assert.equal(sum.body.data.revenue.today.revenue, 18700000);
    assert.equal(sum.body.data.revenue.today.orders, 2);
    assert.equal(sum.body.data.revenue.today.average_order_value, 9350000);
    assert.equal(sum.body.data.revenue.year.revenue, 18700000);
    assert.equal(sum.body.data.orders.total, 10);
    assert.deepEqual(sum.body.data.orders.by_status, { pending: 5, confirmed: 1, shipping: 1, delivered: 2, cancelled: 1 });
    assert.equal(sum.body.data.orders.pending, 5, "đơn demo cũ = chờ xác nhận, không phải đã giao");
    assert.equal(sum.body.data.orders.in_progress, 2);

    const rev = await call("GET", "/stats/revenue", { token });
    assert.equal(rev.status, 200, rev.text);
    assert.equal(rev.body.data.series.length, 30);
    assert.equal(rev.body.data.totals.revenue, 18700000);
    assert.equal(rev.body.data.totals.orders, 2);
    assert.equal(rev.body.data.orders_created.total, 10);
    assert.equal(rev.body.data.orders_created.by_status.pending, 5);
    const byMonth = await call("GET", "/stats/revenue?group=month", { token });
    assert.equal(byMonth.body.data.series.length, 12);
    assert.equal(byMonth.body.data.series.at(-1).revenue, 18700000);
    assert.equal((await call("GET", "/stats/revenue?from=2026-13-01", { token })).status, 400);

    const top = await call("GET", "/stats/top-products?sort=qty", { token });
    assert.deepEqual(top.body.data.docs.map((r) => [r.name, r.qty, r.revenue]), [["Ốp lưng", 2, 600000], ["iPhone 15", 1, 19000000]]);
    const topRev = await call("GET", "/stats/top-products?sort=revenue&limit=1", { token });
    assert.deepEqual(topRev.body.data.docs.map((r) => r.name), ["iPhone 15"]);
    assert.equal((await call("GET", "/stats/top-products?sort=price", { token })).status, 400);
    assert.equal(JSON.stringify(store.orders), before, "thống kê không ghi gì vào đơn");
});

test("admin chuyển sang Đã giao -> ghi delivered_at và đơn được tính vào doanh thu hôm nay", async (t) => {
    const order = { _id: oid(), status: "shipping", fullName: "A", phone: "0912345678", email: "a@x.vn", address: "HN", createdAt: new Date(Date.now() - 3 * DAY).toISOString(), totalPrice: 123000, items: [{ _id: oid(), prd_id: CASE._id, price: 123000, qty: 1 }] };
    const { call, store, tokens } = await setup(t, { orders: [order] });
    assert.equal((await call("GET", "/stats/summary", { token: tokens.admin })).body.data.revenue.today.revenue, 0);
    const r = await call("PATCH", `/order/admin/${order._id}/status`, { token: tokens.admin, body: { status: "delivered" } });
    assert.equal(r.status, 200, r.text);
    assert.ok(store.orders[0].delivered_at, "có delivered_at");
    assert.equal(r.body.data.delivered_at !== null, true);
    assert.equal((await call("GET", "/stats/summary", { token: tokens.admin })).body.data.revenue.today.revenue, 123000);
});
