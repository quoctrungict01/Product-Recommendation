// Kiểm tra cấu hình bí mật: không có mật khẩu/secret mặc định, báo lỗi rõ ràng khi thiếu biến,
// xác thực và email vẫn hoạt động. Không cần MongoDB, không gửi email thật.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const ROOT = path.join(__dirname, "..", "..");
const { validateEnv, assertEnv, buildMailConfig, EnvError, JWT_SECRET_MIN_LENGTH } = require("../../config/env");
const { getJwtSecret, signAuthToken } = require("../../src/libs/jwt");
const { getMailTransporter } = require("../../src/libs/mail");

const GOOD_SECRET = crypto.randomBytes(32).toString("hex"); // 64 ký tự, chỉ dùng trong test
const base = { DB_URI: "mongodb://127.0.0.1:27017/GR2", JWT_SECRET: GOOD_SECRET };

// ---------------------------------------------------------------- validateEnv
test("validateEnv: cấu hình hợp lệ; email trống chỉ là cảnh báo", () => {
    assert.deepEqual(validateEnv(base), { errors: [], warnings: ["MAIL_USER/MAIL_PASS trống: chức năng gửi email bị tắt."] });
    assert.deepEqual(validateEnv({ ...base, MAIL_USER: "shop@example.com", MAIL_PASS: "app-password", MAIL_PORT: "465" }), { errors: [], warnings: [] });
});

test("validateEnv: thiếu hoặc sai biến bắt buộc thì báo lỗi theo tên, không in giá trị", () => {
    const cases = [
        [{}, ["DB_URI", "JWT_SECRET"]],
        [{ ...base, JWT_SECRET: "" }, ["Thiếu JWT_SECRET"]],
        [{ ...base, JWT_SECRET: "short-secret" }, [`ít nhất ${JWT_SECRET_MIN_LENGTH}`]],
        [{ ...base, JWT_SECRET: "replace_with_random_secret_at_least_32_chars" }, ["giá trị mẫu"]],
        [{ ...base, MAIL_USER: "shop@example.com" }, ["thiếu MAIL_PASS"]],
        [{ ...base, MAIL_PASS: "app-password-value" }, ["thiếu MAIL_USER"]],
        [{ ...base, MAIL_PORT: "abc" }, ["MAIL_PORT"]],
    ];
    for (const [env, expected] of cases) {
        const { errors } = validateEnv(env);
        const text = errors.join(" | ");
        for (const e of expected) assert.ok(text.includes(e), `${JSON.stringify(Object.keys(env))}: ${text}`);
        for (const value of Object.values(env)) if (String(value).length > 6) assert.ok(!text.includes(value), "không được in giá trị");
    }
    assert.throws(() => assertEnv({}), EnvError);
    assert.throws(() => assertEnv({}), /\.env\.example/);
});

// ---------------------------------------------------------------- email
test("buildMailConfig: không có tài khoản/mật khẩu mặc định; enabled chỉ khi có đủ MAIL_USER và MAIL_PASS", () => {
    assert.deepEqual(buildMailConfig({}), { host: "smtp.gmail.com", port: 587, user: null, pass: null, enabled: false });
    assert.equal(buildMailConfig({ MAIL_USER: "a@example.com" }).enabled, false);
    const full = buildMailConfig({ MAIL_HOST: "smtp.example.com", MAIL_PORT: "465", MAIL_USER: "a@example.com", MAIL_PASS: "x" });
    assert.deepEqual(full, { host: "smtp.example.com", port: 465, user: "a@example.com", pass: "x", enabled: true });
});

test("getMailTransporter: báo lỗi rõ ràng khi chưa cấu hình; tạo transporter khi đủ biến (không gửi mail)", () => {
    assert.throws(() => getMailTransporter(buildMailConfig({})), (e) => e instanceof EnvError && /MAIL_USER và MAIL_PASS/.test(e.message));
    const config = buildMailConfig({ MAIL_USER: "shop@example.com", MAIL_PASS: "test-only" });
    const transporter = getMailTransporter(config);
    assert.equal(typeof transporter.sendMail, "function");
    assert.equal(transporter.options.auth.user, "shop@example.com");
    assert.equal(getMailTransporter(config), transporter, "dùng lại transporter đã tạo");
});

// ---------------------------------------------------------------- JWT
test("signAuthToken: ký bằng JWT_SECRET từ môi trường; thiếu/yếu thì từ chối, không dùng khóa mặc định", () => {
    const user = { _id: "u1", email: "a@example.com", role: "member" };
    const token = signAuthToken(user, { JWT_SECRET: GOOD_SECRET });
    const payload = jwt.verify(token, GOOD_SECRET);
    assert.deepEqual([payload._id, payload.email, payload.role], ["u1", "a@example.com", "member"]);
    assert.ok(payload.exp - payload.iat === 7 * 24 * 3600);
    assert.throws(() => jwt.verify(token, "another-secret-another-secret-another"), /invalid signature/);

    for (const env of [{}, { JWT_SECRET: "" }, { JWT_SECRET: "too-short" }]) {
        assert.throws(() => signAuthToken(user, env), EnvError);
        assert.throws(() => getJwtSecret(env), EnvError);
    }
});

test("Mã nguồn không còn mật khẩu hay secret mặc định viết cứng", () => {
    const files = ["config/mail.js", "config/env.js", "src/libs/jwt.js", "src/libs/mail.js", "src/apps/controllers/apis/auth.js", "src/bin/www.js"];
    for (const f of files) {
        const src = fs.readFileSync(path.join(ROOT, f), "utf8");
        assert.ok(!/(MAIL_PASS|MAIL_USER|JWT_SECRET)\s*\|\|\s*["'`]/.test(src), `${f}: còn giá trị mặc định cho biến bí mật`);
        assert.ok(!/jwt\.sign\([^)]*["'`][^"'`]{8,}["'`]\s*,\s*\{/.test(src), `${f}: còn secret dạng chuỗi trong jwt.sign`);
    }
    const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    assert.match(example, /^JWT_SECRET=replace_with_/m);
    assert.match(example, /^MAIL_PASS=$/m);
    assert.match(example, /^MAIL_USER=$/m);
    assert.deepEqual(validateEnv({ DB_URI: "x", JWT_SECRET: example.match(/^JWT_SECRET=(.*)$/m)[1] }).errors.length, 1, "giá trị mẫu không dùng được");
});

// ---------------------------------------------------------------- controller đăng nhập / đăng ký
test("auth controller: đăng ký và đăng nhập vẫn trả token hợp lệ; thiếu JWT_SECRET thì trả 500 không lộ chi tiết", async (t) => {
    const mongoose = require("mongoose");
    mongoose.set("autoCreate", false);
    mongoose.set("autoIndex", false);
    const realConnect = mongoose.connect;
    mongoose.connect = () => new Promise(() => {}); // không mở kết nối thật
    let UserModel;
    let auth;
    try {
        UserModel = require("../../src/apps/models/user");
        auth = require("../../src/apps/controllers/apis/auth");
    } finally {
        mongoose.connect = realConnect;
    }
    assert.equal(mongoose.connection.readyState, 0);

    const previous = process.env.JWT_SECRET;
    t.after(() => (previous === undefined ? delete process.env.JWT_SECRET : (process.env.JWT_SECRET = previous)));
    process.env.JWT_SECRET = GOOD_SECRET;

    const call = async (handler, body) => {
        const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
        await handler({ body }, res);
        return res;
    };

    // Đăng ký
    t.mock.method(UserModel, "findOne", async () => null);
    t.mock.method(UserModel, "create", async (doc) => ({ _id: "u-new", full_name: doc.full_name, email: doc.email, role: doc.role, password: doc.password }));
    const reg = await call(auth.register, { full_name: "Khách", email: "khach@example.com", password: "matkhau123" });
    assert.equal(reg.statusCode, 201);
    assert.equal(jwt.verify(reg.body.data.token, GOOD_SECRET).email, "khach@example.com");
    assert.ok(!("password" in reg.body.data.user));
    assert.match(UserModel.create.mock.calls[0].arguments[0].password, /^\$2b\$/, "mật khẩu được băm bằng bcrypt");

    // Đăng nhập
    const hash = await bcrypt.hash("matkhau123", 4);
    UserModel.findOne.mock.mockImplementation(async () => ({ _id: "u1", full_name: "Khách", email: "khach@example.com", role: "member", password: hash }));
    const ok = await call(auth.login, { email: "khach@example.com", password: "matkhau123" });
    assert.equal(ok.statusCode, 200);
    assert.equal(jwt.verify(ok.body.data.token, GOOD_SECRET)._id, "u1");
    const wrong = await call(auth.login, { email: "khach@example.com", password: "sai-mat-khau" });
    assert.equal(wrong.statusCode, 401);

    // Thiếu JWT_SECRET: không được ký bằng khóa mặc định.
    delete process.env.JWT_SECRET;
    const original = console.error;
    console.error = () => {};
    try {
        const noSecret = await call(auth.login, { email: "khach@example.com", password: "matkhau123" });
        assert.equal(noSecret.statusCode, 500);
        assert.ok(!noSecret.body.data, "không trả token");
        assert.ok(!JSON.stringify(noSecret.body).includes("JWT_SECRET"), "không lộ chi tiết cấu hình cho client");
    } finally {
        console.error = original;
    }
});

// ---------------------------------------------------------------- khởi động
test("Khởi động backend thiếu biến bắt buộc: thoát mã 1, báo tên biến, không kết nối MongoDB", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-env-")); // thư mục không có .env
    const env = { ...process.env, NODE_CONFIG_DIR: path.join(ROOT, "config") };
    for (const k of ["DB_URI", "JWT_SECRET", "MAIL_USER", "MAIL_PASS"]) delete env[k];

    const run = (extra) => spawnSync(process.execPath, [path.join(ROOT, "src", "bin", "www.js")], { cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 20000 });

    const missing = run({});
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Thiếu DB_URI/);
    assert.match(missing.stderr, /Thiếu JWT_SECRET/);
    assert.match(missing.stderr, /\.env\.example/);
    assert.doesNotMatch(missing.stdout, /Connected|server running/);

    const weak = run({ DB_URI: "mongodb://127.0.0.1:27017/GR2", JWT_SECRET: "weak-secret" });
    assert.equal(weak.status, 1);
    assert.match(weak.stderr, /JWT_SECRET phải dài ít nhất/);
    assert.ok(!weak.stderr.includes("weak-secret"), "không in giá trị secret");
    fs.rmSync(cwd, { recursive: true, force: true });
});
