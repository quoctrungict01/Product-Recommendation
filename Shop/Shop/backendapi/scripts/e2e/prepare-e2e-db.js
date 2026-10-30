#!/usr/bin/env node
// Chuẩn bị database THỬ GR2_E2E cho kiểm thử ghi trên máy này — KHÔNG bao giờ ghi vào GR2.
//
//   # 1) Xem trước (mặc định, chỉ đọc cả hai DB, không tạo gì):
//   E2E_DB_URI=mongodb://127.0.0.1:27017/GR2_E2E node scripts/e2e/prepare-e2e-db.js
//   # 2) Thực hiện sao chép:
//   E2E_DB_URI=mongodb://127.0.0.1:27017/GR2_E2E node scripts/e2e/prepare-e2e-db.js --apply
//
// Chỉ chấp nhận MongoDB tại 127.0.0.1:27017 (không nhận localhost, IPv6, cổng khác, nhiều host, mongodb+srv).
// Nguồn: DB_URI trong .env, phải ĐÚNG database "GR2", chỉ được ĐỌC (find/count/listCollections).
// Đích:  E2E_DB_URI, phải ĐÚNG database "GR2_E2E" (phân biệt hoa/thường) và đang TRỐNG.
//        Tên database được kiểm tra lại ngay trước lệnh ghi đầu tiên.
//        Muốn làm lại: tự xóa database thử trong Compass/mongosh rồi chạy lại (script không bao giờ xóa).
//
// Dữ liệu sao chép:
//  - categories, products: nguyên vẹn (không có dữ liệu cá nhân).
//  - orders: giữ sản phẩm, số lượng, giá, tổng tiền, ngày tạo (đủ cho gợi ý Apriori/FP-Growth và Dashboard);
//    thay họ tên/điện thoại/email/địa chỉ bằng dữ liệu giả; bỏ user_id, địa chỉ có cấu trúc, coupon, lịch sử trạng thái.
//  - KHÔNG sao chép users (mật khẩu, email thật), comments, coupons. Tài khoản thử tạo qua trang Đăng ký
//    và scripts/create-admin.js (trỏ DB_URI vào database thử).
//  - Tạo index: users.email (unique), orders.user_id, coupons.code (unique) — chỉ trên database thử.
// Không in chuỗi kết nối hay thông tin đăng nhập.

const path = require("path");

const ALLOWED_HOST = "127.0.0.1";
const ALLOWED_PORT = 27017;
const SOURCE_DB = "GR2";
const TARGET_DB = "GR2_E2E";
const COPY_AS_IS = ["categories", "products"];
const ORDER_FIELDS = ["items", "totalPrice", "subtotal_original", "product_discount", "subtotal", "createdAt", "updatedAt"];

/**
 * { host, port, db } của URI mongodb://127.0.0.1:27017/<db>, hoặc ném lỗi (thông báo không kèm URI).
 * Bỏ trống cổng = 27017 (cổng mặc định của MongoDB).
 */
function parseLocalUri(uri, label) {
    const m = /^mongodb:\/\/(?:[^@/]+@)?(\[[^\]]+\]|[^:/?#,]+)(?::(\d+))?\/([A-Za-z0-9_-]+)(?:\?.*)?$/.exec(String(uri || "").trim());
    if (!m) throw new Error(`${label} phải có dạng mongodb://127.0.0.1:27017/<tên database> (một host).`);
    const host = m[1].toLowerCase();
    const port = Number(m[2] || ALLOWED_PORT);
    if (host !== ALLOWED_HOST || port !== ALLOWED_PORT) throw new Error(`${label}: chỉ cho phép MongoDB tại ${ALLOWED_HOST}:${ALLOWED_PORT}.`);
    return { host, port, db: m[3] };
}

/** Kiểm tra cặp nguồn/đích. Trả về { source, target }. */
function assertPlan(sourceUri, targetUri) {
    const source = parseLocalUri(sourceUri, "DB_URI (nguồn)");
    const target = parseLocalUri(targetUri, "E2E_DB_URI (đích)");
    if (source.db !== SOURCE_DB) throw new Error(`Nguồn phải đúng database ${SOURCE_DB}.`);
    if (target.db !== TARGET_DB) throw new Error(`Đích phải đúng database ${TARGET_DB}.`);
    return { source, target };
}

/** Database thực tế đã mở phải đúng GR2 (nguồn) và GR2_E2E (đích). */
function assertDbNames(sdb, tdb) {
    if (sdb.databaseName !== SOURCE_DB || tdb.databaseName !== TARGET_DB) throw new Error(`Từ chối: nguồn phải là ${SOURCE_DB}, đích phải là ${TARGET_DB}.`);
}

const pad = (n, w) => String(n).padStart(w, "0");

/** Đơn hàng ẩn danh: chỉ giữ dữ liệu sản phẩm/tiền/thời gian; thông tin khách là dữ liệu giả. */
function anonymizeOrder(order, index) {
    const out = { _id: order._id };
    for (const f of ORDER_FIELDS) if (order[f] !== undefined) out[f] = order[f];
    out.items = (order.items || []).map((it) => {
        const item = { prd_id: it.prd_id, name: it.name, price: it.price, qty: it.qty };
        if (it.image !== undefined) item.image = it.image;
        if (it.original_price !== undefined) item.original_price = it.original_price;
        return item;
    });
    const n = index + 1;
    out.fullName = `Khách thử ${n}`;
    out.email = `khach${pad(n, 4)}@e2e.test`;
    out.phone = `0900${pad(n, 6)}`;
    out.address = "Địa chỉ thử nghiệm, Hà Nội";
    return out; // không có user_id, shipping_address, coupon, status, status_history, delivered_at
}

async function main({ argv = process.argv.slice(2), env = process.env, log = console.log, mongodb } = {}) {
    const apply = argv.includes("--apply");
    const unknown = argv.filter((a) => a !== "--apply");
    if (unknown.length) throw new Error(`Tham số không hỗ trợ: ${unknown.join(" ")}`);
    if (!env.E2E_DB_URI) throw new Error("Thiếu biến môi trường E2E_DB_URI (vd. mongodb://127.0.0.1:27017/GR2_E2E).");
    const { source, target } = assertPlan(env.DB_URI, env.E2E_DB_URI);
    const { MongoClient } = mongodb || require("mongodb");

    log(`Nguồn (chỉ đọc): ${source.host}:${source.port}/${source.db}`);
    log(`Đích:            ${target.host}:${target.port}/${target.db}`);
    log(apply ? "Chế độ: GHI vào database thử." : "Chế độ: XEM TRƯỚC (không ghi gì). Thêm --apply để sao chép.");

    const opts = { serverSelectionTimeoutMS: 5000 };
    const src = new MongoClient(env.DB_URI, opts);
    const dst = new MongoClient(env.E2E_DB_URI, opts);
    try {
        await src.connect();
        await dst.connect();
        const sdb = src.db(source.db);
        const tdb = dst.db(target.db);
        assertDbNames(sdb, tdb);

        const existing = await tdb.listCollections({}, { nameOnly: true }).toArray();
        const nonEmpty = [];
        for (const c of existing) if (await tdb.collection(c.name).estimatedDocumentCount()) nonEmpty.push(c.name);
        if (nonEmpty.length) throw new Error(`Database thử ${target.db} không trống (${nonEmpty.join(", ")}). Hãy tự xóa database thử rồi chạy lại.`);

        const data = {};
        for (const name of COPY_AS_IS) data[name] = await sdb.collection(name).find({}).toArray();
        const orders = await sdb.collection("orders").find({}).sort({ _id: 1 }).toArray();
        data.orders = orders.map(anonymizeOrder);
        const sourceUsers = await sdb.collection("users").countDocuments();
        for (const name of [...COPY_AS_IS, "orders"]) log(`  ${name}: ${data[name].length} tài liệu`);
        log(`  users: 0 (bỏ qua ${sourceUsers} tài khoản thật), comments: 0, coupons: 0`);

        if (!apply) {
            log("Xem trước xong. Không có gì được ghi.");
            return { applied: false, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) };
        }
        assertDbNames(sdb, tdb); // kiểm tra lại ngay trước lệnh ghi đầu tiên
        for (const [name, docs] of Object.entries(data)) if (docs.length) await tdb.collection(name).insertMany(docs, { ordered: true });
        await tdb.collection("users").createIndex({ email: 1 }, { unique: true });
        await tdb.collection("orders").createIndex({ user_id: 1 });
        await tdb.collection("coupons").createIndex({ code: 1 }, { unique: true });
        log(`Đã sao chép vào ${target.db}. Tiếp theo: tạo admin thử bằng scripts/create-admin.js với DB_URI trỏ vào ${target.db}.`);
        return { applied: true };
    } finally {
        await src.close().catch(() => {});
        await dst.close().catch(() => {});
    }
}

module.exports = { parseLocalUri, assertPlan, assertDbNames, anonymizeOrder, main, SOURCE_DB, TARGET_DB, ALLOWED_HOST, ALLOWED_PORT };

if (require.main === module) {
    require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") }); // không ghi đè biến đã đặt trong shell
    main().catch((err) => {
        console.error(`Dừng: ${err.message}`);
        process.exit(1);
    });
}
