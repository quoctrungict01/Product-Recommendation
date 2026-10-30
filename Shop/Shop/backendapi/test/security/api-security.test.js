// Bảo mật API (Giai đoạn 5 – đợt 1): phân quyền guest/member/admin, token, IDOR, lộ mật khẩu,
// xử lý lỗi không làm sập Node, đặt hàng của khách, bình luận. Không cần MongoDB (dữ liệu giả trong bộ nhớ).
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { TEST_SECRET, oid, installFakeDb, makeUser, tokenFor, startServer } = require("./fake-app");

const CATEGORY = { _id: oid(), name: "Điện thoại" };
const PHONE = { _id: oid(), name: "iPhone 15 128GB", category_id: CATEGORY._id, image: "a.jpg", price: "19990000", status: "Mới", accessories: "Cáp", promotion: "0", details: "x", is_stock: true, is_featured: true };
const CASE = { _id: oid(), name: "Ốp lưng iPhone 15", category_id: CATEGORY._id, image: "b.jpg", price: "290000", status: "Mới", accessories: "-", promotion: "0", details: "x", is_stock: true, is_featured: false };
const SOLD_OUT = { _id: oid(), name: "Sạc cũ", category_id: CATEGORY._id, image: "c.jpg", price: "100000", status: "Mới", accessories: "-", promotion: "0", details: "x", is_stock: false, is_featured: false };

/** Môi trường chuẩn: 1 admin, 2 thành viên, vài sản phẩm. */
async function setup(t) {
    const store = installFakeDb(t, { products: [PHONE, CASE, SOLD_OUT], categories: [CATEGORY] });
    const admin = await makeUser(store, { email: "admin@shop.vn", role: "admin", full_name: "Quản trị" });
    const alice = await makeUser(store, { email: "alice@shop.vn", full_name: "Alice" });
    const bob = await makeUser(store, { email: "bob@shop.vn", full_name: "Bob" });
    const call = await startServer(t);
    return { store, call, admin, alice, bob, tokens: { admin: tokenFor(admin), alice: tokenFor(alice), bob: tokenFor(bob) } };
}

const noPassword = (res) => {
    assert.ok(!/"password"/.test(res.text), `response chứa trường password: ${res.text.slice(0, 200)}`);
    assert.ok(!/\$2[aby]\$/.test(res.text), "response chứa hash bcrypt");
};

test("API công khai vẫn hoạt động cho khách: sản phẩm, danh mục, bình luận, trạng thái gợi ý", async (t) => {
    const { call } = await setup(t);
    for (const path of ["/products", `/products/${PHONE._id}`, `/products/${PHONE._id}/comments`, "/categories", `/categories/${CATEGORY._id}`, `/categories/${CATEGORY._id}/products`, "/recommendations/status"]) {
        const res = await call("GET", path);
        assert.equal(res.status, 200, `${path}: ${res.text.slice(0, 120)}`);
    }
});

test("Ma trận phân quyền: route quản trị — khách 401, thành viên 403, admin được phép", async (t) => {
    const { call, tokens, bob } = await setup(t);
    const routes = [
        ["POST", "/products/create", { name: "Mới", category_id: CATEGORY._id, image: "x", price: "1", status: "s", accessories: "a", promotion: "p", details: "d" }],
        ["PUT", `/products/${CASE._id}/update`, { ...CASE, name: "Ốp lưng iPhone 15 (mới)" }],
        ["DELETE", `/products/${SOLD_OUT._id}/delete`],
        ["DELETE", `/products/${PHONE._id}/comments/${oid()}`],
        ["POST", "/categories/create", { name: "Phụ kiện" }],
        ["PUT", `/categories/update/${CATEGORY._id}`, { name: "Điện thoại di động" }],
        ["DELETE", `/categories/delete/${oid()}`],
        ["GET", "/users"],
        ["GET", `/users/${bob._id}`],
        ["POST", "/users/create", { email: "moi@shop.vn", password: "matkhau-moi-1" }],
        ["PUT", `/users/update/${bob._id}`, { full_name: "Bob 2" }],
        ["DELETE", `/users/delete/${oid()}`],
        ["GET", "/order/getAll"],
        ["GET", "/order/topProductPairs"],
    ];
    for (const [method, path, body] of routes) {
        const guest = await call(method, path, { body });
        assert.equal(guest.status, 401, `khách ${method} ${path}`);
        const member = await call(method, path, { body, token: tokens.alice });
        assert.equal(member.status, 403, `thành viên ${method} ${path}`);
        const admin = await call(method, path, { body, token: tokens.admin });
        assert.ok(![401, 403].includes(admin.status), `admin ${method} ${path} -> ${admin.status} ${admin.text.slice(0, 120)}`);
        assert.ok(admin.status < 500, `admin ${method} ${path} -> ${admin.status}`);
    }
});

test("Route thành viên: bình luận và /auth/me cần đăng nhập", async (t) => {
    const { call, tokens } = await setup(t);
    assert.equal((await call("POST", `/products/${PHONE._id}/comments`, { body: { content: "Tốt" } })).status, 401);
    assert.equal((await call("GET", "/auth/me")).status, 401);
    const me = await call("GET", "/auth/me", { token: tokens.alice });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, "alice@shop.vn");
    noPassword(me);
});

test("Token: sai chữ ký, hết hạn, sai định dạng, thuật toán none, user đã bị xóa -> 401", async (t) => {
    const { call, store, alice } = await setup(t);
    const cases = {
        "sai chữ ký": tokenFor(alice, { secret: "x".repeat(64) }),
        "hết hạn": jwt.sign({ _id: alice._id, role: "member", exp: Math.floor(Date.now() / 1000) - 60 }, TEST_SECRET),
        "alg none": `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ _id: alice._id, role: "admin" })).toString("base64url")}.`,
        "rác": "abc.def.ghi",
    };
    for (const [name, token] of Object.entries(cases)) {
        const res = await call("GET", "/auth/me", { token });
        assert.equal(res.status, 401, name);
    }
    const expired = await call("GET", "/auth/me", { token: cases["hết hạn"] });
    assert.equal(expired.body.code, "TOKEN_EXPIRED");
    const malformed = await call("GET", "/auth/me", { headers: { authorization: "Token abc" } });
    assert.equal(malformed.status, 401);
    // User bị xóa khỏi DB: token cũ (còn hạn) không dùng được nữa.
    const token = tokenFor(alice);
    store.users = store.users.filter((u) => u._id !== alice._id);
    store.users.length; // eslint
    const gone = await call("GET", "/auth/me", { token });
    assert.equal(gone.status, 401);
    assert.equal(gone.body.code, "USER_NOT_FOUND");
});

test("Không tin role trong JWT: token ghi role admin của thành viên bị 403; admin bị hạ quyền mất quyền ngay", async (t) => {
    const { call, store, alice, admin, tokens } = await setup(t);
    const forged = tokenFor(alice, { role: "admin" }); // chữ ký đúng nhưng DB nói là member
    assert.equal((await call("GET", "/users", { token: forged })).status, 403);
    assert.equal((await call("GET", "/users", { token: tokens.admin })).status, 200);
    store.users.find((u) => u._id === admin._id).role = "member"; // hạ quyền trong DB
    assert.equal((await call("GET", "/users", { token: tokens.admin })).status, 403, "token cũ còn hạn nhưng role trong DB đã là member");
});

test("IDOR và leo quyền: thành viên không sửa/xem/xóa người khác; không ai cấp được role admin qua API", async (t) => {
    const { call, store, tokens, bob, alice, admin } = await setup(t);
    const before = JSON.stringify(store.users);
    assert.equal((await call("PUT", `/users/update/${bob._id}`, { token: tokens.alice, body: { email: "hacked@x.vn", password: "matkhau-moi-1", role: "admin" } })).status, 403);
    assert.equal((await call("PUT", `/users/update/${alice._id}`, { token: tokens.alice, body: { role: "admin" } })).status, 403, "tự nâng quyền");
    assert.equal((await call("GET", `/users/${bob._id}`, { token: tokens.alice })).status, 403);
    assert.equal((await call("DELETE", `/users/delete/${bob._id}`, { token: tokens.alice })).status, 403);
    assert.equal(JSON.stringify(store.users), before, "dữ liệu không đổi");

    // Ngay cả admin cũng không tạo/nâng admin qua API (chỉ qua scripts/create-admin.js).
    const create = await call("POST", "/users/create", { token: tokens.admin, body: { email: "boss@x.vn", password: "matkhau-moi-1", role: "admin" } });
    assert.equal(create.status, 403);
    assert.equal((await call("PUT", `/users/update/${bob._id}`, { token: tokens.admin, body: { role: "admin" } })).status, 403);
    assert.equal(store.users.filter((u) => u.role === "admin").length, 1);
    // Đăng ký kèm role admin -> vẫn là member.
    const reg = await call("POST", "/auth/register", { body: { email: "mallory@x.vn", password: "matkhau-moi-1", role: "admin" } });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.data.user.role, "member");
    assert.equal(store.users.find((u) => u.email === "mallory@x.vn").role, "member");
    // Admin không tự hạ quyền / tự xóa mình.
    assert.equal((await call("PUT", `/users/update/${admin._id}`, { token: tokens.admin, body: { role: "member" } })).status, 403);
    assert.equal((await call("DELETE", `/users/delete/${admin._id}`, { token: tokens.admin })).status, 403);
    // Admin hạ quyền người khác được.
    assert.equal((await call("PUT", `/users/update/${bob._id}`, { token: tokens.admin, body: { role: "member", full_name: "Bob" } })).status, 200);
});

test("Mật khẩu luôn được băm và không bao giờ xuất hiện trong response", async (t) => {
    const { call, store, tokens, bob } = await setup(t);
    const reg = await call("POST", "/auth/register", { body: { full_name: "Chi", email: "chi@shop.vn", password: "matkhau-chi-1" } });
    noPassword(reg);
    const login = await call("POST", "/auth/login", { body: { email: "chi@shop.vn", password: "matkhau-chi-1" } });
    assert.equal(login.status, 200);
    noPassword(login);
    for (const [method, path, body] of [
        ["GET", "/users"],
        ["GET", `/users/${bob._id}`],
        ["POST", "/users/create", { email: "dung@shop.vn", password: "matkhau-dung-2" }],
        ["PUT", `/users/update/${bob._id}`, { password: "matkhau-bob-moi-2" }],
    ]) {
        const res = await call(method, path, { token: tokens.admin, body });
        assert.ok(res.status < 300, `${method} ${path} ${res.status}`);
        noPassword(res);
    }
    for (const email of ["chi@shop.vn", "dung@shop.vn", "bob@shop.vn"]) {
        assert.match(store.users.find((u) => u.email === email).password, /^\$2[aby]\$/, `${email} lưu hash bcrypt`);
    }
    assert.ok(await bcrypt.compare("matkhau-bob-moi-2", store.users.find((u) => u._id === bob._id).password));
    const del = await call("DELETE", `/users/delete/${bob._id}`, { token: tokens.admin });
    assert.equal(del.status, 200);
    noPassword(del);
});

test("Đăng ký/đăng nhập: chuẩn hóa email, kiểm tra dữ liệu, không còn đăng nhập bằng mật khẩu thô", async (t) => {
    const { call, store } = await setup(t);
    assert.equal((await call("POST", "/auth/register", { body: { email: "khong-phai-email", password: "matkhau-dai-1" } })).status, 400);
    assert.equal((await call("POST", "/auth/register", { body: { email: "a@b.vn", password: "ngan" } })).status, 400);
    assert.equal((await call("POST", "/auth/register", { body: {} })).status, 400);
    assert.equal((await call("POST", "/auth/register", { raw: "{hỏng" })).status, 400);
    const reg = await call("POST", "/auth/register", { body: { email: "  Hoa@Example.COM ", password: "matkhau-hoa-1" } });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.data.user.email, "hoa@example.com");
    assert.equal((await call("POST", "/auth/register", { body: { email: "HOA@example.com", password: "matkhau-hoa-2" } })).status, 400, "trùng email khác hoa/thường");
    assert.equal((await call("POST", "/auth/login", { body: { email: "HOA@EXAMPLE.COM ", password: "matkhau-hoa-1" } })).status, 200);
    assert.equal((await call("POST", "/auth/login", { body: { email: "hoa@example.com", password: "sai-mat-khau" } })).status, 401);
    assert.equal((await call("POST", "/auth/login", { body: { email: "hoa@example.com" } })).status, 400);
    // Dữ liệu cũ lưu mật khẩu dạng thô: không còn đăng nhập được.
    store.users.push({ _id: oid(), email: "cu@shop.vn", role: "admin", password: "matkhau-tho" });
    assert.equal((await call("POST", "/auth/login", { body: { email: "cu@shop.vn", password: "matkhau-tho" } })).status, 401);
});

test("Request sai không làm sập Node: 400/404 phù hợp, lỗi 500 không lộ chi tiết, server vẫn phục vụ", async (t) => {
    const { call, tokens } = await setup(t);
    const expectations = [
        ["POST", "/order", { body: {} }, 400],
        ["POST", "/order", { raw: "{không phải json" }, 400],
        ["POST", "/order", { body: { items: "x" } }, 400],
        ["GET", "/products/khong-phai-id", {}, 400],
        ["GET", `/products/${oid()}`, {}, 404],
        ["GET", "/products?category_id=abc", {}, 400],
        ["GET", "/categories/abc", {}, 400],
        ["GET", `/categories/${oid()}`, {}, 404],
        ["GET", "/products/abc/comments", {}, 400],
        ["POST", "/products/abc/comments", { token: tokens.alice, body: { content: "x" } }, 400],
        ["PUT", "/users/update/abc", { token: tokens.admin, body: { full_name: "x" } }, 400],
        ["DELETE", "/products/abc/delete", { token: tokens.admin }, 400],
        ["GET", "/khong-ton-tai", {}, 404],
    ];
    for (const [method, path, options, status] of expectations) {
        const res = await call(method, path, options);
        assert.equal(res.status, status, `${method} ${path}: ${res.text.slice(0, 160)}`);
        assert.equal(res.body && res.body.status, "error");
        assert.ok(!/at .*\.js:\d+/.test(res.text), "không có stack trace");
    }
    assert.equal((await call("GET", "/products")).status, 200, "server vẫn sống sau các request lỗi");
});

test("Lỗi server bất ngờ: 500 chung chung, không lộ thông điệp nội bộ hay secret", async (t) => {
    const { models } = require("./fake-app");
    const { call } = await setup(t);
    t.mock.method(models.Product, "findById", () => {
        throw new Error(`kết nối thất bại tới mongodb://user:${TEST_SECRET}@db`);
    });
    const original = console.error;
    console.error = () => {};
    try {
        const res = await call("GET", `/products/${PHONE._id}`);
        assert.equal(res.status, 500);
        assert.equal(res.body.message, "Lỗi server.");
        assert.ok(!res.text.includes(TEST_SECRET) && !res.text.includes("mongodb://"));
    } finally {
        console.error = original;
    }
    assert.equal((await call("GET", "/products")).status, 200);
});

const ORDER = { fullName: "Khách lẻ", phone: "0912345678", email: "khach@mail.vn", address: "1 Đại Cồ Việt, Hà Nội" };

test("Đặt hàng: khách không cần đăng nhập; giá và tổng tiền lấy từ DB; kiểm tra dữ liệu", async (t) => {
    const { call, store, alice } = await setup(t);
    const res = await call("POST", "/order", { body: { ...ORDER, items: [{ prd_id: PHONE._id, price: 1, qty: 1 }, { prd_id: CASE._id, price: 0, qty: 2 }] } });
    assert.equal(res.status, 201, res.text);
    const saved = store.orders.at(-1);
    assert.deepEqual(saved.items.map((i) => [String(i.prd_id), i.price, i.qty]), [[PHONE._id, 19990000, 1], [CASE._id, 290000, 2]], "giá từ DB, không từ client");
    assert.equal(saved.totalPrice, 19990000 + 2 * 290000);
    const bad = [
        [{ ...ORDER, items: [] }, "giỏ trống"],
        [{ ...ORDER, phone: "abc", items: [{ prd_id: PHONE._id, qty: 1 }] }, "số điện thoại"],
        [{ ...ORDER, email: "x", items: [{ prd_id: PHONE._id, qty: 1 }] }, "email"],
        [{ ...ORDER, items: [{ prd_id: PHONE._id, qty: 0 }] }, "số lượng 0"],
        [{ ...ORDER, items: [{ prd_id: PHONE._id, qty: -3 }] }, "số lượng âm"],
        [{ ...ORDER, items: [{ prd_id: oid(), qty: 1 }] }, "sản phẩm không tồn tại"],
        [{ ...ORDER, items: [{ prd_id: SOLD_OUT._id, qty: 1 }] }, "hết hàng"],
        [{ ...ORDER, fullName: "  ", items: [{ prd_id: PHONE._id, qty: 1 }] }, "thiếu tên"],
    ];
    const count = store.orders.length;
    for (const [body, name] of bad) assert.equal((await call("POST", "/order", { body })).status, 400, name);
    assert.equal(store.orders.length, count, "không lưu đơn lỗi");
    // Đã gửi token nhưng token hết hạn -> 401 (đợt 2: không âm thầm biến thành đơn của khách).
    const expired = jwt.sign({ _id: alice._id, role: "member", exp: Math.floor(Date.now() / 1000) - 10 }, TEST_SECRET);
    assert.equal((await call("POST", "/order", { token: expired, body: { ...ORDER, items: [{ prd_id: CASE._id, qty: 1 }] } })).status, 401);
    assert.equal(store.orders.length, count, "không tạo đơn khi token sai");
});

test("Bình luận: tên/email lấy từ tài khoản, không giả mạo được; nội dung bắt buộc; sản phẩm phải tồn tại", async (t) => {
    const { call, store, tokens } = await setup(t);
    const res = await call("POST", `/products/${PHONE._id}/comments`, { token: tokens.alice, body: { name: "Admin", email: "admin@shop.vn", content: "  Máy đẹp  " } });
    assert.equal(res.status, 201, res.text);
    const c = store.comments.at(-1);
    assert.deepEqual([c.name, c.email, c.content, String(c.product_id)], ["Alice", "alice@shop.vn", "Máy đẹp", PHONE._id]);
    // Danh sách bình luận công khai không lộ email người bình luận.
    const list = await call("GET", `/products/${PHONE._id}/comments`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.docs[0].name, "Alice");
    assert.ok(!list.text.includes("alice@shop.vn"), "không lộ email");
    assert.equal((await call("POST", `/products/${PHONE._id}/comments`, { token: tokens.alice, body: { content: "   " } })).status, 400);
    assert.equal((await call("POST", `/products/${PHONE._id}/comments`, { token: tokens.alice, body: { content: "x".repeat(1001) } })).status, 400);
    assert.equal((await call("POST", `/products/${oid()}/comments`, { token: tokens.alice, body: { content: "ok" } })).status, 404);
    // Admin xóa bình luận được; thành viên thì không.
    const id = c._id;
    assert.equal((await call("DELETE", `/products/${PHONE._id}/comments/${id}`, { token: tokens.alice })).status, 403);
    assert.equal((await call("DELETE", `/products/${PHONE._id}/comments/${id}`, { token: tokens.admin })).status, 200);
});
