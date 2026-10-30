#!/usr/bin/env node
// Seed dữ liệu DEMO cho TrungShop: danh mục, ~41 sản phẩm, ~1.000 đơn hàng giả lập.
//
// An toàn:
//  - Chỉ chạy với MongoDB trên localhost và đúng database demo (mặc định GR2);
//    lấy DB_URI từ cùng cấu hình backend (config/db.js -> .env).
//  - Mặc định là DRY-RUN: chỉ ĐỌC database và in kế hoạch. Muốn ghi phải có
//    `--apply --confirm-db GR2`.
//  - Không xóa, không ghi đè: mỗi bản ghi demo có _id cố định và được chèn bằng
//    upsert + $setOnInsert, nên bản ghi đã tồn tại giữ nguyên. Chạy lại nhiều lần an toàn.
//  - Danh mục/sản phẩm trùng tên với dữ liệu đang có thì dùng lại bản ghi cũ (không sửa).
//  - Không tạo tài khoản người dùng nào.
//
// Cách chạy (từ thư mục backendapi):
//   node scripts/seed-demo.js --offline                 # không kết nối DB, chỉ kiểm tra kế hoạch
//   node scripts/seed-demo.js                           # dry-run: đọc DB, in những gì SẼ chèn
//   node scripts/seed-demo.js --apply --confirm-db GR2  # ghi dữ liệu demo
// Tùy chọn: --orders 1000  --seed 20261026  --images placeholder|existing  --report file.json

const path = require("path");
const fs = require("fs");

process.env.NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR || path.join(__dirname, "..", "config");

const { assertSafeDemoTarget, describeTarget, DEFAULT_DEMO_DB, SEED_BATCH, SeedSafetyError } = require("./seed-demo/safety");
const { buildPlan, validatePlan, summarizePlan, planTransactions } = require("./seed-demo/plan");
const { loadModelsOffline, describeSchema, mongoose } = require("./seed-demo/models");
const { PLANTED_RULES } = require("./seed-demo/orders");
const { fpGrowth } = require("../src/apps/services/mining/fpgrowth");
const { generateRules } = require("../src/apps/services/mining/rules");

function parseArgs(argv) {
    const args = { offline: false, apply: false, confirmDb: null, orders: 1000, seed: 20261026, images: "placeholder", report: null, db: DEFAULT_DEMO_DB };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            if (i + 1 >= argv.length) throw new Error(`Thiếu giá trị cho ${a}`);
            return argv[++i];
        };
        if (a === "--offline") args.offline = true;
        else if (a === "--apply") args.apply = true;
        else if (a === "--confirm-db") args.confirmDb = next();
        else if (a === "--orders") args.orders = Number(next());
        else if (a === "--seed") args.seed = Number(next());
        else if (a === "--images") args.images = next();
        else if (a === "--report") args.report = next();
        else if (a === "--help" || a === "-h") args.help = true;
        else throw new Error(`Tham số không hỗ trợ: ${a}`);
    }
    if (!Number.isInteger(args.orders) || args.orders < 1 || args.orders > 100000) throw new Error("--orders phải là số nguyên 1..100000");
    if (!Number.isInteger(args.seed)) throw new Error("--seed phải là số nguyên");
    if (!["placeholder", "existing"].includes(args.images)) throw new Error("--images phải là placeholder hoặc existing");
    if (args.apply && args.offline) throw new Error("Không dùng --apply cùng --offline");
    return args;
}

const money = (n) => new Intl.NumberFormat("vi-VN").format(n) + "đ";

function printSchemas(models) {
    console.log("\n== Schema thực tế trong src/apps/models (Mongoose) ==");
    for (const [name, model] of Object.entries(models)) {
        const fields = Object.entries(describeSchema(model))
            .map(([p, { type, required }]) => `${p}:${type}${required ? "*" : ""}`)
            .join(", ");
        console.log(`- ${name} -> collection "${model.collection.collectionName}": ${fields}`);
    }
    console.log("  (* = bắt buộc)");
}

function printPlan(plan) {
    const s = summarizePlan(plan);
    console.log("\n== Kế hoạch seed ==");
    console.log(`seed_batch: ${plan.seedBatch} | seed: ${plan.seed} | ảnh: ${plan.imageMode}`);
    console.log(`Danh mục : ${s.categories.total} (chèn mới ${s.categories.insert}, dùng lại ${s.categories.reuse})`);
    console.log(`Sản phẩm : ${s.products.total} (chèn mới ${s.products.insert}, dùng lại ${s.products.reuse}, nổi bật ${s.products.featured})`);
    console.log(
        `Đơn hàng : ${s.orders.total}, ${s.orders.items} dòng sản phẩm (TB ${s.orders.avgItems.toFixed(2)}/đơn), ` +
            `doanh thu giả lập ${money(s.orders.revenue)}`
    );
    console.log(`           từ ${s.orders.from?.toISOString()} đến ${s.orders.to?.toISOString()}`);
    console.log(`           phân bố số sản phẩm/đơn: ${JSON.stringify(s.orders.sizeDistribution)}`);
    const reused = plan.products.filter((p) => p.action === "reuse");
    if (reused.length) console.log(`Sản phẩm dùng lại theo tên: ${reused.map((p) => p.doc.name).join(", ")}`);
    return s;
}

function previewRules(plan) {
    const transactions = planTransactions(plan);
    const { itemsets, stats } = fpGrowth(transactions, { minSupport: 0.02 });
    const rules = generateRules(itemsets, { transactionCount: stats.transactionCount, minConfidence: 0.4 })
        .filter((r) => r.lift > 1 && r.consequent.length === 1)
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 12);
    console.log(`\n== Xem trước luật (FP-Growth, min_sup 2% = ${stats.minSupportCount} đơn, min_conf 40%, lift > 1) ==`);
    console.log(`Tập phổ biến: ${itemsets.length}`);
    for (const r of rules) {
        console.log(
            `  ${r.antecedent.join(" + ")} ⇒ ${r.consequent.join(" + ")}  ` +
                `sup ${(r.support * 100).toFixed(1)}%  conf ${(r.confidence * 100).toFixed(0)}%  lift ${r.lift.toFixed(2)}  Kulc ${r.kulczynski.toFixed(2)}`
        );
    }
    console.log("Luật đã cài khi sinh dữ liệu:");
    for (const line of PLANTED_RULES) console.log(`  - ${line}`);
    return { itemsets: itemsets.length, topRules: rules };
}

async function inspectDatabase(db) {
    console.log("\n== Dữ liệu đang có trong database (chỉ đọc) ==");
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
    console.log(`Collections: ${collections.join(", ") || "(trống)"}`);
    const report = { collections, details: {} };

    for (const name of ["categories", "products", "orders", "users", "comments"]) {
        if (!collections.includes(name)) {
            console.log(`- ${name}: chưa có`);
            continue;
        }
        const col = db.collection(name);
        const count = await col.countDocuments();
        const demo = await col.countDocuments({ seed_batch: SEED_BATCH });
        const sample = name === "users" ? null : await col.findOne({}, { sort: { _id: -1 } });
        const fieldTypes = sample
            ? Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, Array.isArray(v) ? "array" : v === null ? "null" : v?._bsontype || typeof v]))
            : undefined;
        const indexes = (await col.indexes()).map((ix) => `${ix.name}${ix.unique ? " (unique)" : ""}`);
        report.details[name] = { count, demo, fieldTypes, indexes };
        console.log(`- ${name}: ${count} bản ghi (trong đó demo ${demo}); index: ${indexes.join(", ")}`);
        if (fieldTypes) console.log(`    trường của bản ghi mới nhất: ${JSON.stringify(fieldTypes)}`);
    }

    if (collections.includes("orders") && collections.includes("products")) {
        const ids = await db.collection("orders").distinct("items.prd_id");
        const existing = await db.collection("products").countDocuments({ _id: { $in: ids } });
        report.orphanProductRefs = ids.length - existing;
        console.log(`Đơn cũ tham chiếu ${ids.length} sản phẩm khác nhau, trong đó ${ids.length - existing} không còn tồn tại trong products.`);
    }
    return report;
}

async function loadExisting(db) {
    const [categories, products] = await Promise.all([
        db.collection("categories").find({}, { projection: { name: 1 } }).toArray(),
        db.collection("products").find({}, { projection: { name: 1, price: 1 } }).toArray(),
    ]);
    return { categories, products };
}

async function countAlreadyPresent(db, plan) {
    const count = (name, ids) => db.collection(name).countDocuments({ _id: { $in: ids } });
    return {
        categories: await count("categories", plan.categories.filter((c) => c.action === "insert").map((c) => c._id)),
        products: await count("products", plan.products.filter((p) => p.action === "insert").map((p) => p._id)),
        orders: await count("orders", plan.orders.map((o) => o._id)),
    };
}

async function applyPlan(db, plan) {
    const upsertAll = async (name, docs) => {
        let inserted = 0;
        let existed = 0;
        for (let i = 0; i < docs.length; i += 500) {
            const ops = docs.slice(i, i + 500).map(({ _id, ...rest }) => ({
                // Chỉ chèn khi chưa có _id này; bản ghi đã có KHÔNG bị thay đổi.
                updateOne: { filter: { _id }, update: { $setOnInsert: rest }, upsert: true },
            }));
            const result = await db.collection(name).bulkWrite(ops, { ordered: false });
            inserted += result.upsertedCount;
            existed += result.matchedCount;
        }
        return { inserted, existed };
    };
    return {
        categories: await upsertAll("categories", plan.categories.filter((c) => c.action === "insert").map((c) => c.doc)),
        products: await upsertAll("products", plan.products.filter((p) => p.action === "insert").map((p) => p.doc)),
        orders: await upsertAll("orders", plan.orders.map((o) => o.doc)),
    };
}

async function verifyAfterApply(db, plan) {
    const ids = [...new Set(plan.orders.flatMap((o) => o.doc.items.map((i) => String(i.prd_id))))].map((id) => new mongoose.Types.ObjectId(id));
    const found = await db.collection("products").countDocuments({ _id: { $in: ids } });
    const orders = await db.collection("orders").countDocuments({ _id: { $in: plan.orders.map((o) => o._id) } });
    return { referencedProducts: ids.length, existingReferencedProducts: found, demoOrdersPresent: orders };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 21).join("\n"));
        return;
    }
    const models = loadModelsOffline();
    const report = { mode: args.offline ? "offline" : args.apply ? "apply" : "dry-run", args };
    printSchemas(models);

    if (args.offline) {
        const plan = buildPlan({ imageMode: args.images, orderCount: args.orders, seed: args.seed });
        const errors = validatePlan(plan, models);
        report.summary = printPlan(plan);
        report.validationErrors = errors;
        console.log(errors.length ? `\nLỖI kiểm tra (${errors.length}):\n${errors.slice(0, 20).join("\n")}` : "\nKiểm tra schema & toàn vẹn: OK");
        report.preview = previewRules(plan);
        console.log("\nChế độ --offline: không kết nối database.");
        writeReport(args.report, report);
        if (errors.length) process.exitCode = 1;
        return;
    }

    // Lấy URI từ đúng cấu hình backend đang dùng.
    const config = require("config");
    const uri = config.get("db.mongodb.uri");
    const target = assertSafeDemoTarget(uri, { expectedDb: args.db });
    console.log(`\nĐích: ${describeTarget(target)} (đã qua kiểm tra localhost + database demo)`);

    if (args.apply && args.confirmDb !== target.dbName) {
        throw new SeedSafetyError([`Cần --confirm-db ${target.dbName} để xác nhận ghi vào database này.`]);
    }

    const conn = await mongoose
        .createConnection(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 })
        .asPromise();
    try {
        const db = conn.db;
        report.database = await inspectDatabase(db);
        const existing = await loadExisting(db);
        const plan = buildPlan({ imageMode: args.images, orderCount: args.orders, seed: args.seed, existing });
        const errors = validatePlan(plan, models);
        report.summary = printPlan(plan);
        report.validationErrors = errors;
        if (errors.length) {
            console.log(`\nLỖI kiểm tra (${errors.length}), dừng lại:\n${errors.slice(0, 20).join("\n")}`);
            process.exitCode = 1;
            return;
        }
        console.log("\nKiểm tra schema & toàn vẹn: OK");
        report.alreadyPresent = await countAlreadyPresent(db, plan);
        console.log(`Bản ghi demo đã có sẵn (sẽ bỏ qua): ${JSON.stringify(report.alreadyPresent)}`);
        report.preview = previewRules(plan);

        if (!args.apply) {
            console.log("\nDRY-RUN: chưa ghi gì vào database. Chạy lại với --apply --confirm-db " + target.dbName + " để seed.");
        } else {
            console.log("\nĐang ghi (upsert + $setOnInsert, không xóa/ghi đè)...");
            report.applied = await applyPlan(db, plan);
            report.verify = await verifyAfterApply(db, plan);
            console.log(`Kết quả: ${JSON.stringify(report.applied)}`);
            console.log(`Kiểm tra sau seed: ${JSON.stringify(report.verify)}`);
            if (report.verify.referencedProducts !== report.verify.existingReferencedProducts) process.exitCode = 1;
        }
    } finally {
        await conn.close();
    }
    writeReport(args.report, report);
}

function writeReport(file, report) {
    if (!file) return;
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`Đã ghi báo cáo: ${path.resolve(file)}`);
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err instanceof SeedSafetyError ? err.message : err);
        process.exit(1);
    });
}

module.exports = { parseArgs };
