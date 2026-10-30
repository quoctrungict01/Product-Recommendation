// Giai đoạn 5 – đợt 2: hồ sơ cá nhân, địa chỉ mặc định, đổi mật khẩu, đơn hàng gắn tài khoản, lịch sử đơn.
// Chạy trên app Express thật với dữ liệu giả trong bộ nhớ — không đọc/ghi MongoDB GR2.
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { TEST_SECRET, oid, installFakeDb, makeUser, tokenFor, startServer } = require("./fake-app");

const PHONE = { _id: oid(), name: "iPhone 15 128GB", image: "a.jpg", price: "19990000", is_stock: true };
const CASE = { _id: oid(), name: "Ốp lưng iPhone 15", image: "b.jpg", price: "290000", is_stock: true };
const ADDRESS = { province: "Thành phố Hà Nội", province_code: 1, ward: "Phường Bách Khoa", ward_code: 9999, detail: "Số 1 Đại Cồ Việt" };

async function setup(t, seed = {}) {
    const store = installFakeDb(t, { products: [PHONE, CASE], ...seed });
    const admin = await makeUser(store, { email: "admin@shop.vn", role: "admin", full_name: "Quản trị" });
    const alice = await makeUser(store, { email: "alice@shop.vn", full_name: "Alice", password: "alice-matkhau-1" });
    const bob = await makeUser(store, { email: "bob@shop.vn", full_name: "Bob" });
    const call = await startServer(t);
    return { store, call, admin, alice, bob, tokens: { admin: tokenFor(admin), alice: tokenFor(alice), bob: tokenFor(bob) } };
}

const noSecret = (res) => {
    assert.ok(!/"password"/.test(res.text), `response chứa password: ${res.text.slice(0, 200)}`);
    assert.ok(!/\$2[aby]\$/.test(res.text), "response chứa hash bcrypt");
    assert.ok(!/password_changed_at/.test(res.text), "response chứa password_changed_at");
};
const find = (store, id) => store.users.find((u) => u._id === id);

test("GET/PUT /auth/me: xem và sửa hồ sơ + địa chỉ mặc định của chính mình; dữ liệu được kiểm tra", async (t) => {
    const { call, store, alice, tokens } = await setup(t);
    const me = await call("GET", "/auth/me", { token: tokens.alice });
    assert.equal(me.status, 200);
    assert.deepEqual([me.body.data.user.email, me.body.data.user.phone, me.body.data.user.address], ["alice@shop.vn", null, null]);
    noSecret(me);

    const res = await call("PUT", "/auth/me", { token: tokens.alice, body: { full_name: "  Alice Nguyễn ", phone: "0912 345 678", address: ADDRESS } });
    assert.equal(res.status, 200, res.text);
    noSecret(res);
    assert.equal(res.body.data.user.full_name, "Alice Nguyễn");
    assert.equal(res.body.data.user.phone, "0912345678");
    assert.deepEqual(res.body.data.user.address, { ...ADDRESS, district: null });
    assert.equal(find(store, alice._id).phone, "0912345678");
    // Lần GET sau thấy dữ liệu mới.
    assert.equal((await call("GET", "/auth/me", { token: tokens.alice })).body.data.user.address.ward, "Phường Bách Khoa");
    // Địa chỉ cũ còn quận/huyện vẫn lưu được (tùy chọn).
    const legacy = await call("PUT", "/auth/me", { token: tokens.alice, body: { address: { ...ADDRESS, district: "Quận Hai Bà Trưng" } } });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.data.user.address.district, "Quận Hai Bà Trưng");

    for (const [body, name] of [
        [{ phone: "123" }, "số điện thoại sai"],
        [{ address: { ...ADDRESS, ward: "" } }, "thiếu phường/xã"],
        [{ address: { ...ADDRESS, detail: "x".repeat(201) } }, "địa chỉ chi tiết quá dài"],
        [{ address: { ...ADDRESS, province_code: "abc" } }, "mã tỉnh sai"],
        [{ address: { ...ADDRESS, hacker: 1 } }, "trường lạ trong địa chỉ"],
        [{ address: "Hà Nội" }, "địa chỉ không phải object"],
        [{ full_name: "x".repeat(101) }, "tên quá dài"],
    ]) {
        assert.equal((await call("PUT", "/auth/me", { token: tokens.alice, body })).status, 400, name);
    }
    // Xóa số điện thoại / địa chỉ.
    const cleared = await call("PUT", "/auth/me", { token: tokens.alice, body: { phone: "", address: null } });
    assert.equal(cleared.status, 200);
    assert.deepEqual([cleared.body.data.user.phone, cleared.body.data.user.address], [null, null]);
    // Chưa đăng nhập / token sai.
    assert.equal((await call("PUT", "/auth/me", { body: { full_name: "X" } })).status, 401);
    assert.equal((await call("PUT", "/auth/me", { token: "sai.token.roi", body: { full_name: "X" } })).status, 401);
});

test("PUT /auth/me: không tự đổi được role/password/_id và không sửa được hồ sơ người khác", async (t) => {
    const { call, store, alice, bob, tokens } = await setup(t);
    const before = { alice: { ...find(store, alice._id) }, bob: { ...find(store, bob._id) } };
    for (const body of [
        { role: "admin" },
        { full_name: "Alice", role: "admin" },
        { password: "matkhau-moi-99" },
        { _id: bob._id, full_name: "Bob bị sửa" },
        { user_id: bob._id, full_name: "Bob bị sửa" },
        { password_changed_at: null },
        { createdAt: "2000-01-01" },
    ]) {
        const res = await call("PUT", "/auth/me", { token: tokens.alice, body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.code, "FIELD_NOT_ALLOWED");
    }
    assert.deepEqual(find(store, alice._id), before.alice, "hồ sơ Alice không đổi");
    assert.deepEqual(find(store, bob._id), before.bob, "hồ sơ Bob không đổi");
    // Role trong token bị giả mạo cũng không có tác dụng: vẫn là member.
    const forged = tokenFor(alice, { role: "admin" });
    assert.equal((await call("GET", "/auth/me", { token: forged })).body.data.user.role, "member");
    // Sửa hợp lệ chỉ chạm vào tài khoản trong token.
    assert.equal((await call("PUT", "/auth/me", { token: tokens.bob, body: { full_name: "Bob mới" } })).status, 200);
    assert.equal(find(store, bob._id).full_name, "Bob mới");
    assert.equal(find(store, alice._id).full_name, "Alice");
    // Đường quản trị vẫn cấm thành viên.
    assert.equal((await call("PUT", `/users/update/${bob._id}`, { token: tokens.alice, body: { full_name: "x" } })).status, 403);
});

test("Đổi email: cần mật khẩu hiện tại, chuẩn hóa và không trùng tài khoản khác", async (t) => {
    const { call, store, alice, tokens } = await setup(t);
    assert.equal((await call("PUT", "/auth/me", { token: tokens.alice, body: { email: "alice2@shop.vn" } })).status, 400, "thiếu mật khẩu");
    assert.equal((await call("PUT", "/auth/me", { token: tokens.alice, body: { email: "alice2@shop.vn", current_password: "sai-mat-khau-1" } })).status, 400, "sai mật khẩu");
    const dup = await call("PUT", "/auth/me", { token: tokens.alice, body: { email: "  BOB@Shop.VN ", current_password: "alice-matkhau-1" } });
    assert.equal(dup.status, 409, "trùng email (khác hoa/thường)");
    assert.equal((await call("PUT", "/auth/me", { token: tokens.alice, body: { email: "khong-phai-email", current_password: "alice-matkhau-1" } })).status, 400);
    assert.equal(find(store, alice._id).email, "alice@shop.vn");
    // Giữ nguyên email cũ (khác hoa/thường) không cần mật khẩu.
    assert.equal((await call("PUT", "/auth/me", { token: tokens.alice, body: { email: "ALICE@shop.vn" } })).status, 200);

    const ok = await call("PUT", "/auth/me", { token: tokens.alice, body: { email: " Alice.New@Shop.VN", current_password: "alice-matkhau-1" } });
    assert.equal(ok.status, 200, ok.text);
    noSecret(ok);
    assert.equal(ok.body.data.user.email, "alice.new@shop.vn");
    assert.ok(ok.body.data.token, "trả token mới");
    assert.equal((await call("POST", "/auth/login", { body: { email: "alice.new@shop.vn", password: "alice-matkhau-1" } })).status, 200);
    assert.equal((await call("POST", "/auth/login", { body: { email: "alice@shop.vn", password: "alice-matkhau-1" } })).status, 401);
});

test("PUT /auth/me/password: sai mật khẩu hiện tại, mật khẩu yếu; đổi xong token cũ bị vô hiệu", async (t) => {
    const { call, store, alice } = await setup(t);
    // Token cũ phát hành trước khi đổi mật khẩu (iat lùi 1 phút).
    const oldToken = jwt.sign({ _id: alice._id, role: "member", iat: Math.floor(Date.now() / 1000) - 60 }, TEST_SECRET, { expiresIn: "1h" });
    const hashBefore = find(store, alice._id).password;

    const wrong = await call("PUT", "/auth/me/password", { token: oldToken, body: { current_password: "sai-mat-khau-1", new_password: "matkhau-moi-99" } });
    assert.equal(wrong.status, 400, "sai mật khẩu hiện tại -> 400, không phải 401");
    assert.equal(wrong.body.code, "WRONG_PASSWORD");
    assert.equal(find(store, alice._id).password, hashBefore);
    for (const [new_password, name] of [
        ["ngan1", "quá ngắn"],
        ["chicochuthoi", "không có số"],
        ["1234567890", "không có chữ"],
        ["x1".repeat(70), "quá dài"],
        ["alice-matkhau-1", "trùng mật khẩu cũ"],
    ]) {
        assert.equal((await call("PUT", "/auth/me/password", { token: oldToken, body: { current_password: "alice-matkhau-1", new_password } })).status, 400, name);
    }
    assert.equal((await call("PUT", "/auth/me/password", { token: oldToken, body: { new_password: "matkhau-moi-99" } })).status, 400, "thiếu mật khẩu hiện tại");
    assert.equal((await call("PUT", "/auth/me/password", { token: oldToken, body: { current_password: "alice-matkhau-1", new_password: "matkhau-moi-99", role: "admin" } })).status, 400, "trường lạ");
    assert.equal((await call("PUT", "/auth/me/password", { body: { current_password: "alice-matkhau-1", new_password: "matkhau-moi-99" } })).status, 401, "chưa đăng nhập");

    const ok = await call("PUT", "/auth/me/password", { token: oldToken, body: { current_password: "alice-matkhau-1", new_password: "matkhau-moi-99" } });
    assert.equal(ok.status, 200, ok.text);
    noSecret(ok);
    const saved = find(store, alice._id);
    assert.match(saved.password, /^\$2[aby]\$/);
    assert.ok(await bcrypt.compare("matkhau-moi-99", saved.password));
    assert.equal(find(store, alice._id).role, "member");
    // Token cũ bị từ chối; token mới trong response dùng được.
    const revoked = await call("GET", "/auth/me", { token: oldToken });
    assert.equal(revoked.status, 401);
    assert.equal(revoked.body.code, "TOKEN_REVOKED");
    assert.equal((await call("GET", "/auth/me", { token: ok.body.data.token })).status, 200);
    assert.equal((await call("POST", "/auth/login", { body: { email: "alice@shop.vn", password: "alice-matkhau-1" } })).status, 401);
    assert.equal((await call("POST", "/auth/login", { body: { email: "alice@shop.vn", password: "matkhau-moi-99" } })).status, 200);
});

const ORDER = { fullName: "Người nhận", phone: "0912345678", email: "nhan@mail.vn", items: [{ prd_id: PHONE._id, price: 1, qty: 1 }] };

test("Đặt hàng: khách -> user_id null; thành viên -> user_id từ token; không giả mạo được user_id; token sai -> 401", async (t) => {
    const { call, store, alice, bob, tokens } = await setup(t);
    const guest = await call("POST", "/order", { body: { ...ORDER, address: "1 Đại Cồ Việt, Hà Nội", user_id: bob._id } });
    assert.equal(guest.status, 201, guest.text);
    assert.equal(store.orders.at(-1).user_id, null, "khách gửi user_id cũng bị bỏ qua");
    assert.equal(store.orders.at(-1).items[0].price, 19990000, "giá từ DB");

    const member = await call("POST", "/order", { token: tokens.alice, body: { ...ORDER, shipping_address: ADDRESS, user_id: bob._id } });
    assert.equal(member.status, 201, member.text);
    assert.equal(member.body.data._id, store.orders.at(-1)._id);
    const saved = store.orders.at(-1);
    assert.equal(String(saved.user_id), alice._id, "user_id lấy từ token, không phải từ body");
    assert.equal(saved.items[0].price, 19990000);
    assert.equal(saved.status, "pending");
    assert.deepEqual(saved.shipping_address, { ...ADDRESS, district: null });
    assert.equal(saved.address, "Số 1 Đại Cồ Việt, Phường Bách Khoa, Thành phố Hà Nội", "vẫn lưu address dạng chuỗi cho trang quản trị");
    // Đặt hàng không đổi địa chỉ mặc định của hồ sơ.
    assert.equal(find(store, alice._id).address, undefined);

    const count = store.orders.length;
    const expired = jwt.sign({ _id: alice._id, exp: Math.floor(Date.now() / 1000) - 5 }, TEST_SECRET);
    for (const [token, name] of [
        ["khong-phai-jwt", "token rác"],
        [tokenFor(alice, { secret: "khoa-sai-".repeat(5) }), "sai chữ ký"],
        [expired, "hết hạn"],
        [tokenFor({ _id: oid(), role: "member" }), "tài khoản không tồn tại"],
    ]) {
        const res = await call("POST", "/order", { token, body: { ...ORDER, address: "x" } });
        assert.equal(res.status, 401, name);
    }
    assert.equal((await call("POST", "/order", { headers: { authorization: "Basic abc" }, body: { ...ORDER, address: "x" } })).status, 401, "header sai định dạng");
    assert.equal(store.orders.length, count, "không tạo đơn khách khi token sai");

    for (const [body, name] of [
        [{ ...ORDER, shipping_address: { ...ADDRESS, province: "" } }, "thiếu tỉnh"],
        [{ ...ORDER, shipping_address: { ...ADDRESS, detail: "  " } }, "thiếu địa chỉ chi tiết"],
        [{ ...ORDER }, "thiếu địa chỉ"],
    ]) {
        assert.equal((await call("POST", "/order", { token: tokens.alice, body })).status, 400, name);
    }
    assert.equal(store.orders.length, count);
});

test("GET /order/my: chỉ đơn của chính mình, mới nhất trước, có phân trang; đơn demo không user_id không bị gán", async (t) => {
    const day = (d) => new Date(Date.UTC(2026, 0, d)).toISOString();
    const item = (p, qty = 1) => ({ _id: oid(), prd_id: p._id, price: Number(p.price), qty });
    // Đơn demo cũ: không user_id, không status, không shipping_address.
    const demo = Array.from({ length: 5 }, (_, i) => ({ _id: oid(), fullName: "Demo", phone: "0900000000", email: "demo@x.vn", address: "HN", totalPrice: 290000, items: [item(CASE)], createdAt: day(i + 1) }));
    const store0 = { orders: demo };
    const { call, store, alice, bob, tokens } = await setup(t, store0);
    const mk = (user, d, extra = {}) => ({ _id: oid(), user_id: user._id, fullName: user.full_name, phone: "0912345678", email: user.email, address: "HN", totalPrice: 19990000, items: [item(PHONE)], createdAt: day(d), ...extra });
    store.orders.push(mk(alice, 10, { status: "delivered" }), mk(bob, 11), mk(alice, 12), mk(alice, 8, { items: [{ _id: oid(), prd_id: oid(), price: 5, qty: 2 }] }));

    const res = await call("GET", "/order/my", { token: tokens.alice });
    assert.equal(res.status, 200, res.text);
    const { docs, total, page, pages } = res.body.data;
    assert.equal(total, 3);
    assert.deepEqual([page, pages], [1, 1]);
    assert.deepEqual(docs.map((d) => d.createdAt), [day(12), day(10), day(8)], "mới nhất trước");
    assert.deepEqual(docs.map((d) => d.status), ["pending", "delivered", "pending"], "đơn không có status -> pending");
    assert.equal(docs[0].items[0].name, PHONE.name);
    assert.equal(docs[2].items[0].name, "Sản phẩm không còn bán");
    assert.ok(!res.text.includes(bob.email) && !res.text.includes("demo@x.vn"), "không có đơn của người khác");
    assert.ok(!/user_id/.test(res.text));

    // Truyền user_id của người khác qua query bị bỏ qua.
    const spoof = await call("GET", `/order/my?user_id=${bob._id}`, { token: tokens.alice });
    assert.equal(spoof.body.data.total, 3);
    assert.ok(!spoof.text.includes(bob.email));
    assert.equal((await call("GET", "/order/my", { token: tokens.bob })).body.data.total, 1);

    // Phân trang.
    const p2 = await call("GET", "/order/my?page=2&limit=2", { token: tokens.alice });
    assert.deepEqual([p2.body.data.docs.length, p2.body.data.pages, p2.body.data.docs[0].createdAt], [1, 2, day(8)]);
    assert.equal((await call("GET", "/order/my?limit=1000", { token: tokens.alice })).body.data.limit, 20, "giới hạn limit");
    assert.equal((await call("GET", "/order/my?page=abc&limit=-5", { token: tokens.alice })).status, 200);

    // Tài khoản mới đăng ký: không thấy đơn demo nào.
    const reg = await call("POST", "/auth/register", { body: { email: "demo@x.vn", password: "matkhau-moi-1" } });
    assert.equal(reg.status, 201);
    const fresh = await call("GET", "/order/my", { token: reg.body.data.token });
    assert.deepEqual([fresh.body.data.total, fresh.body.data.docs.length], [0, 0], "đơn demo trùng email cũng không tự gán");
    assert.equal(store.orders.filter((o) => !o.user_id).length, 5, "đơn demo không bị sửa");

    // Khách / token sai.
    assert.equal((await call("GET", "/order/my")).status, 401);
    assert.equal((await call("GET", "/order/my", { token: "abc.def.ghi" })).status, 401);
});

test("Tương thích dữ liệu cũ: admin vẫn xem được đơn demo; user cũ không có phone/address vẫn đăng nhập", async (t) => {
    const legacyOrder = { _id: oid(), fullName: "Demo", phone: "0900000000", email: "demo@x.vn", address: "HN", totalPrice: 290000, items: [{ _id: oid(), prd_id: CASE._id, price: 290000, qty: 1 }], createdAt: new Date().toISOString() };
    const { call, store, tokens } = await setup(t, { orders: [legacyOrder] });
    const all = await call("GET", "/order/getAll", { token: tokens.admin });
    assert.equal(all.status, 200, all.text);
    assert.equal(all.body.data.length, 1);
    // Tài khoản kiểu cũ (chỉ có email/password/role).
    store.users.push({ _id: oid(), email: "cu@shop.vn", role: "member", password: await bcrypt.hash("matkhau-cu-1", 4) });
    const login = await call("POST", "/auth/login", { body: { email: "cu@shop.vn", password: "matkhau-cu-1" } });
    assert.equal(login.status, 200);
    assert.deepEqual([login.body.data.user.phone, login.body.data.user.address], [null, null]);
    noSecret(login);
});
