// Sinh đơn hàng GIẢ LẬP có các nhóm sản phẩm thường mua cùng nhau.
// Hàm thuần: cùng seed luôn cho cùng danh sách đơn. Không truy cập cơ sở dữ liệu.
//
// Cơ cấu đơn:
//  - 55% đơn có điện thoại: chọn điện thoại theo độ phổ biến, rồi thêm phụ kiện
//    theo xác suất có điều kiện của dòng máy (bảng COMPANIONS) -> đây là "luật cài sẵn".
//  - 35% đơn chỉ có phụ kiện (ACCESSORY_BUNDLES).
//  - 10% đơn nhiễu: 1–3 sản phẩm chọn ngẫu nhiên.

const { createRandom } = require("../../src/apps/services/mining/synthetic");
const { PRODUCTS, isPhone } = require("./catalog");

// Độ phổ biến tương đối khi khách mua điện thoại.
const PHONE_WEIGHTS = {
    "iphone-15": 14,
    "iphone-14-pro-max": 7,
    "iphone-14-plus": 4,
    "iphone-13": 7,
    "iphone-12": 3,
    "iphone-11": 3,
    "galaxy-s24-ultra": 12,
    "galaxy-s24-plus": 4,
    "galaxy-s23-ultra": 5,
    "galaxy-z-fold5": 2,
    "galaxy-z-flip5": 3,
    "galaxy-m34": 4,
    "galaxy-a05s": 5,
    "xiaomi-14-ultra": 2,
    "xiaomi-13t-pro": 3,
    "redmi-note-13-pro-plus": 6,
    "redmi-note-13-pro": 7,
    "oppo-reno10": 4,
    "oppo-a17k": 3,
    "vivo-v30e": 3,
    "vivo-y36": 3,
    "vivo-y18s": 2,
    "nokia-105-4g-pro": 3,
    "nokia-8210-4g": 2,
    "nokia-c21-plus": 2,
};

// P(phụ kiện | điện thoại). `after` nghĩa là chỉ xét khi phụ kiện kia đã có trong đơn
// (ví dụ khách mua ốp thì hay mua thêm kính cường lực).
const COMPANIONS = {
    "iphone-15": [
        { key: "op-lung-iphone-15", p: 0.75 },
        { key: "kinh-cuong-luc-iphone-15", p: 0.8, after: "op-lung-iphone-15" },
        { key: "kinh-cuong-luc-iphone-15", p: 0.25, unless: "op-lung-iphone-15" },
        { key: "cu-sac-usb-c-20w", p: 0.45 },
        { key: "cap-usb-c-apple-1m", p: 0.3 },
        { key: "airpods-2", p: 0.15 },
    ],
    "iphone-14-pro-max": [
        { key: "op-lung-iphone-14", p: 0.65 },
        { key: "cu-sac-usb-c-20w", p: 0.4 },
        { key: "airpods-2", p: 0.15 },
    ],
    "iphone-14-plus": [
        { key: "op-lung-iphone-14", p: 0.65 },
        { key: "cu-sac-usb-c-20w", p: 0.4 },
    ],
    "iphone-13": [
        { key: "cu-sac-usb-c-20w", p: 0.4 },
        { key: "airpods-2", p: 0.15 },
    ],
    "iphone-12": [{ key: "cu-sac-usb-c-20w", p: 0.35 }],
    "iphone-11": [{ key: "cu-sac-usb-c-20w", p: 0.35 }],
    "galaxy-s24-ultra": [
        { key: "op-lung-galaxy-s24-ultra", p: 0.7 },
        { key: "kinh-cuong-luc-galaxy-s24-ultra", p: 0.75, after: "op-lung-galaxy-s24-ultra" },
        { key: "kinh-cuong-luc-galaxy-s24-ultra", p: 0.2, unless: "op-lung-galaxy-s24-ultra" },
        { key: "cu-sac-samsung-45w", p: 0.45 },
        { key: "tai-nghe-samsung-ia500", p: 0.15 },
    ],
    "galaxy-s24-plus": [
        { key: "cu-sac-samsung-45w", p: 0.4 },
        { key: "tai-nghe-samsung-ia500", p: 0.2 },
    ],
    "galaxy-s23-ultra": [
        { key: "cu-sac-samsung-45w", p: 0.4 },
        { key: "tai-nghe-samsung-ia500", p: 0.2 },
    ],
    "galaxy-z-fold5": [{ key: "cu-sac-samsung-45w", p: 0.4 }],
    "galaxy-z-flip5": [{ key: "cu-sac-samsung-45w", p: 0.3 }],
    "galaxy-m34": [
        { key: "tai-nghe-samsung-ia500", p: 0.3 },
        { key: "cap-usb-c-samsung", p: 0.3 },
    ],
    "galaxy-a05s": [
        { key: "tai-nghe-samsung-ia500", p: 0.3 },
        { key: "cap-usb-c-samsung", p: 0.3 },
    ],
    "xiaomi-14-ultra": [{ key: "pin-xiaomi-10000-20w", p: 0.3 }],
    "xiaomi-13t-pro": [{ key: "pin-xiaomi-10000-20w", p: 0.3 }],
    "redmi-note-13-pro-plus": [
        { key: "op-lung-redmi-note-13", p: 0.65 },
        { key: "kinh-cuong-luc-redmi-note-13", p: 0.7, after: "op-lung-redmi-note-13" },
        { key: "pin-xiaomi-10000-20w", p: 0.3 },
    ],
    "redmi-note-13-pro": [
        { key: "op-lung-redmi-note-13", p: 0.65 },
        { key: "kinh-cuong-luc-redmi-note-13", p: 0.7, after: "op-lung-redmi-note-13" },
        { key: "pin-xiaomi-10000-20w", p: 0.3 },
    ],
    "oppo-reno10": [
        { key: "tai-nghe-sony-ex15", p: 0.25 },
        { key: "pin-xiaomi-10000-20w", p: 0.15 },
    ],
    "oppo-a17k": [{ key: "tai-nghe-sony-ex15", p: 0.25 }],
    "vivo-v30e": [
        { key: "tai-nghe-sony-ex15", p: 0.25 },
        { key: "pin-xiaomi-10000-20w", p: 0.15 },
    ],
    "vivo-y36": [{ key: "tai-nghe-sony-ex15", p: 0.25 }],
    "vivo-y18s": [{ key: "tai-nghe-sony-ex15", p: 0.25 }],
    "nokia-105-4g-pro": [{ key: "tai-nghe-sony-ex15", p: 0.1 }],
    "nokia-8210-4g": [{ key: "tai-nghe-sony-ex15", p: 0.1 }],
    "nokia-c21-plus": [{ key: "tai-nghe-sony-ex15", p: 0.1 }],
};

// Đơn chỉ có phụ kiện: chọn một gói theo trọng số, mỗi item phụ giữ lại theo xác suất.
const ACCESSORY_BUNDLES = [
    { weight: 5, base: "pin-samsung-20000-45w", extras: [{ key: "cap-usb-c-samsung", p: 0.6 }, { key: "cu-sac-samsung-45w", p: 0.25 }] },
    { weight: 4, base: "airpods-2", extras: [{ key: "cap-usb-c-apple-1m", p: 0.45 }] },
    { weight: 4, base: "pin-xiaomi-10000-20w", extras: [{ key: "cap-usb-c-samsung", p: 0.35 }] },
    { weight: 4, base: "cu-sac-usb-c-20w", extras: [{ key: "cap-usb-c-apple-1m", p: 0.65 }] },
    { weight: 3, base: "op-lung-iphone-15", extras: [{ key: "kinh-cuong-luc-iphone-15", p: 0.7 }] },
    { weight: 2, base: "tai-nghe-sony-ex15", extras: [] },
    { weight: 2, base: "tai-nghe-samsung-ia500", extras: [] },
];

/** Các luật được cài vào dữ liệu, dùng để đối chiếu khi đánh giá thuật toán. */
const PLANTED_RULES = [
    "iPhone 15 ⇒ Ốp lưng iPhone 15 (≈75%), Ốp lưng ⇒ Kính cường lực iPhone 15 (≈80%)",
    "iPhone 15 / 14 / 13 / 12 / 11 ⇒ Củ sạc USB-C 20W (35–45%)",
    "Củ sạc USB-C 20W ⇒ Cáp Apple USB-C (≈65% trong đơn phụ kiện)",
    "Galaxy S24 Ultra ⇒ Ốp lưng S24 Ultra (≈70%) ⇒ Kính cường lực S24 Ultra (≈75%), ⇒ Sạc Samsung 45W (≈45%)",
    "Redmi Note 13 Pro / Pro+ ⇒ Ốp lưng Redmi (≈65%) ⇒ Kính cường lực Redmi (≈70%)",
    "Pin Samsung 20.000mAh ⇒ Cáp Samsung USB-C (≈60%)",
    "AirPods 2 ⇒ Cáp Apple USB-C (≈45% trong đơn phụ kiện)",
    "Samsung tầm trung ⇒ Tai nghe Samsung IA500 / Cáp Samsung (≈30%)",
    "OPPO / Vivo ⇒ Tai nghe Sony EX15 (≈25%)",
];

function pickWeighted(random, entries) {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = random() * total;
    for (const [value, w] of entries) {
        r -= w;
        if (r < 0) return value;
    }
    return entries[entries.length - 1][0];
}

/**
 * @param {{count?: number, seed?: number, from?: string, to?: string}} options
 * @returns {{index: number, createdAt: Date, itemKeys: {key: string, qty: number}[]}[]}
 */
function generateOrderBaskets(options = {}) {
    const {
        count = 1000,
        seed = 20261026,
        from = "2026-04-01T00:00:00+07:00",
        to = "2026-10-25T23:59:59+07:00",
    } = options;
    if (!Number.isInteger(count) || count < 0) throw new RangeError("count phải là số nguyên không âm.");

    const random = createRandom(seed);
    const productByKey = new Map(PRODUCTS.map((p) => [p.key, p]));
    const phoneEntries = Object.entries(PHONE_WEIGHTS);
    const bundleEntries = ACCESSORY_BUNDLES.map((b) => [b, b.weight]);
    const start = new Date(from).getTime();
    const span = new Date(to).getTime() - start;

    const baskets = [];
    for (let index = 1; index <= count; index++) {
        const keys = new Set();
        const kind = random();

        if (kind < 0.55) {
            const phone = pickWeighted(random, phoneEntries);
            keys.add(phone);
            for (const rule of COMPANIONS[phone] || []) {
                if (rule.after && !keys.has(rule.after)) continue;
                if (rule.unless && keys.has(rule.unless)) continue;
                if (random() < rule.p) keys.add(rule.key);
            }
        } else if (kind < 0.9) {
            const bundle = pickWeighted(random, bundleEntries);
            keys.add(bundle.base);
            for (const extra of bundle.extras) if (random() < extra.p) keys.add(extra.key);
        } else {
            const size = 1 + Math.floor(random() * 3);
            while (keys.size < size) keys.add(PRODUCTS[Math.floor(random() * PRODUCTS.length)].key);
        }

        const itemKeys = [...keys].map((key) => ({
            key,
            // Điện thoại luôn mua 1 chiếc; phụ kiện thỉnh thoảng mua 2.
            qty: isPhone(productByKey.get(key)) ? 1 : random() < 0.1 ? 2 : 1,
        }));
        baskets.push({ index, createdAt: new Date(start + Math.floor(random() * span)), itemKeys });
    }
    // Sắp theo thời gian để dữ liệu giống lịch sử đặt hàng thật.
    baskets.sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
    return baskets;
}

module.exports = {
    PHONE_WEIGHTS,
    COMPANIONS,
    ACCESSORY_BUNDLES,
    PLANTED_RULES,
    generateOrderBaskets,
};
