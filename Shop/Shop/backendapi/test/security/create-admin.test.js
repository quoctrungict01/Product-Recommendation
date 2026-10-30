// scripts/create-admin.js: kiểm tra logic bằng collection giả (KHÔNG chạy script, không chạm MongoDB).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { parseArgs, assertLocalDatabase, validateAdminInput, createAdmin } = require("../../scripts/create-admin");

const ROOT = path.join(__dirname, "..", "..");

function fakeUsers(initial = []) {
    const docs = initial.map((d) => ({ ...d }));
    return {
        docs,
        findOne: async (filter) => docs.find((d) => d.email === filter.email) || null,
        insertOne: async (doc) => (docs.push({ _id: `id${docs.length}`, ...doc }), { acknowledged: true }),
        updateOne: async (filter, update) => {
            const d = docs.find((x) => x._id === filter._id && x.role !== "admin");
            if (!d) return { modifiedCount: 0 };
            Object.assign(d, update.$set);
            return { modifiedCount: 1 };
        },
    };
}
const hash = (p) => bcrypt.hash(p, 4);

test("create-admin: không nhận mật khẩu qua tham số; chỉ ghi vào MongoDB cục bộ", () => {
    assert.throws(() => parseArgs(["--password", "x"]), /Không nhận mật khẩu/);
    assert.throws(() => parseArgs(["--password=x"]), /Không nhận mật khẩu/);
    assert.deepEqual(parseArgs(["--email", "a@b.vn", "--promote-existing"]), { email: "a@b.vn", promoteExisting: true, help: false });
    assert.equal(assertLocalDatabase("mongodb://127.0.0.1:27017/GR2"), "GR2");
    assert.equal(assertLocalDatabase("mongodb://localhost/GR2"), "GR2");
    for (const uri of ["mongodb+srv://u:p@cluster.mongodb.net/GR2", "mongodb://10.0.0.5:27017/GR2", "mongodb://evil.com/GR2", "", undefined]) {
        assert.throws(() => assertLocalDatabase(uri), undefined, String(uri));
    }
});

test("create-admin: kiểm tra mật khẩu admin (≥ 10 ký tự, chữ và số, khớp xác nhận, không chứa tên email)", () => {
    const ok = { email: " Boss@Shop.VN ", password: "Quantri2026x", confirm: "Quantri2026x" };
    assert.equal(validateAdminInput(ok), "boss@shop.vn");
    assert.throws(() => validateAdminInput({ ...ok, password: "ngan1", confirm: "ngan1" }), /ít nhất 10/);
    assert.throws(() => validateAdminInput({ ...ok, password: "chiconchuthoi", confirm: "chiconchuthoi" }), /chữ và số/);
    assert.throws(() => validateAdminInput({ ...ok, confirm: "khac2026xyz" }), /không khớp/);
    assert.throws(() => validateAdminInput({ ...ok, password: "boss123456789", confirm: "boss123456789" }), /tên của email/);
    assert.throws(() => validateAdminInput({ ...ok, email: "sai" }), /Email/);
});

test("create-admin: tạo admin mới với mật khẩu băm; không âm thầm nâng tài khoản đã có", async () => {
    const users = fakeUsers([{ _id: "m1", email: "member@shop.vn", role: "member", password: "$2b$04$x" }]);
    const created = await createAdmin({ users, email: "boss@shop.vn", password: "Quantri2026x", fullName: "Sếp", hash });
    assert.equal(created.action, "created");
    const boss = users.docs.find((d) => d.email === "boss@shop.vn");
    assert.equal(boss.role, "admin");
    assert.ok(await bcrypt.compare("Quantri2026x", boss.password));
    assert.notEqual(boss.password, "Quantri2026x");

    // Email đã có tài khoản member: từ chối nếu không có --promote-existing.
    await assert.rejects(createAdmin({ users, email: "member@shop.vn", password: "Quantri2026x", hash }), /không tự nâng quyền/);
    assert.equal(users.docs.find((d) => d.email === "member@shop.vn").role, "member");
    // Có cờ nhưng không xác nhận: vẫn không đổi.
    await assert.rejects(createAdmin({ users, email: "member@shop.vn", promoteExisting: true, confirmPromotion: async () => false, hash }), /Chưa xác nhận/);
    assert.equal(users.docs.find((d) => d.email === "member@shop.vn").role, "member");
    // Có cờ và xác nhận: nâng quyền, giữ nguyên mật khẩu cũ.
    const promoted = await createAdmin({ users, email: "member@shop.vn", promoteExisting: true, confirmPromotion: async () => true, hash });
    assert.equal(promoted.action, "promoted");
    assert.deepEqual([users.docs[0].role, users.docs[0].password], ["admin", "$2b$04$x"]);
    // Đã là admin: không thay đổi gì.
    const again = await createAdmin({ users, email: "boss@shop.vn", password: "Quantri2026x", hash });
    assert.equal(again.action, "already-admin");
    assert.equal(users.docs.length, 2);
});

test("create-admin: không tự chạy khi khởi động backend; không có email/mật khẩu viết cứng; không log mật khẩu", () => {
    for (const f of ["src/bin/www.js", "src/apps/app.js", "src/routers/web.js", "package.json"]) {
        assert.ok(!fs.readFileSync(path.join(ROOT, f), "utf8").includes("create-admin"), `${f} không được gọi create-admin`);
    }
    const src = fs.readFileSync(path.join(ROOT, "scripts/create-admin.js"), "utf8");
    assert.ok(!/(email|password)\s*[:=]\s*["'][^"'\s]+@[^"']+["']/.test(src), "không viết cứng email");
    assert.ok(!/console\.(log|error)\([^)]*password/i.test(src), "không log mật khẩu");
});
