const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const ProductModel = require("../../models/product");
const CategoryModel = require("../../models/category");
const CommentModel = require("../../models/comment");
const OrderModel = require("../../models/order");
const pagination = require("../../../libs/pagination");
const { badRequest, notFound, conflict } = require("../../../libs/http-error");
const { validateProductBody, sameNameFilter } = require("../../../libs/product-input");
const { assertObjectId, requiredString } = require("../../../libs/validate");
const { withPricing } = require("../../../libs/pricing");
const { parseProductQuery, mongoFilter } = require("../../../libs/product-query");

// Danh sách không cần mô tả dài (details) — trang chi tiết lấy qua GET /products/:id.
const LIST_PROJECTION = "-details";
const nameCollator = new Intl.Collator("vi", { sensitivity: "base", numeric: true });
const DB_SORTS = {
    newest: { _id: -1 },
    name_asc: { name: 1, _id: -1 },
    name_desc: { name: -1, _id: -1 },
};

function pageInfo(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    return { totalRows: total, totalPages, currentPage: page, next: page + 1, prev: page - 1, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** Sắp xếp trong bộ nhớ (dùng khi lọc/sắp theo giá bán — giá lưu dạng chuỗi nên MongoDB không so sánh số được). */
function compareProducts(sort) {
    const byNewest = (a, b) => (String(a._id) < String(b._id) ? 1 : String(a._id) > String(b._id) ? -1 : 0);
    if (sort === "price_asc" || sort === "price_desc") {
        const dir = sort === "price_asc" ? 1 : -1;
        return (a, b) => {
            if (a.final_price === null || b.final_price === null) return (a.final_price === null) - (b.final_price === null) || byNewest(a, b);
            return (a.final_price - b.final_price) * dir || byNewest(a, b);
        };
    }
    if (sort === "name_asc" || sort === "name_desc") {
        const dir = sort === "name_asc" ? 1 : -1;
        return (a, b) => nameCollator.compare(a.name || "", b.name || "") * dir || byNewest(a, b);
    }
    return byNewest;
}

/**
 * GET /products — tìm kiếm + lọc + sắp xếp + phân trang ở backend (tham số: xem libs/product-query.js).
 * Mặc định trả MỌI sản phẩm (kể cả hết hàng/không nổi bật), mới nhất trước, 12 sản phẩm/trang.
 * Mỗi sản phẩm kèm original_price, final_price, discount_amount, discount_percent, has_discount, promotion_text.
 */
exports.index = async (req, res) => {
    const opts = parseProductQuery(req.query);
    const filter = mongoFilter(opts);
    const { page, limit, sort } = opts;
    const byPrice = opts.minPrice !== undefined || opts.maxPrice !== undefined || sort.startsWith("price_");
    let total;
    let docs;
    if (!byPrice) {
        // Lọc, đếm và cắt trang ngay trong MongoDB.
        let cursor = ProductModel.find(filter, LIST_PROJECTION);
        if (sort.startsWith("name_")) cursor = cursor.collation({ locale: "vi", strength: 1, numericOrdering: true }); // thứ tự chữ cái tiếng Việt
        [total, docs] = await Promise.all([
            ProductModel.countDocuments(filter),
            cursor
                .sort(DB_SORTS[sort])
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
        docs = docs.map(withPricing);
    } else {
        // Lọc theo tên/danh mục/tồn kho trong MongoDB, chỉ lấy trường gọn; tính giá bán rồi lọc/sắp/cắt trang ở backend.
        const candidates = (await ProductModel.find(filter, LIST_PROJECTION).lean()).map(withPricing);
        const matched = candidates.filter((p) => {
            if (opts.minPrice === undefined && opts.maxPrice === undefined) return true;
            if (p.final_price === null) return false;
            return (opts.minPrice === undefined || p.final_price >= opts.minPrice) && (opts.maxPrice === undefined || p.final_price <= opts.maxPrice);
        });
        matched.sort(compareProducts(sort));
        total = matched.length;
        docs = matched.slice((page - 1) * limit, page * limit);
    }
    const pages = pageInfo(total, page, limit);
    res.status(200).json({
        status: "success",
        filter: {
            q: opts.keyword,
            category_id: opts.categoryId,
            min_price: opts.minPrice ?? null,
            max_price: opts.maxPrice ?? null,
            in_stock: opts.inStock,
            stock: opts.outOfStock ? "out" : opts.inStock ? "in" : "all",
            is_featured: opts.isFeatured ?? null,
            sort,
            page,
            limit,
        },
        data: { docs, total, page, limit, totalPages: pages.totalPages },
        pages, // định dạng cũ, component Pagination của Shop đang dùng
    });
};

exports.show = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const product = await ProductModel.findById(id);
    if (!product) throw notFound("Không tìm thấy sản phẩm.");
    res.status(200).json({
        status: "success",
        data: withPricing(product),
    });
};

exports.comments = async (req, res) => {
    const query = {};
    query.product_id = assertObjectId(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = page * limit - limit;
    const comments = await CommentModel.find(query, "-email") // không lộ email người bình luận ra API công khai
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit);
    res.status(200).json({
        status: "success",
        filter: { page, limit },
        data: { docs: comments },
        pages: await pagination(CommentModel, query, limit, page),
    });
};

// Bình luận: CHỈ người đã đăng nhập (router đặt requireAuth). Tên và email lấy từ tài khoản,
// không lấy từ form, nên không thể bình luận dưới danh nghĩa người khác.
exports.storeComments = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const content = requiredString((req.body || {}).content, "Nội dung bình luận", { max: 1000 });
    if (!(await ProductModel.exists({ _id: id }))) throw notFound("Không tìm thấy sản phẩm.");
    const comments = {
        name: req.user.full_name || req.user.email.split("@")[0],
        email: req.user.email,
        content,
        product_id: id,
    };
    await new CommentModel(comments).save();
    res.status(201).json({
        status: "success",
        mesage: "create comment succsessfully",
    });
};

exports.deleteComment = async (req, res) => {
    const commentId = assertObjectId(req.params.commentId, "commentId");
    const deletedComment = await CommentModel.findByIdAndRemove(commentId);
    if (!deletedComment) {
        return res.status(404).json({ status: "error", message: "Comment not found." });
    }
    // Chỉ trả mã bình luận: không lộ email người bình luận.
    res.status(200).json({
        status: "success",
        message: "Comment deleted successfully.",
        data: { _id: String(deletedComment._id) },
    });
};

// GET /categories/:id/products — giữ nguyên định dạng cũ (toàn bộ sản phẩm của danh mục), có thêm trường giá.
// Shop dùng GET /products?category_id=... để có phân trang/lọc.
exports.getProductsByCategoryId = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const products = await ProductModel.find({ category_id: id }).sort({ _id: -1 });
    res.status(200).json({
        status: "success",
        data: { docs: products.map(withPricing) },
    });
};

//create products — CHỈ ADMIN. Body JSON, xem libs/product-input.js.
exports.addProduct = async (req, res) => {
    const data = validateProductBody(req.body);
    if (!(await CategoryModel.exists({ _id: data.category_id }))) throw badRequest("Danh mục không tồn tại.", { field: "category_id" });
    if (await ProductModel.exists(sameNameFilter(data.name))) throw conflict("Đã có sản phẩm cùng tên.");
    const product = await new ProductModel(data).save();
    res.status(201).json({
        status: "success",
        message: "Đã thêm sản phẩm.",
        data: withPricing(product),
    });
};

//update product — CHỈ ADMIN. Không gửi is_stock/is_featured -> giữ giá trị đang có.
exports.updateProduct = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const product = await ProductModel.findById(id);
    if (!product) throw notFound("Không tìm thấy sản phẩm.");
    const data = validateProductBody(req.body, product);
    if (!(await CategoryModel.exists({ _id: data.category_id }))) throw badRequest("Danh mục không tồn tại.", { field: "category_id" });
    if (await ProductModel.exists(sameNameFilter(data.name, id))) throw conflict("Đã có sản phẩm khác cùng tên.");
    Object.assign(product, data);
    await product.save();
    res.status(200).json({
        status: "success",
        message: "Đã cập nhật sản phẩm.",
        data: withPricing(product),
    });
};

// Delete product — CHỈ ADMIN.
// Sản phẩm đã xuất hiện trong đơn hàng thì KHÔNG xóa (giữ lịch sử đơn và dữ liệu khai phá luật kết hợp);
// admin chuyển sang "Hết hàng" để ngừng bán. Xóa được thì xóa luôn bình luận của sản phẩm (tránh dữ liệu mồ côi).
exports.deleteProduct = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const product = await ProductModel.findById(id, "name");
    if (!product) throw notFound("Không tìm thấy sản phẩm.");
    const orderCount = await OrderModel.countDocuments({ "items.prd_id": id });
    if (orderCount > 0) {
        throw conflict(`Không thể xóa "${product.name}": sản phẩm đã có trong ${orderCount} đơn hàng. Hãy chuyển sang "Hết hàng" để ngừng bán.`);
    }
    await ProductModel.findByIdAndDelete(id);
    const { deletedCount } = await CommentModel.deleteMany({ product_id: id });
    res.status(200).json({
        status: "success",
        message: "Đã xóa sản phẩm.",
        data: { _id: id, name: product.name, deletedComments: deletedCount || 0 },
    });
};

// Upload ảnh — CHỈ ADMIN. multipart/form-data, trường "image"; JPG/PNG/WEBP/GIF tối đa 2 MB.
// Kiểm tra nội dung file (magic bytes) chứ không tin đuôi file/Content-Type; tên file do server sinh ngẫu nhiên.
const IMAGE_TYPES = [
    { ext: ".jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { ext: ".png", test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { ext: ".gif", test: (b) => b.slice(0, 4).toString("latin1") === "GIF8" },
    { ext: ".webp", test: (b) => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP" },
];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const imageDir = () => process.env.PRODUCT_IMAGE_DIR || path.join(__dirname, "../../../public/images/products");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 } }).single("image");

exports.uploadImage = (req, res, next) => {
    upload(req, res, async (err) => {
        try {
            if (err) {
                if (err.code === "LIMIT_FILE_SIZE") throw badRequest("Ảnh tối đa 2 MB.");
                throw badRequest("Không đọc được file tải lên (chỉ nhận một file ở trường image).");
            }
            if (!req.file || !req.file.buffer || !req.file.buffer.length) throw badRequest("Chưa chọn file ảnh.");
            const type = IMAGE_TYPES.find((t) => t.test(req.file.buffer));
            if (!type) throw badRequest("Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF.");
            const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${type.ext}`;
            const dir = imageDir();
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(path.join(dir, name), req.file.buffer, { flag: "wx" });
            res.status(201).json({ status: "success", message: "Đã tải ảnh lên.", data: { image: name } });
        } catch (e) {
            next(e);
        }
    });
};
