#!/usr/bin/env node
// Tạo tài khoản ADMIN đầu tiên — chỉ chạy THỦ CÔNG, không bao giờ chạy khi backend khởi động.
//
//   node scripts/create-admin.js                       # hỏi email, họ tên, mật khẩu (nhập ẩn)
//   node scripts/create-admin.js --email you@shop.vn   # chỉ hỏi họ tên và mật khẩu
//   node scripts/create-admin.js --promote-existing --email user@shop.vn
//        # nâng một tài khoản ĐÃ CÓ lên admin: phải nhập lại email để xác nhận, mật khẩu cũ giữ nguyên
//
// An toàn:
//  - Không có email/mật khẩu viết cứng; mật khẩu nhập ẩn (không hiện trên màn hình), không ghi log, không nhận qua tham số dòng lệnh.
//  - Chỉ ghi vào MongoDB trên localhost/127.0.0.1 (DB_URI trong .env), không in DB_URI.
//  - Email đã tồn tại: mặc định TỪ CHỐI; chỉ nâng quyền khi có --promote-existing và xác nhận lại email.
//  - Mật khẩu băm bcrypt (12 vòng) trước khi lưu.

const path = require("path");
const readline = require("readline");

const BCRYPT_ROUNDS = 12;
const ADMIN_PASSWORD_MIN = 10;

function parseArgs(argv) {
    const args = { email: null, promoteExisting: false, help: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--email") args.email = argv[++i] || "";
        else if (a === "--promote-existing") args.promoteExisting = true;
        else if (a === "--help" || a === "-h") args.help = true;
        else if (a === "--password" || a.startsWith("--password=")) throw new Error("Không nhận mật khẩu qua tham số dòng lệnh (sẽ lưu trong lịch sử shell). Script sẽ hỏi mật khẩu.");
        else throw new Error(`Tham số không hỗ trợ: ${a}`);
    }
    return args;
}

/** DB_URI phải trỏ tới MongoDB trên máy cục bộ. Trả về tên database (không in URI). */
function assertLocalDatabase(uri) {
    if (typeof uri !== "string" || !uri) throw new Error("Thiếu DB_URI trong .env.");
    const m = /^mongodb:\/\/(?:[^@/]+@)?(localhost|127\.0\.0\.1)(?::\d+)?\/([A-Za-z0-9_-]+)(?:\?.*)?$/.exec(uri);
    if (!m) throw new Error("Script chỉ ghi vào MongoDB trên localhost/127.0.0.1 (DB_URI dạng mongodb://localhost:27017/<db>).");
    return m[2];
}

/** Kiểm tra dữ liệu nhập; trả về email đã chuẩn hóa. */
function validateAdminInput({ email, password, confirm, fullName }) {
    const { validateEmail, PASSWORD_MAX } = require("../src/libs/validate");
    const normalized = validateEmail(email);
    if (typeof password !== "string" || password.length < ADMIN_PASSWORD_MIN) throw new Error(`Mật khẩu admin phải có ít nhất ${ADMIN_PASSWORD_MIN} ký tự.`);
    if (password.length > PASSWORD_MAX) throw new Error(`Mật khẩu không được dài quá ${PASSWORD_MAX} ký tự.`);
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("Mật khẩu admin cần có cả chữ và số.");
    if (password.toLowerCase().includes(normalized.split("@")[0])) throw new Error("Mật khẩu không được chứa phần tên của email.");
    if (password !== confirm) throw new Error("Hai lần nhập mật khẩu không khớp.");
    if (fullName !== undefined && fullName !== null && String(fullName).length > 100) throw new Error("Họ tên tối đa 100 ký tự.");
    return normalized;
}

/**
 * Logic tạo/nâng admin trên một collection kiểu MongoDB (tiêm được để test, không cần DB thật).
 * @returns {Promise<{action: "created"|"promoted"|"already-admin", email: string}>}
 */
async function createAdmin({ users, email, password, fullName, promoteExisting = false, confirmPromotion = async () => false, hash }) {
    const existing = await users.findOne({ email }, { projection: { _id: 1, role: 1, email: 1 } });
    if (existing) {
        if (existing.role === "admin") return { action: "already-admin", email };
        if (!promoteExisting) throw new Error("Email đã có tài khoản thành viên. Script không tự nâng quyền; chạy lại với --promote-existing nếu thực sự muốn.");
        if (!(await confirmPromotion(email))) throw new Error("Chưa xác nhận — không thay đổi gì.");
        const r = await users.updateOne({ _id: existing._id, role: { $ne: "admin" } }, { $set: { role: "admin", updatedAt: new Date() } });
        if (r.modifiedCount !== 1) throw new Error("Không nâng được quyền (tài khoản đã thay đổi trong lúc chạy).");
        return { action: "promoted", email };
    }
    const now = new Date();
    await users.insertOne({ full_name: fullName || null, email, password: await hash(password), role: "admin", createdAt: now, updatedAt: now, __v: 0 });
    return { action: "created", email };
}

// ---------------------------------------------------------------- nhập liệu

function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, (answer) => resolve(answer)));
}

/** Hỏi mật khẩu mà không hiện ký tự (ghi đè hàm in của readline trong lúc nhập). */
function askHidden(rl, question) {
    return new Promise((resolve) => {
        const original = rl._writeToOutput;
        rl._writeToOutput = (s) => {
            if (s.includes(question)) original.call(rl, question);
            else if (s === "\r\n" || s === "\n") original.call(rl, s);
        };
        rl.question(question, (answer) => {
            rl._writeToOutput = original;
            process.stdout.write("\n");
            resolve(answer);
        });
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log("Cách dùng: node scripts/create-admin.js [--email <email>] [--promote-existing]");
        return;
    }
    if (!process.stdin.isTTY) throw new Error("Script cần chạy trong terminal tương tác (để nhập mật khẩu ẩn).");
    require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
    const dbName = assertLocalDatabase(process.env.DB_URI);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let conn;
    try {
        console.log(`Tạo tài khoản admin trong database "${dbName}" trên máy cục bộ.`);
        const email = args.email ?? (await ask(rl, "Email admin: "));
        let fullName = null;
        let password = "";
        let confirm = "";
        if (!args.promoteExisting) {
            fullName = (await ask(rl, "Họ tên (có thể bỏ trống): ")).trim() || null;
            password = await askHidden(rl, `Mật khẩu (≥ ${ADMIN_PASSWORD_MIN} ký tự, có chữ và số): `);
            confirm = await askHidden(rl, "Nhập lại mật khẩu: ");
        }
        const normalized = args.promoteExisting ? require("../src/libs/validate").validateEmail(email) : validateAdminInput({ email, password, confirm, fullName });

        const mongoose = require("mongoose");
        const bcrypt = require("bcrypt");
        conn = await mongoose.createConnection(process.env.DB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 }).asPromise();
        const result = await createAdmin({
            users: conn.db.collection("users"),
            email: normalized,
            password,
            fullName,
            promoteExisting: args.promoteExisting,
            confirmPromotion: async (e) => (await ask(rl, `Nhập lại "${e}" để xác nhận nâng tài khoản này lên admin: `)).trim().toLowerCase() === e,
            hash: (p) => bcrypt.hash(p, BCRYPT_ROUNDS),
        });
        password = confirm = ""; // không giữ mật khẩu trong bộ nhớ lâu hơn cần thiết
        const messages = { created: "Đã tạo tài khoản admin", promoted: "Đã nâng tài khoản lên admin", "already-admin": "Tài khoản đã là admin — không thay đổi gì" };
        console.log(`${messages[result.action]}: ${result.email}`);
    } finally {
        rl.close();
        if (conn) await conn.close();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(`Lỗi: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { parseArgs, assertLocalDatabase, validateAdminInput, createAdmin, ADMIN_PASSWORD_MIN, BCRYPT_ROUNDS };
