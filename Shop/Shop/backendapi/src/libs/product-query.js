// Kiểm tra tham số của GET /products và dựng bộ lọc tìm kiếm an toàn.
//
// Tìm kiếm tiếng Việt có dấu/không dấu, không phân biệt hoa/thường, KHÔNG sửa dữ liệu cũ:
//   - Từ khóa được bỏ dấu ("Ốp lưng" -> "op lung"), tách thành các từ (tối đa MAX_TOKENS).
//   - Mỗi chữ cái có dấu được thay bằng một lớp ký tự gồm mọi biến thể dấu, hoa và thường
//     (a -> [aàáạảãâầấậẩẫăằắặẳẵAÀÁ...]); mọi ký tự khác được escape -> không có regex do người dùng viết.
//   - Sản phẩm phải chứa TẤT CẢ các từ (ở bất kỳ vị trí nào trong tên).
//   Giả định: tên sản phẩm lưu ở dạng Unicode dựng sẵn (NFC) — dạng thường gặp khi nhập từ bàn phím/JS.
const { badRequest } = require("./http-error");
const { escapeRegex, isObjectId } = require("./validate");
const { MAX_PRICE } = require("./pricing");

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;
const MAX_PAGE = 1000;
const MAX_KEYWORD = 100;
const MAX_TOKENS = 8;
const SORTS = Object.freeze(["newest", "price_asc", "price_desc", "name_asc", "name_desc"]);

const VARIANTS = {
    a: "aàáạảãâầấậẩẫăằắặẳẵ",
    e: "eèéẹẻẽêềếệểễ",
    i: "iìíịỉĩ",
    o: "oòóọỏõôồốộổỗơờớợởỡ",
    u: "uùúụủũưừứựửữ",
    y: "yỳýỵỷỹ",
    d: "dđ",
};
const CLASSES = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, `[${v}${v.toUpperCase()}]`]));

/** Bỏ dấu tiếng Việt và chuyển về chữ thường: "Điện THOẠI" -> "dien thoai". */
function foldVietnamese(text) {
    return String(text)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[đĐ]/g, "d")
        .toLowerCase();
}

/** Từ khóa -> danh sách RegExp (mỗi từ một biểu thức), hoặc [] nếu từ khóa rỗng. */
function keywordRegexes(keyword) {
    const tokens = foldVietnamese(keyword).split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);
    return tokens.map((token) => new RegExp([...token].map((ch) => CLASSES[ch] || escapeRegex(ch)).join(""), "i"));
}

/** Lấy một giá trị chuỗi từ query; mảng/đối tượng (vd. ?q[$ne]=1, ?q=a&q=b) -> 400. */
function single(query, names) {
    for (const name of names) {
        const v = query[name];
        if (v === undefined) continue;
        if (typeof v !== "string") throw badRequest(`Tham số ${name} không hợp lệ.`);
        if (v.trim() === "") continue;
        return { name, value: v.trim() };
    }
    return null;
}

function parseBool(param) {
    if (!param) return undefined;
    const v = param.value.toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    throw badRequest(`Tham số ${param.name} phải là true hoặc false.`);
}

function parseInteger(param, { min, max, clampMax = false }) {
    if (!param) return undefined;
    if (!/^\d{1,13}$/.test(param.value)) throw badRequest(`Tham số ${param.name} phải là số nguyên không âm.`);
    let n = Number(param.value);
    if (n > max && clampMax) n = max;
    if (n < min || n > max) throw badRequest(`Tham số ${param.name} phải nằm trong khoảng ${min} – ${max}.`);
    return n;
}

/**
 * Kiểm tra và chuẩn hóa query của GET /products. Tham số lạ bị bỏ qua (tương thích cũ).
 *   q (hoặc keyword, name)  từ khóa, tối đa 100 ký tự
 *   category_id             ObjectId
 *   min_price, max_price    giá BÁN (sau ưu đãi), số nguyên VND
 *   in_stock (hoặc is_stock) true -> chỉ sản phẩm còn hàng
 *   stock                   in | out | all — lọc tồn kho cho trang quản trị (out = chỉ sản phẩm hết hàng)
 *   is_featured (hoặc filter[is_featured]) true/false
 *   sort                    newest | price_asc | price_desc | name_asc | name_desc
 *   page                    1 .. 1000;  limit (hoặc pageSize) 1 .. 48, mặc định 12 (lớn hơn 48 -> 48)
 */
function parseProductQuery(query = {}) {
    const q = single(query, ["q", "keyword", "name"]);
    const keyword = q ? q.value.replace(/\s+/g, " ") : "";
    if (keyword.length > MAX_KEYWORD) throw badRequest(`Từ khóa tối đa ${MAX_KEYWORD} ký tự.`);

    const cat = single(query, ["category_id"]);
    if (cat && !isObjectId(cat.value)) throw badRequest("category_id không hợp lệ.");

    const minPrice = parseInteger(single(query, ["min_price"]), { min: 0, max: MAX_PRICE });
    const maxPrice = parseInteger(single(query, ["max_price"]), { min: 0, max: MAX_PRICE });
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw badRequest("Giá tối thiểu không được lớn hơn giá tối đa.");

    const stockParam = single(query, ["stock"]);
    if (stockParam && !["in", "out", "all"].includes(stockParam.value)) throw badRequest("stock phải là in, out hoặc all.");
    const inStock = parseBool(single(query, ["in_stock", "is_stock"])) === true || (stockParam && stockParam.value === "in") || false;
    const outOfStock = Boolean(stockParam && stockParam.value === "out");
    if (inStock && outOfStock) throw badRequest("Không thể lọc đồng thời còn hàng và hết hàng.");

    // Trang chủ cũ gửi filter[is_featured]=true (qs biến thành { filter: { is_featured: "true" } }).
    const legacyFilter = query.filter && typeof query.filter === "object" && !Array.isArray(query.filter) ? query.filter : {};
    const isFeatured = parseBool(single(query, ["is_featured"]) || single(legacyFilter, ["is_featured"]));

    const sortParam = single(query, ["sort"]);
    const sort = sortParam ? sortParam.value : "newest";
    if (!SORTS.includes(sort)) throw badRequest(`sort phải là một trong: ${SORTS.join(", ")}.`);

    const page = parseInteger(single(query, ["page"]), { min: 1, max: MAX_PAGE }) || 1;
    const limit = parseInteger(single(query, ["limit", "pageSize"]), { min: 1, max: MAX_LIMIT, clampMax: true }) || DEFAULT_LIMIT;

    return { keyword, categoryId: cat ? cat.value : null, minPrice, maxPrice, inStock, outOfStock, isFeatured, sort, page, limit };
}

/** Phần lọc làm được ngay trong MongoDB (tên, danh mục, tồn kho, nổi bật). Lọc theo giá làm sau khi tính giá bán. */
function mongoFilter(opts) {
    const filter = {};
    const regexes = keywordRegexes(opts.keyword);
    if (regexes.length) filter.$and = regexes.map((re) => ({ name: re }));
    if (opts.categoryId) filter.category_id = opts.categoryId;
    if (opts.inStock) filter.is_stock = { $ne: false }; // thiếu trường = còn hàng (mặc định của schema)
    if (opts.outOfStock) filter.is_stock = false;
    if (opts.isFeatured === true) filter.is_featured = true;
    if (opts.isFeatured === false) filter.is_featured = { $ne: true }; // thiếu trường = không nổi bật
    return filter;
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, MAX_PAGE, MAX_KEYWORD, SORTS, foldVietnamese, keywordRegexes, parseProductQuery, mongoFilter };
