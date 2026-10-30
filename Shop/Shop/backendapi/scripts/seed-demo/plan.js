// Dựng "kế hoạch seed": toàn bộ bản ghi sẽ được chèn, dưới dạng dữ liệu thuần.
// Không ghi gì vào database; việc ghi nằm ở scripts/seed-demo.js (chỉ khi có --apply).

const fs = require("fs");
const path = require("path");
const { Types } = require("mongoose");

const { CATEGORIES, PRODUCTS, productFields } = require("./catalog");
const { generateOrderBaskets } = require("./orders");
const { SEED_BATCH, demoObjectIdHex } = require("./safety");

const IMAGE_DIR = path.join(__dirname, "..", "..", "src", "public", "images", "products");
const CATALOG_CREATED_AT = new Date("2026-03-15T09:00:00+07:00");

const oid = (kind, key) => new Types.ObjectId(demoObjectIdHex(kind, key));
const normalizeName = (name) => String(name || "").trim().toLowerCase();

/**
 * @param {object} options
 * @param {"placeholder"|"existing"} [options.imageMode]
 * @param {number} [options.orderCount]
 * @param {number} [options.seed]
 * @param {{categories?: {_id, name}[], products?: {_id, name, price}[]}} [options.existing]
 *        Bản ghi đang có trong DB (đọc ở chế độ chỉ đọc). Trùng tên thì DÙNG LẠI bản ghi cũ,
 *        không chèn bản sao và không sửa bản ghi cũ.
 */
function buildPlan(options = {}) {
    const { imageMode = "placeholder", orderCount = 1000, seed = 20261026, existing = {} } = options;
    if (!["placeholder", "existing"].includes(imageMode)) throw new RangeError(`imageMode không hợp lệ: ${imageMode}`);

    const existingCategories = new Map((existing.categories || []).map((c) => [normalizeName(c.name), c]));
    const existingProducts = new Map((existing.products || []).map((p) => [normalizeName(p.name), p]));

    // ---- Categories
    const categories = CATEGORIES.map((c, i) => {
        const found = existingCategories.get(normalizeName(c.name));
        const _id = found ? new Types.ObjectId(String(found._id)) : oid("category", c.key);
        return {
            key: c.key,
            _id,
            action: found ? "reuse" : "insert",
            doc: {
                _id,
                name: c.name,
                seed_batch: SEED_BATCH,
                createdAt: new Date(CATALOG_CREATED_AT.getTime() + i * 60000),
                updatedAt: new Date(CATALOG_CREATED_AT.getTime() + i * 60000),
                __v: 0,
            },
        };
    });
    const categoryIdByKey = new Map(categories.map((c) => [c.key, c._id]));

    // ---- Products
    const products = PRODUCTS.map((p, i) => {
        const found = existingProducts.get(normalizeName(p.name));
        const _id = found ? new Types.ObjectId(String(found._id)) : oid("product", p.key);
        const fields = productFields(p, imageMode);
        const createdAt = new Date(CATALOG_CREATED_AT.getTime() + (i + 60) * 60000);
        // Đơn hàng dùng giá của bản ghi đang có nếu đọc được, để đơn khớp với sản phẩm thật.
        const existingPrice = found ? Number(found.price) : NaN;
        return {
            key: p.key,
            _id,
            action: found ? "reuse" : "insert",
            unitPrice: Number.isFinite(existingPrice) && existingPrice > 0 ? existingPrice : p.price,
            doc: {
                _id,
                ...fields,
                category_id: categoryIdByKey.get(p.category),
                seed_batch: SEED_BATCH,
                createdAt,
                updatedAt: createdAt,
                __v: 0,
            },
        };
    });
    const productByKey = new Map(products.map((p) => [p.key, p]));

    // ---- Orders
    const orders = generateOrderBaskets({ count: orderCount, seed }).map(({ index, createdAt, itemKeys }) => {
        const n = String(index).padStart(4, "0");
        const _id = oid("order", `${seed}:${index}`);
        const items = itemKeys.map(({ key, qty }, j) => {
            const product = productByKey.get(key);
            return {
                _id: oid("order-item", `${seed}:${index}:${j}`),
                prd_id: product._id,
                price: product.unitPrice,
                qty,
            };
        });
        return {
            _id,
            doc: {
                _id,
                fullName: `Khách demo ${n}`,
                phone: `000000${n}`, // không phải số điện thoại thật
                email: `khach.demo.${n}@example.com`, // tên miền example.com dành riêng cho ví dụ
                address: `Địa chỉ demo số ${index}`,
                totalPrice: items.reduce((sum, item) => sum + item.price * item.qty, 0),
                items,
                seed_batch: SEED_BATCH,
                createdAt,
                updatedAt: createdAt,
                __v: 0,
            },
        };
    });

    return { seedBatch: SEED_BATCH, imageMode, seed, categories, products, orders };
}

/**
 * Kiểm tra kế hoạch bằng schema thật của project và các ràng buộc toàn vẹn.
 * @returns {string[]} danh sách lỗi (rỗng nghĩa là hợp lệ)
 */
function validatePlan(plan, models) {
    const errors = [];
    const check = (Model, doc, label) => {
        const error = new Model(doc).validateSync();
        if (error) errors.push(`${label}: ${Object.values(error.errors).map((e) => e.message).join("; ")}`);
    };

    for (const c of plan.categories) if (c.action === "insert") check(models.CategoryModel, c.doc, `category ${c.key}`);
    for (const p of plan.products) {
        if (p.action !== "insert") continue;
        check(models.ProductModel, p.doc, `product ${p.key}`);
        if (!fs.existsSync(path.join(IMAGE_DIR, p.doc.image))) errors.push(`product ${p.key}: thiếu file ảnh ${p.doc.image}`);
    }

    const productIds = new Set(plan.products.map((p) => String(p._id)));
    const categoryIds = new Set(plan.categories.map((c) => String(c._id)));
    for (const p of plan.products) {
        if (p.action === "insert" && !categoryIds.has(String(p.doc.category_id))) {
            errors.push(`product ${p.key}: category_id không thuộc danh mục của kế hoạch`);
        }
    }

    const orderIds = new Set();
    for (const o of plan.orders) {
        check(models.OrderModel, o.doc, `order ${o._id}`);
        if (orderIds.has(String(o._id))) errors.push(`order ${o._id}: trùng _id`);
        orderIds.add(String(o._id));
        if (o.doc.items.length === 0) errors.push(`order ${o._id}: không có sản phẩm`);
        const seen = new Set();
        for (const item of o.doc.items) {
            const id = String(item.prd_id);
            if (!productIds.has(id)) errors.push(`order ${o._id}: prd_id ${id} không có trong danh sách sản phẩm`);
            if (seen.has(id)) errors.push(`order ${o._id}: sản phẩm ${id} bị lặp trong đơn`);
            seen.add(id);
        }
        const total = o.doc.items.reduce((s, i) => s + i.price * i.qty, 0);
        if (total !== o.doc.totalPrice) errors.push(`order ${o._id}: totalPrice sai`);
    }
    return errors;
}

/** Thống kê ngắn để in báo cáo. */
function summarizePlan(plan) {
    const count = (list, action) => list.filter((x) => x.action === action).length;
    const items = plan.orders.reduce((s, o) => s + o.doc.items.length, 0);
    const sizes = {};
    for (const o of plan.orders) sizes[o.doc.items.length] = (sizes[o.doc.items.length] || 0) + 1;
    return {
        categories: { total: plan.categories.length, insert: count(plan.categories, "insert"), reuse: count(plan.categories, "reuse") },
        products: {
            total: plan.products.length,
            insert: count(plan.products, "insert"),
            reuse: count(plan.products, "reuse"),
            featured: plan.products.filter((p) => p.doc.is_featured).length,
        },
        orders: {
            total: plan.orders.length,
            items,
            avgItems: plan.orders.length ? items / plan.orders.length : 0,
            sizeDistribution: sizes,
            revenue: plan.orders.reduce((s, o) => s + o.doc.totalPrice, 0),
            from: plan.orders[0]?.doc.createdAt,
            to: plan.orders[plan.orders.length - 1]?.doc.createdAt,
        },
    };
}

/** Chuyển đơn trong kế hoạch thành giao dịch (tên sản phẩm) để xem trước luật kết hợp. */
function planTransactions(plan) {
    const nameById = new Map(plan.products.map((p) => [String(p._id), p.doc.name]));
    return plan.orders.map((o) => o.doc.items.map((i) => nameById.get(String(i.prd_id))));
}

module.exports = { IMAGE_DIR, buildPlan, validatePlan, summarizePlan, planTransactions };
