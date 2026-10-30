// Quản trị (Giai đoạn 5 – đợt 4): CRUD sản phẩm/danh mục, upload ảnh, danh sách/chi tiết/trạng thái đơn hàng.
// App Express thật + dữ liệu giả trong bộ nhớ — không chạm MongoDB GR2. File ảnh ghi vào thư mục tạm.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { oid, installFakeDb, makeUser, tokenFor, startServer } = require("../security/fake-app");
const { TRANSITIONS } = require("../../src/libs/order-status");

const PHONES = { _id: oid(), name: "Điện thoại" };
const EMPTY = { _id: oid(), name: "Danh mục trống" };
const P = (name, extra = {}) => ({ _id: oid(), name, category_id: PHONES._id, image: "a.jpg", price: "1000000", promotion: "0", status: "Mới", accessories: "-", details: "d", is_stock: true, is_featured: false, ...extra });
const IPHONE = P("iPhone 15 128GB", { promotion: "100000" });
const OLD = P("Nokia 105 cũ");
const VALID = { name: "Galaxy A55", category_id: PHONES._id, image: "a55.jpg", price: "8990000", promotion: "500000", status: "Mới 100%", accessories: "Cáp, sạc", details: "Mô tả" };

let seq = 0;
const orderId = () => (++seq).toString(16).padStart(8, "0") + oid().slice(8);
const ORDER = (extra = {}) => ({
    _id: orderId(), fullName: "Nguyễn Văn An", phone: "0912345678", email: "an@mail.vn", address: "1 Đại Cồ Việt, Hà Nội",
    totalPrice: 900000, items: [{ _id: oid(), prd_id: IPHONE._id, price: 900000, qty: 1 }], createdAt: new Date(Date.UTC(2026, 0, 1) + seq * 60000).toISOString(), ...extra,
});

async function setup(t, seed = {}) {
    const store = installFakeDb(t, { categories: [PHONES, EMPTY], products: [IPHONE, OLD], ...seed });
    const admin = await makeUser(store, { email: "admin@shop.vn", role: "admin" });
    const alice = await makeUser(store, { email: "alice@shop.vn" });
    const call = await startServer(t);
    return { store, call, admin, alice, tokens: { admin: tokenFor(admin), alice: tokenFor(alice) } };
}

test("phân quyền route quản trị mới: khách 401, thành viên 403, admin được phép", async (t) => {
    const order = ORDER();
    const { call, tokens } = await setup(t, { orders: [order] });
    const routes = [
        ["GET", "/order/admin"],
        ["GET", `/order/admin/${order._id}`],
        ["PATCH", `/order/admin/${order._id}/status`, { status: "confirmed" }],
        ["POST", "/products/upload-image"],
    ];
    for (const [method, p, body] of routes) {
        assert.equal((await call(method, p, { body })).status, 401, `khách ${method} ${p}`);
        assert.equal((await call(method, p, { body, token: tokens.alice })).status, 403, `thành viên ${method} ${p}`);
        const res = await call(method, p, { body, token: tokens.admin });
        assert.ok(![401, 403].includes(res.status) && res.status < 500, `admin ${method} ${p} -> ${res.status}`);
    }
});

test("sản phẩm: tạo bằng JSON đúng schema, kiểm tra dữ liệu, trùng tên, danh mục không tồn tại", async (t) => {
    const { call, store, tokens } = await setup(t);
    const token = tokens.admin;
    const res = await call("POST", "/products/create", { token, body: { ...VALID, price: "8.990.000", is_stock: false, is_featured: "true" } });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.data.final_price, 8490000);
    const saved = store.products.find((p) => p.name === "Galaxy A55");
    assert.equal(saved.price, "8990000", "giá lưu dạng chữ số thuần như dữ liệu demo");
    assert.equal(saved.is_stock, false);
    assert.equal(saved.is_featured, true);
    // Tên trường cũ cat_id vẫn nhận; quà tặng dạng chữ không đổi giá.
    const gift = await call("POST", "/products/create", { token, body: { ...VALID, name: "Galaxy A35", category_id: undefined, cat_id: PHONES._id, promotion: "Tặng ốp lưng" } });
    assert.equal(gift.status, 201, gift.text);
    assert.equal(gift.body.data.final_price, 8990000);
    assert.equal(gift.body.data.promotion_text, "Tặng ốp lưng");

    const bad = [
        [{ ...VALID, name: "  " }, 400, /Tên sản phẩm/],
        [{ ...VALID, name: "x".repeat(201) }, 400, /tối đa 200/],
        [{ ...VALID, price: "abc" }, 400, /Giá gốc/],
        [{ ...VALID, price: "0" }, 400, /Giá gốc/],
        [{ ...VALID, price: -5 }, 400, /Giá gốc/],
        [{ ...VALID, promotion: "8990000" }, 400, /nhỏ hơn giá gốc/],
        [{ ...VALID, promotion: "-1" }, 400, /không âm/],
        [{ ...VALID, image: "../../../etc/passwd" }, 400, /ảnh/],
        [{ ...VALID, image: "/abs.jpg" }, 400, /ảnh/],
        [{ ...VALID, category_id: "abc" }, 400, /Danh mục/],
        [{ ...VALID, category_id: oid() }, 400, /Danh mục không tồn tại/],
        [{ ...VALID, is_stock: "có" }, 400, /is_stock/],
        [{ ...VALID, details: "" }, 400, /Mô tả/],
        [{ ...VALID, name: "IPHONE 15 128gb" }, 409, /cùng tên/],
    ];
    for (const [body, status, msg] of bad) {
        const r = await call("POST", "/products/create", { token, body });
        assert.equal(r.status, status, `${JSON.stringify(body).slice(0, 80)} -> ${r.text}`);
        assert.match(r.body.message, msg);
    }
    assert.equal(store.products.length, 4, "không tạo sản phẩm khi dữ liệu sai");
});

test("sản phẩm: sửa giữ cờ khi không gửi, đổi giá/giảm giá; xóa chặn khi đã có đơn, xóa được thì xóa bình luận", async (t) => {
    const { call, store, tokens } = await setup(t, { orders: [ORDER()], comments: [{ _id: oid(), product_id: OLD._id, name: "A", email: "a@x.vn", content: "Tốt" }] });
    const token = tokens.admin;
    const upd = await call("PUT", `/products/${IPHONE._id}/update`, { token, body: { ...VALID, name: IPHONE.name, price: "2000000", promotion: "500000", is_stock: false } });
    assert.equal(upd.status, 200, upd.text);
    assert.equal(upd.body.data.final_price, 1500000);
    assert.equal(upd.body.data.discount_percent, 25);
    const again = await call("PUT", `/products/${IPHONE._id}/update`, { token, body: { ...VALID, name: IPHONE.name } });
    assert.equal(again.body.data.is_stock, false, "không gửi is_stock -> giữ hết hàng");
    assert.equal((await call("PUT", `/products/${IPHONE._id}/update`, { token, body: { ...VALID, name: OLD.name } })).status, 409, "trùng tên sản phẩm khác");
    assert.equal((await call("PUT", `/products/${oid()}/update`, { token, body: VALID })).status, 404);

    const blocked = await call("DELETE", `/products/${IPHONE._id}/delete`, { token });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.message, /đã có trong 1 đơn hàng.*Hết hàng/);
    assert.ok(store.products.some((p) => p._id === IPHONE._id), "sản phẩm có đơn không bị xóa");
    const ok = await call("DELETE", `/products/${OLD._id}/delete`, { token });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.data.deletedComments, 1);
    assert.equal(store.comments.length, 0);
    assert.equal((await call("DELETE", `/products/${OLD._id}/delete`, { token })).status, 404);
});

test("danh sách sản phẩm cho Admin: phân trang backend, lọc hết hàng/còn hàng", async (t) => {
    const many = Array.from({ length: 25 }, (_, i) => P(`Máy ${String(i).padStart(2, "0")}`, { is_stock: i % 5 !== 0 }));
    const { call } = await setup(t, { products: many });
    const p3 = await call("GET", "/products?limit=10&page=3&sort=name_asc");
    assert.deepEqual([p3.body.data.total, p3.body.data.totalPages, p3.body.data.docs.length], [25, 3, 5]);
    assert.equal(p3.body.data.docs[0].name, "Máy 20");
    const out = await call("GET", "/products?stock=out&limit=48");
    assert.equal(out.body.data.total, 5);
    assert.ok(out.body.data.docs.every((p) => p.is_stock === false));
    assert.equal((await call("GET", "/products?stock=in")).body.data.total, 20);
    assert.equal((await call("GET", "/products?stock=maybe")).status, 400);
});

test("upload ảnh: chỉ ảnh thật, tối đa 2MB, tên file do server sinh", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-img-"));
    process.env.PRODUCT_IMAGE_DIR = dir;
    t.after(() => {
        delete process.env.PRODUCT_IMAGE_DIR;
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const { call, tokens } = await setup(t);
    const send = (bytes, name, type = "image/png") => {
        const form = new FormData();
        form.append("image", new Blob([bytes], { type }), name);
        return call("POST", "/products/upload-image", { token: tokens.admin, raw: form });
    };
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = await send(png, "../../evil name.png");
    assert.equal(ok.status, 201, ok.text);
    assert.match(ok.body.data.image, /^\d+-[0-9a-f]{12}\.png$/);
    assert.ok(fs.existsSync(path.join(dir, ok.body.data.image)));
    const fake = await send(Buffer.from("<svg onload=alert(1)>"), "x.png");
    assert.equal(fake.status, 400, "đuôi .png nhưng nội dung không phải ảnh");
    assert.equal((await send(Buffer.from("<svg/>"), "x.svg", "image/svg+xml")).status, 400);
    const big = await send(Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]), "big.png");
    assert.equal(big.status, 400);
    assert.match(big.body.message, /2 MB/);
    assert.equal((await call("POST", "/products/upload-image", { token: tokens.admin, raw: new FormData() })).status, 400);
    assert.equal(fs.readdirSync(dir).length, 1, "chỉ file hợp lệ được ghi");
});

test("danh mục: thêm/sửa/xóa, trùng tên, không xóa danh mục còn sản phẩm, phân trang", async (t) => {
    const { call, store, tokens } = await setup(t);
    const token = tokens.admin;
    const created = await call("POST", "/categories/create", { token, body: { name: "  Phụ   kiện " } });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.data.name, "Phụ kiện");
    assert.equal((await call("POST", "/categories/create", { token, body: { cat_name: "Máy tính bảng" } })).status, 201, "tên trường cũ cat_name");
    assert.equal((await call("POST", "/categories/create", { token, body: { name: "PHỤ KIỆN" } })).status, 409);
    assert.equal((await call("POST", "/categories/create", { token, body: { name: "" } })).status, 400);
    assert.equal((await call("POST", "/categories/create", { token, body: { name: "x".repeat(101) } })).status, 400);

    const renamed = await call("PUT", `/categories/update/${PHONES._id}`, { token, body: { name: "Điện thoại di động" } });
    assert.equal(renamed.status, 200, renamed.text);
    assert.equal(store.products.find((p) => p._id === IPHONE._id).category_id, PHONES._id, "category_id của sản phẩm giữ nguyên");
    assert.equal((await call("PUT", `/categories/update/${PHONES._id}`, { token, body: { name: "phụ kiện" } })).status, 409);
    assert.equal((await call("PUT", `/categories/update/${oid()}`, { token, body: { name: "Mới" } })).status, 404);

    const blocked = await call("DELETE", `/categories/delete/${PHONES._id}`, { token });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.message, /còn 2 sản phẩm/);
    assert.ok(store.categories.some((c) => c._id === PHONES._id));
    assert.equal((await call("DELETE", `/categories/delete/${EMPTY._id}`, { token })).status, 200);
    assert.equal((await call("DELETE", `/categories/delete/${EMPTY._id}`, { token })).status, 404);

    const list = await call("GET", "/categories?limit=2&page=2&with_counts=1");
    assert.equal(list.status, 200);
    assert.deepEqual([list.body.data.total, list.body.data.totalPages, list.body.data.docs.length], [3, 2, 1]);
    const counts = (await call("GET", "/categories?with_counts=1")).body.data.docs;
    assert.equal(counts.find((c) => c._id === PHONES._id).product_count, 2);
    assert.equal((await call("GET", "/categories")).body.data.docs.length, 3, "Shop gọi không tham số vẫn chạy");
    assert.equal((await call("GET", "/categories?page=0")).status, 400);
});

test("đơn hàng Admin: phân trang, lọc trạng thái (gồm đơn cũ không status), tìm theo mã/tên/điện thoại/email", async (t) => {
    const legacy = Array.from({ length: 23 }, (_, i) => ORDER({ fullName: `Khách demo ${i}`, phone: `09000000${String(i).padStart(2, "0")}`, email: `demo${i}@x.vn` }));
    const special = ORDER({ fullName: "Trần Thị Bình", phone: "0987654321", email: "binh@shop.vn", status: "shipping", user_id: oid() });
    const { call, tokens, store } = await setup(t, { orders: [...legacy, special] });
    const before = JSON.stringify(store.orders);
    const get = (qs) => call("GET", `/order/admin${qs}`, { token: tokens.admin });
    const p1 = await get("?limit=10");
    assert.deepEqual([p1.body.data.total, p1.body.data.totalPages, p1.body.data.docs.length], [24, 3, 10]);
    assert.equal(p1.body.data.docs[0]._id, special._id, "mới nhất trước");
    assert.equal(p1.body.data.docs[1].status, "pending", "đơn cũ không status hiển thị Chờ xác nhận");
    assert.equal(p1.body.data.docs[1].legacy_status, true);
    assert.equal((await get("?limit=10&page=3")).body.data.docs.length, 4);
    assert.equal((await get("?status=pending")).body.data.total, 23);
    assert.equal((await get("?status=shipping")).body.data.total, 1);
    assert.equal((await get("?status=delivered")).body.data.total, 0);
    const ids = (r) => r.body.data.docs.map((o) => o._id);
    assert.deepEqual(ids(await get("?q=tran thi binh")), [special._id], "tên không dấu");
    assert.deepEqual(ids(await get("?q=0987 654 321")), [special._id], "số điện thoại");
    assert.deepEqual(ids(await get("?q=BINH@shop")), [special._id], "email");
    assert.deepEqual(ids(await get(`?q=%23${special._id.slice(-8).toUpperCase()}`)), [special._id], "mã đơn ngắn #XXXXXXXX");
    assert.deepEqual(ids(await get(`?q=${special._id}&status=shipping`)), [special._id], "mã đầy đủ + trạng thái");
    assert.deepEqual(ids(await get(`?q=${special._id}&status=pending`)), []);
    assert.equal((await get("?q=.*")).body.data.total, 0, "không phải regex");
    for (const bad of ["?status=done", "?page=0", "?sort=random", `?q=${"x".repeat(101)}`]) assert.equal((await get(bad)).status, 400, bad);
    assert.equal(JSON.stringify(store.orders), before, "xem danh sách không ghi gì vào đơn cũ");
});

test("chi tiết đơn: sản phẩm, giá, tổng tiền, khách, địa chỉ; đơn cũ không status", async (t) => {
    const legacy = ORDER({ items: [{ _id: oid(), prd_id: IPHONE._id, price: 900000, qty: 2 }, { _id: oid(), prd_id: oid(), price: 50000, qty: 1 }], totalPrice: 1850000 });
    const { call, tokens, alice, store } = await setup(t, { orders: [legacy] });
    const member = ORDER({ user_id: alice._id, status: "confirmed", shipping_address: { province: "Hà Nội", province_code: 1, district: null, ward: "Phường Bách Khoa", ward_code: 2, detail: "Số 1" } });
    store.orders.push(member);
    const d1 = await call("GET", `/order/admin/${legacy._id}`, { token: tokens.admin });
    assert.equal(d1.status, 200, d1.text);
    assert.equal(d1.body.data.status, "pending");
    assert.equal(d1.body.data.legacy_status, true);
    assert.deepEqual(d1.body.data.next_statuses, ["confirmed", "cancelled"]);
    assert.deepEqual(d1.body.data.items.map((i) => [i.name, i.qty, i.subtotal]), [[IPHONE.name, 2, 1800000], ["Sản phẩm đã bị xóa", 1, 50000]]);
    assert.equal(d1.body.data.totalPrice, 1850000);
    assert.equal(d1.body.data.user, null, "đơn khách / demo");
    assert.equal(d1.body.data.email, "an@mail.vn");
    const d2 = await call("GET", `/order/admin/${member._id}`, { token: tokens.admin });
    assert.equal(d2.body.data.shipping_address.ward, "Phường Bách Khoa");
    assert.equal(d2.body.data.user.email, alice.email);
    assert.deepEqual(d2.body.data.next_statuses, ["shipping", "cancelled"]);
    assert.equal(d2.body.data.is_member, true);
    assert.ok(!/"password"/.test(d2.text));
    assert.equal((await call("GET", `/order/admin/${oid()}`, { token: tokens.admin })).status, 404);
    assert.equal((await call("GET", "/order/admin/abc", { token: tokens.admin })).status, 400);
});

test("trạng thái đơn: chuỗi hợp lệ, chặn nhảy cóc/quay lui/đổi trạng thái cuối; khách hàng thấy trạng thái mới", async (t) => {
    const { call, store, tokens, alice, admin } = await setup(t);
    const mine = ORDER({ user_id: alice._id, status: "pending" });
    const legacyA = ORDER();
    const legacyB = ORDER();
    store.orders.push(mine, legacyA, legacyB);
    const patch = (id, status, token = tokens.admin) => call("PATCH", `/order/admin/${id}/status`, { token, body: { status } });

    // Không hợp lệ ngay từ đầu.
    assert.equal((await patch(mine._id, "shipping")).status, 409, "pending -> shipping (nhảy cóc)");
    assert.equal((await patch(mine._id, "delivered")).status, 409);
    assert.equal((await patch(mine._id, "pending")).status, 409, "đã ở trạng thái này");
    assert.equal((await patch(mine._id, "done")).status, 400);
    assert.equal((await call("PATCH", `/order/admin/${mine._id}/status`, { token: tokens.admin, body: { status: "confirmed", totalPrice: 1 } })).status, 400, "không cho sửa trường khác");
    // Khách hàng / khách vãng lai không đổi được.
    assert.equal((await patch(mine._id, "cancelled", tokens.alice)).status, 403);
    assert.equal((await call("PATCH", `/order/admin/${mine._id}/status`, { body: { status: "cancelled" } })).status, 401);
    assert.equal(store.orders.find((o) => o._id === mine._id).status, "pending");

    // Chuỗi hợp lệ.
    for (const [to, label] of [["confirmed", "Đã xác nhận"], ["shipping", "Đang giao"], ["delivered", "Đã giao"]]) {
        const r = await patch(mine._id, to);
        assert.equal(r.status, 200, `${to}: ${r.text}`);
        assert.match(r.body.message, new RegExp(label));
    }
    const done = store.orders.find((o) => o._id === mine._id);
    assert.deepEqual(done.status_history.map((h) => [h.from, h.to, h.by]), [["pending", "confirmed", admin._id], ["confirmed", "shipping", admin._id], ["shipping", "delivered", admin._id]]);
    for (const to of ["pending", "confirmed", "shipping", "cancelled"]) {
        const r = await patch(mine._id, to);
        assert.equal(r.status, 409, `delivered -> ${to}`);
    }
    // Khách hàng thấy trạng thái mới trong "Đơn hàng của tôi".
    const my = await call("GET", "/order/my", { token: tokens.alice });
    assert.equal(my.body.data.docs[0].status, "delivered");

    // Đơn cũ không status: hủy được; sau khi hủy không đổi được nữa; đơn cũ khác không bị đụng tới.
    assert.equal((await patch(legacyA._id, "cancelled")).status, 200);
    assert.equal(store.orders.find((o) => o._id === legacyA._id).status, "cancelled");
    for (const to of ["pending", "confirmed"]) assert.equal((await patch(legacyA._id, to)).status, 409);
    const untouched = store.orders.find((o) => o._id === legacyB._id);
    assert.equal(untouched.status, undefined, "đơn demo khác không bị ghi status");
    assert.equal(untouched.status_history, undefined);
    // Đang giao thì không hủy được.
    const shipping = ORDER({ status: "shipping" });
    store.orders.push(shipping);
    assert.equal((await patch(shipping._id, "cancelled")).status, 409);
    assert.equal((await patch(oid(), "confirmed")).status, 404);
});

test("bảng chuyển trạng thái: chỉ đi tiến, hủy trước khi giao, trạng thái cuối không đi đâu", () => {
    assert.deepEqual(TRANSITIONS, {
        pending: ["confirmed", "cancelled"],
        confirmed: ["shipping", "cancelled"],
        shipping: ["delivered"],
        delivered: [],
        cancelled: [],
    });
});
