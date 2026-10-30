// Bộ dữ liệu nghiên cứu R1 / R1b — sinh OFFLINE trong bộ nhớ, không kết nối MongoDB.
//
// Dùng lại bộ sinh của dữ liệu demo (scripts/seed-demo): cùng danh mục 41 sản phẩm, cùng bảng
// độ phổ biến điện thoại (PHONE_WEIGHTS), luật mua kèm (COMPANIONS), gói phụ kiện (ACCESSORY_BUNDLES)
// và PRNG mulberry32. Vòng lặp dưới đây gọi random() theo ĐÚNG thứ tự của generateOrderBaskets(),
// nên hồ sơ "r1" với cùng seed/số đơn tái tạo y hệt từng giỏ hàng của bộ sinh demo (có test kiểm chứng).
//
// Hồ sơ:
//   r1  : như dữ liệu demo — 55% đơn có điện thoại, 35% đơn phụ kiện, 10% đơn nhiễu (1–3 sản phẩm).
//   r1b : khó hơn — 43,8% điện thoại, 30% phụ kiện, 1,2% đơn có sản phẩm ÍT GIAO DỊCH, 25% đơn nhiễu
//         (1–4 sản phẩm trong 41 sản phẩm gốc); xác suất mua kèm giảm còn 70%; thêm 7 sản phẩm hiếm.

const crypto = require("crypto");
const { createRandom } = require("../../src/apps/services/mining/synthetic");
const { PRODUCTS, CATEGORIES, isPhone } = require("../../scripts/seed-demo/catalog");
const { PHONE_WEIGHTS, COMPANIONS, ACCESSORY_BUNDLES } = require("../../scripts/seed-demo/orders");
const { demoObjectIdHex } = require("../../scripts/seed-demo/safety");

// Tăng phiên bản khi thay đổi bất kỳ điều gì ảnh hưởng tới dữ liệu sinh ra (bảng xác suất, thứ tự gọi random, định dạng).
// Phiên bản nằm trong metadata và trong checksum, nên hai phiên bản khác nhau không bao giờ trùng checksum.
const GENERATOR_VERSION = "trungshop-research-generator/1.0.0";

const DEFAULT_FROM = "2026-04-01T00:00:00+07:00";
const DEFAULT_TO = "2026-10-25T23:59:59+07:00";

// Sản phẩm hiếm chỉ có trong R1b (không có trong GR2). Mỗi sản phẩm hiếm vẫn có quan hệ mua kèm riêng,
// nhưng xuất hiện quá ít để vượt ngưỡng support thông thường -> mô phỏng sản phẩm mới / bán chậm.
const RARE_PRODUCTS = [
    { key: "galaxy-s24-fe", name: "Samsung Galaxy S24 FE 128GB", category: "samsung", price: 13990000 },
    { key: "redmi-13c", name: "Xiaomi Redmi 13C 128GB", category: "xiaomi", price: 3290000 },
    { key: "oppo-find-n3-flip", name: "OPPO Find N3 Flip 256GB", category: "oppo", price: 22990000 },
    { key: "vivo-x100", name: "Vivo X100 256GB", category: "vivo", price: 19990000 },
    { key: "op-lung-galaxy-s24-fe", name: "Ốp lưng Galaxy S24 FE", category: "op-lung-cuong-luc", price: 250000 },
    { key: "op-lung-redmi-13c", name: "Ốp lưng Redmi 13C", category: "op-lung-cuong-luc", price: 120000 },
    { key: "op-lung-find-n3-flip", name: "Ốp lưng OPPO Find N3 Flip", category: "op-lung-cuong-luc", price: 390000 },
];
const RARE_PHONE_WEIGHTS = { "galaxy-s24-fe": 1, "redmi-13c": 1, "oppo-find-n3-flip": 1, "vivo-x100": 1 };
const RARE_COMPANIONS = {
    "galaxy-s24-fe": [{ key: "op-lung-galaxy-s24-fe", p: 0.7 }, { key: "cu-sac-samsung-45w", p: 0.4 }],
    "redmi-13c": [{ key: "op-lung-redmi-13c", p: 0.6 }, { key: "pin-xiaomi-10000-20w", p: 0.3 }],
    "oppo-find-n3-flip": [{ key: "op-lung-find-n3-flip", p: 0.7 }],
    "vivo-x100": [{ key: "tai-nghe-sony-ex15", p: 0.3 }],
};

const PROFILES = Object.freeze({
    r1: Object.freeze({
        description: "Giống dữ liệu demo: 55% đơn điện thoại, 35% đơn phụ kiện, 10% đơn nhiễu (1–3 sản phẩm).",
        phoneShare: 0.55,
        accessoryShare: 0.35,
        rareShare: 0,
        noiseMaxItems: 3,
        noiseFromAllProducts: false,
        companionScale: 1,
        rareProducts: false,
    }),
    r1b: Object.freeze({
        description:
            "Khó hơn: 43,8% đơn điện thoại, 30% đơn phụ kiện, 1,2% đơn có sản phẩm ít giao dịch, 25% đơn nhiễu (1–4 sản phẩm trong 41 sản phẩm gốc); xác suất mua kèm × 0,7; thêm 7 sản phẩm hiếm chỉ xuất hiện trong nhánh 1,2%.",
        phoneShare: 0.438,
        accessoryShare: 0.3,
        rareShare: 0.012,
        noiseMaxItems: 4,
        // Nhiễu chỉ chọn trong 41 sản phẩm gốc, để sản phẩm hiếm thực sự ít giao dịch.
        noiseFromAllProducts: false,
        companionScale: 0.7,
        rareProducts: true,
    }),
});

function pickWeighted(random, entries) {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = random() * total;
    for (const [value, w] of entries) {
        r -= w;
        if (r < 0) return value;
    }
    return entries[entries.length - 1][0];
}

function addCompanions(random, keys, rules, scale) {
    for (const rule of rules || []) {
        if (rule.after && !keys.has(rule.after)) continue;
        if (rule.unless && keys.has(rule.unless)) continue;
        if (random() < rule.p * scale) keys.add(rule.key);
    }
}

/**
 * Sinh giỏ hàng theo hồ sơ. Trả về [{index, createdAt, itemKeys: [{key, qty}]}], sắp theo thời gian
 * (cùng định dạng với generateOrderBaskets()).
 */
function generateProfileBaskets({ profile = "r1", seed, count = 20000, from = DEFAULT_FROM, to = DEFAULT_TO } = {}) {
    const p = PROFILES[profile];
    if (!p) throw new RangeError(`Hồ sơ không hỗ trợ: ${profile}`);
    if (!Number.isInteger(seed)) throw new TypeError("seed phải là số nguyên.");
    if (!Number.isInteger(count) || count < 0) throw new RangeError("count phải là số nguyên không âm.");

    const random = createRandom(seed);
    const catalog = p.rareProducts ? [...PRODUCTS, ...RARE_PRODUCTS] : PRODUCTS;
    const isPhoneKey = new Map(catalog.map((x) => [x.key, isPhone(x)]));
    const noisePool = p.noiseFromAllProducts ? catalog : PRODUCTS;
    const phoneEntries = Object.entries(PHONE_WEIGHTS);
    const rareEntries = Object.entries(RARE_PHONE_WEIGHTS);
    const bundleEntries = ACCESSORY_BUNDLES.map((b) => [b, b.weight]);
    const start = new Date(from).getTime();
    const span = new Date(to).getTime() - start;
    const phoneEnd = p.phoneShare;
    const accessoryEnd = p.phoneShare + p.accessoryShare;
    const rareEnd = accessoryEnd + p.rareShare;

    const baskets = [];
    for (let index = 1; index <= count; index++) {
        const keys = new Set();
        const kind = random();

        if (kind < phoneEnd) {
            const phone = pickWeighted(random, phoneEntries);
            keys.add(phone);
            addCompanions(random, keys, COMPANIONS[phone], p.companionScale);
        } else if (kind < accessoryEnd) {
            const bundle = pickWeighted(random, bundleEntries);
            keys.add(bundle.base);
            for (const extra of bundle.extras) if (random() < extra.p * p.companionScale) keys.add(extra.key);
        } else if (kind < rareEnd) {
            const phone = pickWeighted(random, rareEntries);
            keys.add(phone);
            addCompanions(random, keys, RARE_COMPANIONS[phone], 1);
        } else {
            const size = 1 + Math.floor(random() * p.noiseMaxItems);
            while (keys.size < size) keys.add(noisePool[Math.floor(random() * noisePool.length)].key);
        }

        const itemKeys = [...keys].map((key) => ({ key, qty: isPhoneKey.get(key) ? 1 : random() < 0.1 ? 2 : 1 }));
        baskets.push({ index, createdAt: new Date(start + Math.floor(random() * span)), itemKeys });
    }
    baskets.sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
    return baskets;
}

/** Sản phẩm của bộ dữ liệu: 41 sản phẩm demo (cùng _id với GR2) + sản phẩm hiếm nếu hồ sơ có. */
function datasetProducts(profile) {
    const p = PROFILES[profile];
    const categoryId = new Map(CATEGORIES.map((c) => [c.key, demoObjectIdHex("category", c.key)]));
    const categoryName = new Map(CATEGORIES.map((c) => [c.key, c.name]));
    const toProduct = (x, rare) => ({
        _id: rare ? demoObjectIdHex("research-product", x.key) : demoObjectIdHex("product", x.key),
        key: x.key,
        name: x.name,
        category_id: categoryId.get(x.category),
        category: categoryName.get(x.category),
        price: x.price,
        is_stock: true,
        rare: Boolean(rare),
    });
    return [...PRODUCTS.map((x) => toProduct(x, false)), ...(p.rareProducts ? RARE_PRODUCTS.map((x) => toProduct(x, true)) : [])];
}

/**
 * Bộ dữ liệu theo đúng định dạng mà công cụ đánh giá dùng (giống datasetFromSeedPlan()).
 * Checksum = SHA-1 của {profile, cấu hình, sản phẩm, đơn hàng}: cùng seed + cấu hình -> cùng checksum.
 */
function generateResearchDataset({ profile = "r1", seed, count = 20000, from = DEFAULT_FROM, to = DEFAULT_TO } = {}) {
    const products = datasetProducts(profile);
    const idByKey = new Map(products.map((x) => [x.key, x._id]));
    const orders = generateProfileBaskets({ profile, seed, count, from, to }).map((b) => ({
        id: `${profile}-${seed}-${String(b.index).padStart(6, "0")}`,
        time: b.createdAt.getTime(),
        items: [...new Set(b.itemKeys.map((i) => idByKey.get(i.key)))].sort(),
    }));
    const config = { generatorVersion: GENERATOR_VERSION, profile, seed, count, from, to, ...PROFILES[profile] };
    const configSha1 = crypto.createHash("sha1").update(JSON.stringify(config)).digest("hex");
    const checksum = crypto.createHash("sha1").update(JSON.stringify({ config, products, orders })).digest("hex");
    return {
        name: `${profile.toUpperCase()}-seed${seed}-n${count}`,
        source: `research/datasets/generator.js (hồ sơ ${profile}, dữ liệu giả lập có luật cài sẵn)`,
        generatorVersion: GENERATOR_VERSION,
        profile,
        seed,
        orderCount: count,
        config,
        configSha1,
        checksum,
        products,
        orders,
    };
}

/** Thống kê mô tả để ghi vào metadata (không dùng để học). */
function describeDataset(dataset) {
    const counts = new Map(dataset.products.map((p) => [p._id, 0]));
    let items = 0;
    let multi = 0;
    let maxLength = 0;
    for (const o of dataset.orders) {
        items += o.items.length;
        if (o.items.length >= 2) multi++;
        maxLength = Math.max(maxLength, o.items.length);
        for (const x of o.items) counts.set(x, counts.get(x) + 1);
    }
    const perProduct = [...counts.values()].sort((a, b) => a - b);
    const n = dataset.orders.length;
    return {
        orders: n,
        products: dataset.products.length,
        rareProductsInCatalog: dataset.products.filter((p) => p.rare).length,
        avgItemsPerOrder: n ? items / n : 0,
        maxItemsPerOrder: maxLength,
        multiItemOrderShare: n ? multi / n : 0,
        ordersPerProduct: { min: perProduct[0], median: perProduct[Math.floor(perProduct.length / 2)], max: perProduct[perProduct.length - 1] },
        timeRange: n ? { from: new Date(dataset.orders[0].time).toISOString(), to: new Date(dataset.orders[n - 1].time).toISOString() } : null,
    };
}

/** Metadata tái lập của một bộ dữ liệu (không chứa đơn hàng). */
function datasetMetadata(dataset) {
    return {
        name: dataset.name,
        generatorVersion: dataset.generatorVersion,
        profile: dataset.profile,
        seed: dataset.seed,
        orderCount: dataset.orderCount,
        configSha1: dataset.configSha1,
        checksum: dataset.checksum,
        config: dataset.config,
        stats: describeDataset(dataset),
        regenerate: `generateResearchDataset({ profile: "${dataset.profile}", seed: ${dataset.seed}, count: ${dataset.orderCount} })`,
    };
}

// 5 seed cố định cho R1 và R1b (khác seed 20261026 của dữ liệu demo GR2).
const RESEARCH_SEEDS = Object.freeze([20261101, 20261102, 20261103, 20261104, 20261105]);

module.exports = {
    GENERATOR_VERSION,
    PROFILES,
    RARE_PRODUCTS,
    RESEARCH_SEEDS,
    generateProfileBaskets,
    datasetProducts,
    generateResearchDataset,
    describeDataset,
    datasetMetadata,
};
