// GET /products (tìm kiếm + lọc + sắp xếp + phân trang), giá sau ưu đãi, sản phẩm hết hàng, đặt hàng theo giá DB.
// Chạy trên app Express thật với dữ liệu giả trong bộ nhớ — không chạm MongoDB GR2.
const test = require("node:test");
const assert = require("node:assert/strict");
const { oid, installFakeDb, makeUser, tokenFor, startServer } = require("../security/fake-app");

const PHONES = { _id: oid(), name: "Điện thoại" };
const ACCESSORIES = { _id: oid(), name: "Phụ kiện" };
// _id tăng dần theo thời gian tạo -> "mới nhất" = _id lớn nhất. Ghép tiền tố cố định để thứ tự ổn định.
let seq = 0;
const id = () => (++seq).toString(16).padStart(8, "0") + oid().slice(8);
const P = (name, price, promotion, extra = {}) => ({
    _id: id(), name, category_id: PHONES._id, image: "x.jpg", price, promotion, status: "Mới", accessories: "-", details: "mô tả dài", is_stock: true, is_featured: false, ...extra,
});
const IPHONE = P("iPhone 15 128GB", "19990000", "500000", { is_featured: true }); // giảm 500k -> 19.490.000
const GALAXY = P("Samsung Galaxy S24+ 256GB", "22990000", "0");
const NOKIA = P("Nokia 105 4G Pro", "590000", "Tặng sim 4G"); // khuyến mại dạng chữ
const CASE = P("Ốp lưng iPhone 15", "290000", "0", { category_id: ACCESSORIES._id });
const GLASS = P("Kính cường lực iPhone 15", "190000", "0", { category_id: ACCESSORIES._id, is_stock: false });
const BROKEN = P("Sản phẩm lỗi giá", "Liên hệ", "100", { category_id: ACCESSORIES._id });
const LEGACY = P("Cáp sạc cũ", "150000", "0", { category_id: ACCESSORIES._id }); // không có is_stock/is_featured
delete LEGACY.is_stock;
delete LEGACY.is_featured;
const ALL = [IPHONE, GALAXY, NOKIA, CASE, GLASS, BROKEN, LEGACY];

async function setup(t, products = ALL) {
    const store = installFakeDb(t, { products, categories: [PHONES, ACCESSORIES] });
    const call = await startServer(t);
    return { store, call };
}
const names = (res) => res.body.data.docs.map((p) => p.name);
const qs = (o) => "/products?" + new URLSearchParams(o).toString();

test("mặc định: mọi sản phẩm (kể cả hết hàng), mới nhất trước, 12/trang, có tổng/trang và định dạng cũ cho Admin", async (t) => {
    const { call } = await setup(t);
    const res = await call("GET", "/products");
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(names(res), [...ALL].reverse().map((p) => p.name));
    const { total, page, limit, totalPages } = res.body.data;
    assert.deepEqual({ total, page, limit, totalPages }, { total: 7, page: 1, limit: 12, totalPages: 1 });
    assert.equal(res.body.pages.totalRows, 7, "giữ object pages cũ");
    assert.equal(res.body.data.docs[0].details, undefined, "danh sách không kèm mô tả dài");
    assert.equal(res.body.data.docs.find((p) => p.name === LEGACY.name).is_stock, true, "thiếu is_stock = còn hàng");
});

test("tìm kiếm: có dấu/không dấu, hoa/thường, ký tự đặc biệt, không kết quả", async (t) => {
    const { call } = await setup(t);
    for (const q of ["op lung", "ỐP LƯNG", "Ốp lưng"]) assert.deepEqual(names(await call("GET", qs({ q }))), [CASE.name], q);
    assert.deepEqual(names(await call("GET", qs({ q: "IPHONE 15" }))), [GLASS.name, CASE.name, IPHONE.name]);
    assert.deepEqual(names(await call("GET", qs({ q: "cuong luc" }))), [GLASS.name]);
    assert.deepEqual(names(await call("GET", qs({ q: "S24+" }))), [GALAXY.name]);
    assert.deepEqual(names(await call("GET", qs({ keyword: "nokia" }))), [NOKIA.name], "tham số cũ keyword");
    const none = await call("GET", qs({ q: ".*" }));
    assert.equal(none.status, 200);
    assert.deepEqual(none.body.data, { docs: [], total: 0, page: 1, limit: 12, totalPages: 0 });
    assert.equal((await call("GET", "/products?q[$regex]=.*")).status, 400, "không nhận toán tử Mongo");
});

test("lọc + sắp xếp + phân trang kết hợp trong một request; giá lọc theo giá BÁN", async (t) => {
    const { call } = await setup(t);
    // Danh mục + còn hàng: GLASS (hết hàng) bị loại.
    assert.deepEqual(names(await call("GET", qs({ category_id: ACCESSORIES._id, in_stock: "true", sort: "name_asc" }))), [LEGACY.name, CASE.name, BROKEN.name]);
    // Khoảng giá theo giá bán: iPhone giá gốc 19.990.000 nhưng bán 19.490.000.
    assert.deepEqual(names(await call("GET", qs({ min_price: "19000000", max_price: "19500000" }))), [IPHONE.name]);
    assert.deepEqual(names(await call("GET", qs({ min_price: "19500000", max_price: "20000000" }))), []);
    // Sản phẩm giá hỏng không lọt vào khoảng giá, và nằm cuối khi sắp theo giá.
    const asc = await call("GET", qs({ sort: "price_asc" }));
    assert.deepEqual(names(asc), [LEGACY.name, GLASS.name, CASE.name, NOKIA.name, IPHONE.name, GALAXY.name, BROKEN.name]);
    assert.deepEqual(names(await call("GET", qs({ sort: "price_desc", max_price: "1000000" }))), [NOKIA.name, CASE.name, GLASS.name, LEGACY.name]);
    assert.deepEqual(names(await call("GET", qs({ sort: "name_desc", category_id: PHONES._id }))), [GALAXY.name, NOKIA.name, IPHONE.name]);
    // Tất cả cùng lúc + phân trang.
    const combo = { q: "iphone", in_stock: "1", sort: "price_asc", max_price: "30000000", limit: "1" };
    const p1 = await call("GET", qs({ ...combo, page: "1" }));
    const p2 = await call("GET", qs({ ...combo, page: "2" }));
    const p3 = await call("GET", qs({ ...combo, page: "3" }));
    assert.deepEqual([names(p1), names(p2), names(p3)], [[CASE.name], [IPHONE.name], []]);
    assert.deepEqual(p1.body.pages, { totalRows: 2, totalPages: 2, currentPage: 1, next: 2, prev: 0, hasNext: true, hasPrev: false });
    assert.equal(p2.body.pages.hasNext, false);
    assert.equal(p1.body.filter.q, "iphone");
    // Phân trang ở nhánh lọc trong MongoDB (không lọc giá).
    const db = await call("GET", qs({ limit: "3", page: "3" }));
    assert.deepEqual(names(db), [IPHONE.name]);
    assert.equal(db.body.data.totalPages, 3);
    // Tham số cũ của trang chủ.
    assert.deepEqual(names(await call("GET", "/products?filter[is_featured]=true&limit=6")), [IPHONE.name]);
    // Tham số sai -> 400 có thông báo, không 500.
    for (const bad of [{ page: "0" }, { sort: "random" }, { min_price: "9", max_price: "1" }, { category_id: "123" }]) {
        const res = await call("GET", qs(bad));
        assert.equal(res.status, 400, JSON.stringify(bad));
        assert.ok(res.body.message);
    }
});

test("giá trả về: giá gốc/giá bán/% giảm chỉ khi có ưu đãi hợp lệ; trang chi tiết và danh mục cũng có", async (t) => {
    const { call } = await setup(t);
    const byName = Object.fromEntries((await call("GET", "/products")).body.data.docs.map((p) => [p.name, p]));
    const pick = (p) => ({ original_price: p.original_price, final_price: p.final_price, discount_percent: p.discount_percent, has_discount: p.has_discount, promotion_text: p.promotion_text });
    assert.deepEqual(pick(byName[IPHONE.name]), { original_price: 19990000, final_price: 19490000, discount_percent: 3, has_discount: true, promotion_text: null });
    assert.deepEqual(pick(byName[GALAXY.name]), { original_price: 22990000, final_price: 22990000, discount_percent: 0, has_discount: false, promotion_text: null });
    assert.deepEqual(pick(byName[NOKIA.name]), { original_price: 590000, final_price: 590000, discount_percent: 0, has_discount: false, promotion_text: "Tặng sim 4G" });
    assert.deepEqual(pick(byName[BROKEN.name]), { original_price: null, final_price: null, discount_percent: 0, has_discount: false, promotion_text: null });
    assert.equal(byName[IPHONE.name].price, "19990000", "giữ trường price gốc cho Admin");
    const detail = await call("GET", `/products/${IPHONE._id}`);
    assert.equal(detail.body.data.final_price, 19490000);
    assert.equal(detail.body.data.details, "mô tả dài");
    const cat = await call("GET", `/categories/${PHONES._id}/products`);
    assert.equal(cat.body.data.docs.find((p) => p._id === IPHONE._id).final_price, 19490000);
});

const ORDER = { fullName: "Khách", phone: "0912345678", email: "khach@mail.vn", address: "1 Đại Cồ Việt, Hà Nội" };

test("đặt hàng: dùng giá bán sau ưu đãi từ DB, bỏ qua giá client; hết hàng và giá hỏng bị từ chối", async (t) => {
    const { call, store } = await setup(t);
    const res = await call("POST", "/order", { body: { ...ORDER, totalPrice: 1, items: [{ prd_id: IPHONE._id, qty: 2, price: 1, final_price: 1 }, { prd_id: NOKIA._id, qty: 1 }] } });
    assert.equal(res.status, 201, res.text);
    const saved = store.orders.at(-1);
    assert.deepEqual(saved.items.map((i) => i.price), [19490000, 590000]);
    assert.equal(saved.totalPrice, 2 * 19490000 + 590000);
    assert.equal(res.body.data.totalPrice, saved.totalPrice);

    const before = store.orders.length;
    const sold = await call("POST", "/order", { body: { ...ORDER, items: [{ prd_id: CASE._id, qty: 1 }, { prd_id: GLASS._id, qty: 1 }] } });
    assert.equal(sold.status, 400);
    assert.match(sold.body.message, /Kính cường lực iPhone 15.*hết hàng/);
    const broken = await call("POST", "/order", { body: { ...ORDER, items: [{ prd_id: BROKEN._id, qty: 1 }] } });
    assert.equal(broken.status, 400);
    assert.match(broken.body.message, /chưa có giá hợp lệ/);
    assert.equal(store.orders.length, before, "không tạo đơn khi có sản phẩm hết hàng/giá hỏng");
});

test("admin: đặt được sản phẩm thành hết hàng (sửa lỗi is_stock || true); không gửi cờ thì giữ nguyên", async (t) => {
    const { call, store } = await setup(t, [{ ...CASE }]);
    const admin = await makeUser(store, { email: "admin@shop.vn", role: "admin" });
    const token = tokenFor(admin);
    const body = { name: CASE.name, category_id: CASE.category_id, image: "x.jpg", price: "290000", status: "Mới", accessories: "-", promotion: "0", details: "d" };
    const product = () => store.products.find((p) => p._id === CASE._id);
    let res = await call("PUT", `/products/${CASE._id}/update`, { token, body: { ...body, is_stock: false } });
    assert.equal(res.status, 200, res.text);
    assert.equal(product().is_stock, false, "JSON false");
    res = await call("PUT", `/products/${CASE._id}/update`, { token, body });
    assert.equal(product().is_stock, false, "không gửi is_stock -> giữ nguyên hết hàng");
    res = await call("PUT", `/products/${CASE._id}/update`, { token, body: { ...body, is_stock: "true", is_featured: "1" } });
    assert.equal(product().is_stock, true, "chuỗi 'true' từ form");
    assert.equal(product().is_featured, true);
    res = await call("PUT", `/products/${CASE._id}/update`, { token, body: { ...body, is_stock: "0" } });
    assert.equal(product().is_stock, false, "chuỗi '0' từ form");
    res = await call("PUT", `/products/${CASE._id}/update`, { token, body: { ...body, is_stock: "có" } });
    assert.equal(res.status, 400);
    res = await call("POST", "/products/create", { token, body: { ...body, name: "Sản phẩm mới", is_stock: "false" } });
    assert.equal(res.status, 201, res.text);
    assert.equal(store.products.find((p) => p.name === "Sản phẩm mới").is_stock, false, "tạo mới ở trạng thái hết hàng");
    // Hết hàng -> không đặt được.
    const order = await call("POST", "/order", { body: { ...ORDER, items: [{ prd_id: CASE._id, qty: 1 }] } });
    assert.equal(order.status, 400);
});

test("gợi ý mua kèm: thẻ sản phẩm có giá bán sau ưu đãi; lỗi tra giá không làm hỏng API", async () => {
    const { attachPricing } = require("../../src/apps/controllers/apis/recommendation");
    const data = { items: [{ product: { _id: IPHONE._id, name: IPHONE.name, price: 19990000 }, source: "association-rule" }, { product: { _id: "x", name: "Không có" } }] };
    const out = await attachPricing(data, async () => [{ _id: IPHONE._id, price: IPHONE.price, promotion: IPHONE.promotion, is_stock: true }]);
    assert.equal(out.items[0].product.final_price, 19490000);
    assert.equal(out.items[0].product.price, 19990000, "giữ trường cũ");
    assert.equal(out.items[0].source, "association-rule");
    assert.deepEqual(out.items[1], data.items[1]);
    const original = console.error;
    console.error = () => {};
    try {
        assert.equal(await attachPricing(data, async () => { throw new Error("db down"); }), data);
    } finally {
        console.error = original;
    }
    assert.equal(await attachPricing(data, undefined), data);
});
