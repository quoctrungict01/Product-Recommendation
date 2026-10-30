// Danh mục. Công khai: xem danh sách/chi tiết. CHỈ ADMIN (router đặt requireAdmin): tạo, sửa, xóa.
const CategoryModel = require("../../models/category");
const ProductModel = require("../../models/product");
const { notFound, conflict, badRequest } = require("../../../libs/http-error");
const { assertObjectId } = require("../../../libs/validate");
const { validateCategoryName, sameNameFilter } = require("../../../libs/product-input");

const DEFAULT_LIMIT = 12; // giữ như cũ: menu của Shop gọi không kèm tham số
const MAX_LIMIT = 100;

function positiveInt(value, name, { def, max, clamp = false }) {
    if (value === undefined || value === "") return def;
    if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) throw badRequest(`Tham số ${name} phải là số nguyên dương.`);
    const n = Number(value);
    if (n < 1) throw badRequest(`Tham số ${name} phải là số nguyên dương.`);
    if (n > max) {
        if (clamp) return max;
        throw badRequest(`Tham số ${name} tối đa ${max}.`);
    }
    return n;
}

/**
 * GET /categories?page=&limit=&with_counts=1
 * Mới nhất trước (như cũ). Trả thêm data.total/page/limit/totalPages; with_counts=1 -> kèm product_count mỗi danh mục.
 */
exports.index = async (req, res) => {
    const page = positiveInt(req.query.page, "page", { def: 1, max: 10000 });
    const limit = positiveInt(req.query.limit, "limit", { def: DEFAULT_LIMIT, max: MAX_LIMIT, clamp: true });
    const [total, categories] = await Promise.all([
        CategoryModel.countDocuments({}),
        CategoryModel.find()
            .sort({ _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
    ]);
    let docs = categories;
    if (req.query.with_counts === "1" || req.query.with_counts === "true") {
        const counts = await Promise.all(categories.map((c) => ProductModel.countDocuments({ category_id: c._id })));
        docs = categories.map((c, i) => ({ ...c, product_count: counts[i] }));
    }
    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
        status: "success",
        filter: { page, limit },
        data: { docs, total, page, limit, totalPages },
        pages: { totalRows: total, totalPages, currentPage: page, next: page + 1, prev: page - 1, hasNext: page < totalPages, hasPrev: page > 1 },
    });
};

//get by id
exports.show = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const category = await CategoryModel.findById(id);
    if (!category) throw notFound("Không tìm thấy danh mục.");
    res.status(200).json({
        status: "success",
        data: category,
    });
};

//Create — body { name } (vẫn nhận cat_name của form cũ)
exports.create = async (req, res) => {
    const name = validateCategoryName(req.body);
    if (await CategoryModel.exists(sameNameFilter(name))) throw conflict(`Danh mục "${name}" đã tồn tại.`);
    const category = await CategoryModel.create({ name });
    res.status(201).json({
        status: "success",
        message: "Đã thêm danh mục.",
        data: category,
    });
};

// Update — chỉ đổi tên; _id giữ nguyên nên category_id của các sản phẩm vẫn đúng.
exports.update = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const name = validateCategoryName(req.body);
    if (!(await CategoryModel.exists({ _id: id }))) throw notFound("Không tìm thấy danh mục.");
    if (await CategoryModel.exists(sameNameFilter(name, id))) throw conflict(`Danh mục "${name}" đã tồn tại.`);
    const category = await CategoryModel.findByIdAndUpdate(id, { $set: { name } }, { new: true, runValidators: true });
    res.status(200).json({
        status: "success",
        message: "Đã cập nhật danh mục.",
        data: category,
    });
};

// Delete — từ chối nếu còn sản phẩm thuộc danh mục (tránh sản phẩm mồ côi, category_id trỏ vào hư không).
exports.delete = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const category = await CategoryModel.findById(id);
    if (!category) throw notFound("Không tìm thấy danh mục.");
    const productCount = await ProductModel.countDocuments({ category_id: id });
    if (productCount > 0) {
        throw conflict(`Không thể xóa danh mục "${category.name}" vì còn ${productCount} sản phẩm. Hãy chuyển các sản phẩm sang danh mục khác trước.`);
    }
    await CategoryModel.findByIdAndDelete(id);
    res.status(200).json({
        status: "success",
        message: "Đã xóa danh mục.",
        data: { _id: id, name: category.name },
    });
};
