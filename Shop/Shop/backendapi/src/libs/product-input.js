// Kiểm tra dữ liệu tạo/sửa sản phẩm và danh mục do Admin gửi (JSON).
// Trả về object đã chuẩn hóa đúng kiểu của schema; sai -> HttpError 400 có thông báo tiếng Việt.
const { badRequest } = require("./http-error");
const { isObjectId, escapeRegex } = require("./validate");
const { parseMoney, MAX_PRICE } = require("./pricing");

const IMAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,199}$/; // tên file/đường dẫn tương đối trong public/images/products

function text(body, field, label, { max, required = true }) {
    const raw = body[field];
    if (raw === undefined || raw === null || raw === "") {
        if (required) throw badRequest(`${label} là bắt buộc.`, { field });
        return "";
    }
    if (typeof raw !== "string" && typeof raw !== "number") throw badRequest(`${label} không hợp lệ.`, { field });
    const value = String(raw).trim();
    if (required && !value) throw badRequest(`${label} là bắt buộc.`, { field });
    if (value.length > max) throw badRequest(`${label} tối đa ${max} ký tự.`, { field });
    return value;
}

/**
 * Cờ true/false (JSON boolean hoặc "true"/"false"/"1"/"0" từ form). Thiếu/rỗng -> fallback; khác -> 400.
 * Thay cho `is_stock || true` cũ — giá trị false trước đây không bao giờ lưu được.
 */
function flag(value, name, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === true || value === false) return value;
    const v = String(value).trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    throw badRequest(`${name} phải là true hoặc false.`, { field: name });
}

/**
 * Sản phẩm. Trường:
 *   name, category_id (hoặc cat_id — tên cũ của form Admin), image, price (giá gốc, số nguyên VND),
 *   promotion — số tiền giảm ("0" = không giảm, phải nhỏ hơn giá gốc) HOẶC chữ mô tả quà tặng,
 *   status (tình trạng máy), accessories, details, is_stock, is_featured.
 * @param {object} current  sản phẩm đang sửa (để giữ cờ khi không gửi), hoặc null khi tạo mới
 */
function validateProductBody(body, current = null) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Thiếu dữ liệu sản phẩm.");
    const name = text(body, "name", "Tên sản phẩm", { max: 200 });
    const categoryId = String(body.category_id ?? body.cat_id ?? "").trim();
    if (!categoryId) throw badRequest("Danh mục là bắt buộc.", { field: "category_id" });
    if (!isObjectId(categoryId)) throw badRequest("Danh mục không hợp lệ.", { field: "category_id" });
    const image = text(body, "image", "Ảnh sản phẩm", { max: 200 });
    if (!IMAGE_RE.test(image) || image.includes("..") || image.includes("//")) throw badRequest("Tên file ảnh không hợp lệ.", { field: "image" });

    const price = parseMoney(body.price);
    if (price === null || price < 1) throw badRequest(`Giá gốc phải là số nguyên từ 1 đến ${MAX_PRICE.toLocaleString("vi-VN")} đ.`, { field: "price" });

    const promotionRaw = text(body, "promotion", "Khuyến mại", { max: 200, required: false }) || "0";
    const discount = parseMoney(promotionRaw);
    if (discount === null && /^[\d\s.,+-]+$/.test(promotionRaw)) throw badRequest("Số tiền giảm phải là số nguyên không âm.", { field: "promotion" });
    if (discount !== null && discount >= price) throw badRequest("Số tiền giảm phải nhỏ hơn giá gốc.", { field: "promotion" });
    // Lưu số tiền giảm dạng chữ số thuần (cùng định dạng dữ liệu demo); chữ (quà tặng) giữ nguyên.
    const promotion = discount !== null ? String(discount) : promotionRaw;

    return {
        name,
        category_id: categoryId,
        image,
        price: String(price),
        promotion,
        status: text(body, "status", "Tình trạng", { max: 100 }),
        accessories: text(body, "accessories", "Phụ kiện đi kèm", { max: 300 }),
        details: text(body, "details", "Mô tả", { max: 5000 }),
        is_stock: flag(body.is_stock, "is_stock", current ? current.is_stock !== false : true),
        is_featured: flag(body.is_featured, "is_featured", current ? current.is_featured === true : false),
    };
}

/** Tên danh mục: bắt buộc, 1..100 ký tự sau khi bỏ khoảng trắng thừa. */
function validateCategoryName(body) {
    const raw = body && (body.name ?? body.cat_name);
    if (typeof raw !== "string" || !raw.trim()) throw badRequest("Tên danh mục là bắt buộc.", { field: "name" });
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length > 100) throw badRequest("Tên danh mục tối đa 100 ký tự.", { field: "name" });
    return name;
}

/** Bộ lọc tìm tên trùng, không phân biệt hoa/thường (tùy chọn loại trừ chính bản ghi đang sửa). */
function sameNameFilter(name, exceptId) {
    const filter = { name: new RegExp(`^${escapeRegex(name)}$`, "i") };
    if (exceptId) filter._id = { $ne: exceptId };
    return filter;
}

module.exports = { validateProductBody, validateCategoryName, sameNameFilter, flag };
