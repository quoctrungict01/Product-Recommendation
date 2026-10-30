// Đợt 6B: admin quản lý bình luận và thành viên. Dữ liệu giả trong bộ nhớ, không chạm MongoDB.
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { oid, installFakeDb, makeUser, tokenFor, startServer } = require("../security/fake-app");

const PHONE = { _id: oid(), name: "iPhone 15 128GB", category_id: oid(), image: "a.jpg", price: "19990000", promotion: "0", is_stock: true };
const CASE = { _id: oid(), name: "Ốp lưng iPhone 15", category_id: oid(), image: "b.jpg", price: "290000", promotion: "0", is_stock: true };
const at = (d) => new Date(Date.UTC(2026, 9, d)).toISOString();
const COMMENTS = [
    { _id: oid(), name: "Nguyễn Văn An", email: "an@khach.vn", content: "Máy chạy rất mượt", product_id: PHONE._id, createdAt: at(5) },
    { _id: oid(), name: "Trần Thị Bình", email: "binh@khach.vn", content: "Ốp lưng đẹp, giao nhanh", product_id: CASE._id, createdAt: at(4) },
    { _id: oid(), name: "Lê Cường", email: "cuong@khach.vn", content: "Sản phẩm đã ngừng bán", product_id: oid(), createdAt: at(3) }, // sản phẩm đã bị xóa
    { _id: oid(), name: "", email: "cu@khach.vn", content: "Bình luận cũ", product_id: "khong-phai-id", createdAt: at(2) }, // dữ liệu cũ
];

async function setup(t, extra = {}) {
    const store = installFakeDb(t, { products: [PHONE, CASE], comments: COMMENTS, ...extra });
    const admin = await makeUser(store, { email: "admin@shop.vn", role: "admin", full_name: "Quản trị" });
    const alice = await makeUser(store, { email: "alice@shop.vn", full_name: "Nguyễn Thị Ánh" });
    const bob = await makeUser(store, { email: "bob@shop.vn", full_name: "Bob" });
    store.users.find((u) => u._id === bob._id).phone = "0912345678";
    const call = await startServer(t);
    return { store, call, admin, alice, bob, tokens: { admin: tokenFor(admin), alice: tokenFor(alice), bob: tokenFor(bob) } };
}

const noSecrets = (res) => {
    assert.ok(!/"password"/.test(res.text), "không có trường password");
    assert.ok(!/\$2[aby]\$/.test(res.text), "không có hash bcrypt");
};

test("Bình luận (admin): khách 401, thành viên 403", async (t) => {
    const { call, tokens } = await setup(t);
    for (const [method, path] of [["GET", "/comments/admin"], ["DELETE", `/comments/admin/${COMMENTS[0]._id}`]]) {
        assert.equal((await call(method, path)).status, 401, `khách ${method} ${path}`);
        assert.equal((await call(method, path, { token: tokens.alice })).status, 403, `thành viên ${method} ${path}`);
    }
});

test("Bình luận (admin): danh sách mới nhất trước, kèm sản phẩm, không có email; sản phẩm đã xóa / dữ liệu cũ vẫn hiện", async (t) => {
    const { call, tokens } = await setup(t);
    const res = await call("GET", "/comments/admin", { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(!/@khach\.vn/.test(res.text), "không lộ email người bình luận");
    assert.ok(!/"email"/.test(res.text));
    const { docs, total, totalPages } = res.body.data;
    assert.equal(total, 4);
    assert.equal(totalPages, 1);
    assert.deepEqual(docs.map((d) => d.content), ["Máy chạy rất mượt", "Ốp lưng đẹp, giao nhanh", "Sản phẩm đã ngừng bán", "Bình luận cũ"]);
    assert.deepEqual(docs[0].product, { _id: PHONE._id, name: PHONE.name, image: "a.jpg" });
    assert.equal(docs[0].product_missing, false);
    assert.equal(docs[2].product, null);
    assert.equal(docs[2].product_missing, true);
    assert.equal(docs[3].product_id, "khong-phai-id");
    assert.equal(docs[3].product_missing, true);
    assert.equal(docs[3].name, "(không rõ tên)");
});

test("Bình luận (admin): tìm không dấu theo tên/nội dung, lọc theo sản phẩm, phân trang, chặn tham số lạ", async (t) => {
    const { call, tokens } = await setup(t);
    const get = (qs) => call("GET", `/comments/admin${qs}`, { token: tokens.admin });
    assert.deepEqual((await get("?q=op lung")).body.data.docs.map((d) => d.name), ["Trần Thị Bình"]);
    assert.deepEqual((await get("?q=" + encodeURIComponent("nguyen an"))).body.data.docs.map((d) => d.name), ["Nguyễn Văn An"]);
    assert.equal((await get("?q=.*")).body.data.total, 0, "ký tự đặc biệt không phải regex");
    assert.deepEqual((await get(`?product_id=${CASE._id}`)).body.data.docs.map((d) => d.name), ["Trần Thị Bình"]);
    const p2 = await get("?page=2&limit=3");
    assert.equal(p2.body.data.totalPages, 2);
    assert.deepEqual(p2.body.data.docs.map((d) => d.content), ["Bình luận cũ"]);
    assert.equal((await get("?q[$ne]=x")).status, 400);
    assert.equal((await get("?product_id=abc")).status, 400);
    assert.equal((await get(`?q=${"a".repeat(101)}`)).status, 400);
});

test("Bình luận (admin): xóa -> 200 chỉ trả mã; xóa lại -> 404; mã sai -> 400", async (t) => {
    const { call, store, tokens } = await setup(t);
    const id = COMMENTS[1]._id;
    const res = await call("DELETE", `/comments/admin/${id}`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { _id: id });
    assert.equal(res.body.message, "Đã xóa bình luận.");
    assert.equal(store.comments.length, 3);
    assert.equal((await call("DELETE", `/comments/admin/${id}`, { token: tokens.admin })).status, 404);
    assert.equal((await call("DELETE", "/comments/admin/xyz", { token: tokens.admin })).status, 400);
    // Route xóa cũ theo sản phẩm cũng không còn trả email.
    const old = await call("DELETE", `/products/${PHONE._id}/comments/${COMMENTS[0]._id}`, { token: tokens.admin });
    assert.equal(old.status, 200);
    assert.ok(!/an@khach\.vn/.test(old.text));
});

test("Thành viên (admin): tìm theo tên không dấu / email / SĐT, lọc vai trò, tổng số trang; không lộ mật khẩu", async (t) => {
    const { call, tokens } = await setup(t);
    const get = (qs) => call("GET", `/users${qs}`, { token: tokens.admin });
    const all = await get("");
    noSecrets(all);
    assert.equal(all.body.data.total, 3);
    assert.equal(all.body.pages.totalRows, 3, "giữ định dạng cũ");
    assert.deepEqual((await get("?q=" + encodeURIComponent("nguyen thi anh"))).body.data.docs.map((u) => u.email), ["alice@shop.vn"]);
    assert.deepEqual((await get("?q=BOB@SHOP")).body.data.docs.map((u) => u.email), ["bob@shop.vn"]);
    assert.deepEqual((await get("?q=0912.345")).body.data.docs.map((u) => u.email), ["bob@shop.vn"]);
    assert.deepEqual((await get("?role=admin")).body.data.docs.map((u) => u.email), ["admin@shop.vn"]);
    const page = await get("?limit=2&page=2");
    assert.equal(page.body.data.totalPages, 2);
    assert.equal(page.body.data.docs.length, 1);
    assert.equal((await get("?role=boss")).status, 400);
    assert.equal((await get("?q[$regex]=.")).status, 400);
});

test("Thành viên (admin): tạo luôn là member + bcrypt; sửa tên/SĐT; đặt lại mật khẩu thu hồi token cũ", async (t) => {
    const { call, store, tokens, bob } = await setup(t);
    const created = await call("POST", "/users/create", { token: tokens.admin, body: { email: " Moi@Shop.vn ", password: "matkhau-moi-1", full_name: "Người mới" } });
    assert.equal(created.status, 201);
    noSecrets(created);
    assert.equal(created.body.data.role, "member");
    const saved = store.users.find((u) => u.email === "moi@shop.vn");
    assert.ok(/^\$2[aby]\$/.test(saved.password) && (await bcrypt.compare("matkhau-moi-1", saved.password)));
    assert.equal((await call("POST", "/users/create", { token: tokens.admin, body: { email: "x@shop.vn", password: "matkhau-moi-1", role: "admin" } })).status, 403);
    assert.equal((await call("POST", "/users/create", { token: tokens.admin, body: { email: "bob@shop.vn", password: "matkhau-moi-1" } })).status, 409);

    const upd = await call("PUT", `/users/update/${bob._id}`, { token: tokens.admin, body: { full_name: "Bob Mới", phone: "0987 654 321" } });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.phone, "0987654321");
    assert.equal((await call("PUT", `/users/update/${bob._id}`, { token: tokens.admin, body: { phone: "123" } })).status, 400);
    // Token cũ của Bob còn dùng được trước khi đặt lại mật khẩu.
    assert.equal((await call("GET", "/auth/me", { token: tokens.bob })).status, 200);
    await new Promise((r) => setTimeout(r, 1100)); // iat tính theo giây
    const reset = await call("PUT", `/users/update/${bob._id}`, { token: tokens.admin, body: { password: "matkhau-moi-2" } });
    assert.equal(reset.status, 200);
    noSecrets(reset);
    assert.equal((await call("GET", "/auth/me", { token: tokens.bob })).status, 401, "token cũ bị thu hồi");
    assert.ok(await bcrypt.compare("matkhau-moi-2", store.users.find((u) => u._id === bob._id).password));
});

test("Thành viên (admin): không xóa được admin (kể cả chính mình), không tự hạ quyền; xóa member được", async (t) => {
    const { call, store, tokens, admin, bob } = await setup(t);
    const admin2 = await makeUser(store, { email: "admin2@shop.vn", role: "admin" });
    assert.equal((await call("DELETE", `/users/delete/${admin._id}`, { token: tokens.admin })).status, 403);
    const other = await call("DELETE", `/users/delete/${admin2._id}`, { token: tokens.admin });
    assert.equal(other.status, 403);
    assert.match(other.body.message, /hạ quyền/);
    assert.equal((await call("PUT", `/users/update/${admin._id}`, { token: tokens.admin, body: { role: "member" } })).status, 403);
    assert.equal(store.users.filter((u) => u.role === "admin").length, 2);
    const del = await call("DELETE", `/users/delete/${bob._id}`, { token: tokens.admin });
    assert.equal(del.status, 200);
    noSecrets(del);
    assert.equal((await call("DELETE", `/users/delete/${bob._id}`, { token: tokens.admin })).status, 404);
});
