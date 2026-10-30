// Đơn vị: quy tắc tính giá sau ưu đãi và dựng bộ lọc tìm kiếm (không cần MongoDB).
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMoney, productPricing } = require("../../src/libs/pricing");
const { foldVietnamese, keywordRegexes, parseProductQuery, mongoFilter } = require("../../src/libs/product-query");

test("parseMoney: chỉ chấp nhận số tiền nguyên không âm, cho phép dấu phân cách", () => {
    assert.equal(parseMoney("19990000"), 19990000);
    assert.equal(parseMoney("19.990.000"), 19990000);
    assert.equal(parseMoney(" 19 990 000 "), 19990000);
    assert.equal(parseMoney(500000), 500000);
    for (const bad of ["", "abc", "Tặng ốp lưng", "-500", "1e6", "12abc", null, undefined, NaN, -1, 1.5, Infinity, "99999999999999", {}]) {
        assert.equal(parseMoney(bad), null, `không hợp lệ: ${String(bad)}`);
    }
});

test("giá: không giảm, giảm hợp lệ, khuyến mại dạng chữ, dữ liệu hỏng không ra giá âm/NaN/>100%", () => {
    assert.deepEqual(productPricing({ price: "290000", promotion: "0" }), {
        original_price: 290000, final_price: 290000, discount_amount: 0, discount_percent: 0, has_discount: false, promotion_text: null,
    });
    assert.deepEqual(productPricing({ price: "19990000", promotion: "500000" }), {
        original_price: 19990000, final_price: 19490000, discount_amount: 500000, discount_percent: 3, has_discount: true, promotion_text: null,
    });
    // Quà tặng (chữ) không đổi giá, chỉ để hiển thị.
    const gift = productPricing({ price: "18500000", promotion: "Xạc dự phòng" });
    assert.equal(gift.final_price, 18500000);
    assert.equal(gift.has_discount, false);
    assert.equal(gift.promotion_text, "Xạc dự phòng");
    // Giảm >= giá gốc hoặc âm -> bỏ qua ưu đãi.
    for (const promotion of ["1000000", "2000000", "-100"]) {
        const p = productPricing({ price: "1000000", promotion });
        assert.equal(p.final_price, 1000000, promotion);
        assert.equal(p.has_discount, false, promotion);
    }
    // Phần trăm luôn trong 1..99.
    assert.equal(productPricing({ price: "1000000", promotion: "999999" }).discount_percent, 99);
    assert.equal(productPricing({ price: "1000000", promotion: "1" }).discount_percent, 1);
    // Giá gốc không hợp lệ -> không có giá bán (đơn hàng sẽ từ chối).
    for (const price of ["", "Liên hệ", "0", "-5", undefined]) {
        const p = productPricing({ price, promotion: "100" });
        assert.equal(p.final_price, null, String(price));
        assert.equal(p.has_discount, false);
    }
});

test("tìm kiếm: bỏ dấu, không phân biệt hoa/thường, escape ký tự đặc biệt", () => {
    assert.equal(foldVietnamese("Ốp LƯNG Điện thoại"), "op lung dien thoai");
    const names = ["Ốp lưng iPhone 15", "Kính cường lực Galaxy S24 Ultra", "Samsung Galaxy S24+ 256GB", "Củ sạc nhanh USB-C 20W", "IPHONE 13 (Đỏ)"];
    const find = (kw) => names.filter((n) => keywordRegexes(kw).every((re) => re.test(n)));
    assert.deepEqual(find("op lung"), ["Ốp lưng iPhone 15"]);
    assert.deepEqual(find("ỐP LƯNG"), ["Ốp lưng iPhone 15"]);
    assert.deepEqual(find("cuong luc"), ["Kính cường lực Galaxy S24 Ultra"]);
    assert.deepEqual(find("iphone"), ["Ốp lưng iPhone 15", "IPHONE 13 (Đỏ)"]);
    assert.deepEqual(find("do"), ["IPHONE 13 (Đỏ)"], "đ khớp với d");
    assert.deepEqual(find("S24+"), ["Samsung Galaxy S24+ 256GB"], "dấu + là ký tự thường");
    assert.deepEqual(find("(Đỏ)"), ["IPHONE 13 (Đỏ)"]);
    assert.deepEqual(find("usb-c 20w"), ["Củ sạc nhanh USB-C 20W"]);
    assert.deepEqual(find(".*"), [], ".* không phải regex");
    assert.deepEqual(find("galaxy ultra"), ["Kính cường lực Galaxy S24 Ultra"], "phải chứa mọi từ");
    // Không có từ khóa nào gây backtracking: không có lượng từ trong biểu thức.
    for (const re of keywordRegexes("a+b*c?(d){2}[e]|f\\g$")) assert.ok(!/[*+?{]/.test(re.source.replace(/\\./g, "")), re.source);
});

test("tham số GET /products: mặc định, giới hạn và báo lỗi", () => {
    const d = parseProductQuery({});
    assert.deepEqual(d, { keyword: "", categoryId: null, minPrice: undefined, maxPrice: undefined, inStock: false, outOfStock: false, isFeatured: undefined, sort: "newest", page: 1, limit: 12 });
    assert.equal(parseProductQuery({ limit: "1000" }).limit, 48, "pageSize bị giới hạn 48");
    assert.equal(parseProductQuery({ keyword: "  iphone   15 " }).keyword, "iphone 15", "nhận cả tên tham số cũ keyword");
    assert.equal(parseProductQuery({ filter: { is_featured: "true" } }).isFeatured, true, "tham số cũ filter[is_featured]");
    assert.equal(parseProductQuery({ in_stock: "1" }).inStock, true);
    const bad = [
        { page: "0" }, { page: "-1" }, { page: "abc" }, { page: "1001" }, { limit: "0" }, { limit: "2.5" },
        { sort: "price" }, { sort: "$where" }, { min_price: "-1" }, { max_price: "1e9" }, { min_price: "500", max_price: "100" },
        { category_id: "abc" }, { q: ["a", "b"] }, { q: { $ne: "" } }, { q: "x".repeat(101) }, { in_stock: "maybe" },
    ];
    for (const query of bad) assert.throws(() => parseProductQuery(query), (e) => e.status === 400, JSON.stringify(query));
    const f = mongoFilter(parseProductQuery({ q: "op", category_id: "a".repeat(24), in_stock: "true", is_featured: "false" }));
    assert.equal(f.$and.length, 1);
    assert.equal(f.category_id, "a".repeat(24));
    assert.deepEqual(f.is_stock, { $ne: false });
    assert.deepEqual(f.is_featured, { $ne: true });
});
