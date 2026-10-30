// Dựng app Express THẬT của backend với model thay bằng dữ liệu giả trong bộ nhớ.
// Không mở kết nối MongoDB: mongoose.connect bị thay bằng promise không bao giờ xong, bufferCommands = false
// nên truy vấn nào lỡ chạm DB thật sẽ lỗi ngay (không treo) và lộ ra trong test.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const TEST_SECRET = crypto.randomBytes(32).toString("hex");
process.env.JWT_SECRET = TEST_SECRET; // chỉ trong tiến trình test

const mongoose = require("mongoose");
mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);
mongoose.set("bufferCommands", false);
const realConnect = mongoose.connect;
mongoose.connect = () => new Promise(() => {});
let app;
let models;
try {
    app = require("../../src/apps/app");
    models = {
        User: require("../../src/apps/models/user"),
        Product: require("../../src/apps/models/product"),
        Category: require("../../src/apps/models/category"),
        Comment: require("../../src/apps/models/comment"),
        Order: require("../../src/apps/models/order"),
        Coupon: require("../../src/apps/models/coupon"),
    };
} finally {
    mongoose.connect = realConnect;
}

const oid = () => crypto.randomBytes(12).toString("hex");
const clone = (x) => (x === null || x === undefined ? x : JSON.parse(JSON.stringify(x)));

function project(doc, projection) {
    if (!doc) return doc;
    const p = typeof projection === "object" && projection ? projection.projection ?? projection : projection;
    const out = clone(doc);
    if (typeof p === "string") for (const f of p.split(/\s+/)) if (f.startsWith("-")) delete out[f.slice(1)];
    if (p && typeof p === "object") for (const [f, v] of Object.entries(p)) if (v === 0) delete out[f];
    return out;
}

/** Truy vấn giả có thể nối chuỗi như Mongoose (sort/skip/limit/populate/select) và await được. */
function query(valueFn, hydrateFn = null) {
    let isLean = false; // .lean() -> object thô (không áp giá trị mặc định của schema), như Mongoose thật
    let sortSpec = null;
    let skipN = 0;
    let limitN = 0;
    let collator = null; // .collation({ locale }) -> so sánh chuỗi theo ngôn ngữ như MongoDB
    const run = async () => {
        let v = await valueFn();
        if (!Array.isArray(v)) return hydrateFn && !isLean ? hydrateFn(v) : v;
        if (sortSpec) {
            const keys = Object.entries(sortSpec);
            v = [...v].sort((a, b) => {
                for (const [k, dir] of keys) {
                    const x = a[k] ?? "";
                    const y = b[k] ?? "";
                    if (collator && typeof x === "string" && typeof y === "string") {
                        const c = collator.compare(x, y);
                        if (c) return c * dir;
                        continue;
                    }
                    if (x < y) return -1 * dir;
                    if (x > y) return 1 * dir;
                }
                return 0;
            });
        }
        if (skipN) v = v.slice(skipN);
        if (limitN) v = v.slice(0, limitN);
        return v;
    };
    const q = {
        sort: (spec) => {
            sortSpec = spec;
            return q;
        },
        skip: (n) => {
            skipN = n;
            return q;
        },
        limit: (n) => {
            limitN = n;
            return q;
        },
        populate: () => q,
        collation: (spec) => {
            collator = new Intl.Collator(spec.locale, { sensitivity: "base", numeric: Boolean(spec.numericOrdering) });
            return q;
        },
        select: () => q,
        lean: () => {
            isLean = true;
            return q;
        },
        countDocuments: async () => {
            const v = await valueFn();
            return Array.isArray(v) ? v.length : v ? 1 : 0;
        },
        then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
}

// Hỗ trợ tập con toán tử MongoDB mà backend dùng: so sánh bằng, RegExp, $in, $ne, $exists, $and, $or,
// đường dẫn "a.b" vào mảng (vd. "items.prd_id") và $expr.$regexMatch trên chuỗi _id (tìm theo mã đơn).
const isNil = (x) => x === null || x === undefined;
function valuesAt(doc, path) {
    const dotted = path.includes(".");
    let vals = [doc];
    for (const part of path.split(".")) {
        vals = vals.flatMap((x) => {
            if (isNil(x)) return [undefined];
            const y = x[part];
            return dotted && Array.isArray(y) ? y : [y];
        });
    }
    return vals;
}
// So sánh số hoặc thời điểm (Date / chuỗi ISO như dữ liệu giả lưu).
const comparable = (x) => (x instanceof Date ? x.getTime() : typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x) ? Date.parse(x) : x);
const RANGE_OPS = { $lt: (a, b) => a < b, $lte: (a, b) => a <= b, $gt: (a, b) => a > b, $gte: (a, b) => a >= b };
function matchValue(value, cond) {
    if (cond instanceof RegExp) return typeof value === "string" && cond.test(value);
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date) && Object.keys(cond).some((k) => k in RANGE_OPS)) {
        if (isNil(value)) return false;
        return Object.entries(cond).every(([op, b]) => RANGE_OPS[op](comparable(value), comparable(b)));
    }
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
        if ("$in" in cond) return cond.$in.some((c) => (isNil(c) ? isNil(value) : String(c) === String(value)));
        if ("$ne" in cond) return isNil(cond.$ne) ? !isNil(value) : String(value) !== String(cond.$ne) || isNil(value);
        if ("$exists" in cond) return cond.$exists ? value !== undefined : value === undefined;
    }
    if (isNil(cond)) return isNil(value);
    return String(value) === String(cond);
}
const matches = (doc, filter = {}) =>
    Object.entries(filter).every(([k, v]) => {
        if (k === "$and") return v.every((f) => matches(doc, f));
        if (k === "$or") return v.some((f) => matches(doc, f));
        if (k === "$expr") {
            const m = v.$regexMatch;
            return new RegExp(m.regex, m.options || "").test(String(doc._id));
        }
        const vals = valuesAt(doc, k);
        // $ne/$exists phải đúng với mọi giá trị; điều kiện khác chỉ cần một giá trị khớp (như MongoDB với mảng).
        if (v && typeof v === "object" && !(v instanceof RegExp) && ("$ne" in v || "$exists" in v)) return vals.every((x) => matchValue(x, v));
        return vals.some((x) => matchValue(x, v));
    });

/** Áp dụng $set / $push / thay thế trực tiếp lên một tài liệu trong bộ nhớ. */
function applyUpdate(d, update) {
    if (update.$set || update.$push || update.$inc) {
        Object.assign(d, clone(update.$set || {}));
        for (const [k, v] of Object.entries(update.$inc || {})) d[k] = (d[k] || 0) + v;
        for (const [k, v] of Object.entries(update.$push || {})) d[k] = [...(d[k] || []), clone(v)];
    } else Object.assign(d, clone(update));
}

/**
 * Cài dữ liệu giả cho một test. Trả về store (mảng tài liệu) để kiểm tra kết quả ghi.
 * @param {import("node:test").TestContext} t
 */
function installFakeDb(t, seed = {}) {
    // Mỗi test bắt đầu với bộ đếm giới hạn tần suất trống (bộ đếm nằm trong bộ nhớ, dùng chung cả tiến trình).
    require("../../src/libs/rate-limit").resetAllRateLimits();
    const store = { users: [], products: [], categories: [], comments: [], orders: [], coupons: [], ...clone(seed) };
    const coll = (name) => store[name];
    const stubs = {
        User: "users",
        Product: "products",
        Category: "categories",
        Comment: "comments",
        Order: "orders",
        Coupon: "coupons",
    };
    for (const [modelName, name] of Object.entries(stubs)) {
        const M = models[modelName];
        t.mock.method(M, "find", (filter = {}, projection) => query(() => coll(name).filter((d) => matches(d, filter)).map((d) => project(d, projection))));
        // findOne/findById trả document Mongoose (có save()), như Mongoose thật.
        const hydrate = (d) => (d ? M.hydrate(d) : null);
        t.mock.method(M, "findOne", (filter = {}, projection) => query(() => project(coll(name).find((d) => matches(d, filter)) || null, projection), hydrate));
        t.mock.method(M, "findById", (id, projection) => query(() => project(coll(name).find((d) => d._id === String(id)) || null, projection), hydrate));
        t.mock.method(M, "countDocuments", async (filter = {}) => coll(name).filter((d) => matches(d, filter)).length);
        t.mock.method(M, "exists", (filter) => query(() => (coll(name).find((d) => matches(d, filter)) ? { _id: filter._id } : null)));
        t.mock.method(M, "create", async (doc) => {
            const created = { _id: oid(), ...clone(doc), createdAt: new Date().toISOString() };
            coll(name).push(created);
            return clone(created);
        });
        t.mock.method(M, "findByIdAndUpdate", (id, update, options = {}) =>
            query(() => {
                const d = coll(name).find((x) => x._id === String(id));
                if (!d) return null;
                applyUpdate(d, update);
                return project(d, options.projection);
            })
        );
        t.mock.method(M, "findOneAndUpdate", (filter, update, options = {}) =>
            query(() => {
                const d = coll(name).find((x) => matches(x, filter));
                if (!d) return null;
                const before = clone(d);
                applyUpdate(d, update);
                return project(options.new ? d : before, options.projection);
            })
        );
        t.mock.method(M, "deleteMany", async (filter = {}) => {
            const keep = coll(name).filter((d) => !matches(d, filter));
            const deletedCount = coll(name).length - keep.length;
            store[name] = keep;
            return { deletedCount };
        });
        const remove = (id, options = {}) =>
            query(() => {
                const i = coll(name).findIndex((x) => x._id === String(id));
                if (i < 0) return null;
                const [d] = coll(name).splice(i, 1);
                return project(d, options.projection);
            });
        t.mock.method(M, "findByIdAndDelete", remove);
        t.mock.method(M, "findByIdAndRemove", remove);
        t.mock.method(M.prototype, "save", async function save() {
            const doc = this.toObject();
            const id = String(doc._id);
            const i = coll(name).findIndex((x) => x._id === id);
            const plain = { ...clone(doc), _id: id };
            if (i >= 0) coll(name)[i] = plain;
            else coll(name).push(plain);
            return this;
        });
    }
    return store;
}

async function makeUser(store, { email, role = "member", password = "matkhau-dung-1", full_name = "Người dùng" }) {
    const user = { _id: oid(), email, role, full_name, password: await bcrypt.hash(password, 4) };
    store.users.push(user);
    return user;
}

const tokenFor = (user, options = {}) => jwt.sign({ _id: user._id, email: user.email, role: options.role || user.role }, options.secret || TEST_SECRET, { expiresIn: options.expiresIn || "1h", algorithm: "HS256" });

/** Khởi động server trên cổng ngẫu nhiên; trả về hàm gọi API. */
async function startServer(t) {
    const server = await new Promise((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    t.after(() => new Promise((r) => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    return async function call(method, path, { token, body, raw, headers = {} } = {}) {
        const h = { ...headers };
        if (token) h.authorization = `Bearer ${token}`;
        const isForm = typeof FormData !== "undefined" && raw instanceof FormData; // multipart: fetch tự đặt boundary
        if (!isForm && (body !== undefined || raw !== undefined)) h["content-type"] = "application/json";
        const res = await fetch(base + path, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
        const text = await res.text();
        let json = null;
        try {
            json = JSON.parse(text);
        } catch (_) {
            /* không phải JSON */
        }
        return { status: res.status, body: json, text, headers: res.headers };
    };
}

module.exports = { TEST_SECRET, app, models, oid, installFakeDb, makeUser, tokenFor, startServer };
