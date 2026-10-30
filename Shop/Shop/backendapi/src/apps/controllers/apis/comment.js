// Quản lý bình luận — CHỈ ADMIN (router đặt requireAdmin).
//   GET    /comments/admin          danh sách: phân trang, tìm theo tên/nội dung (không phân biệt dấu), lọc theo sản phẩm
//   DELETE /comments/admin/:id      xóa một bình luận
//
// Không trả email người bình luận (admin không cần để kiểm duyệt). Bình luận của sản phẩm đã bị xóa hoặc dữ liệu cũ
// có product_id không hợp lệ vẫn hiện, với product = null và product_missing = true.
const CommentModel = require("../../models/comment");
const ProductModel = require("../../models/product");
const { notFound, badRequest } = require("../../../libs/http-error");
const { assertObjectId, isObjectId } = require("../../../libs/validate");
const { keywordRegexes } = require("../../../libs/product-query");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_KEYWORD = 100;

function str(query, name) {
    const v = query[name];
    if (v === undefined) return "";
    if (typeof v !== "string") throw badRequest(`Tham số ${name} không hợp lệ.`);
    return v.trim();
}

function parseListQuery(query = {}) {
    const page = Math.min(1000, Math.max(1, parseInt(str(query, "page"), 10) || 1));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(str(query, "limit"), 10) || DEFAULT_LIMIT));
    const q = str(query, "q");
    if (q.length > MAX_KEYWORD) throw badRequest(`Từ khóa tối đa ${MAX_KEYWORD} ký tự.`);
    const productId = str(query, "product_id");
    if (productId && !isObjectId(productId)) throw badRequest("product_id không hợp lệ.");
    const filter = {};
    // Mỗi từ phải xuất hiện trong tên người bình luận HOẶC nội dung.
    const regexes = keywordRegexes(q);
    if (regexes.length) filter.$and = regexes.map((r) => ({ $or: [{ name: r }, { content: r }] }));
    if (productId) filter.product_id = productId;
    return { page, limit, skip: (page - 1) * limit, q, productId, filter };
}

/** Dữ liệu trả cho admin: không có email. */
function adminComment(c, productsById) {
    const pid = c.product_id === undefined || c.product_id === null ? null : String(c.product_id);
    const p = pid ? productsById.get(pid) : null;
    return {
        _id: String(c._id),
        name: typeof c.name === "string" && c.name.trim() ? c.name : "(không rõ tên)",
        content: typeof c.content === "string" ? c.content : "",
        createdAt: c.createdAt || null,
        product_id: pid,
        product: p ? { _id: String(p._id), name: p.name, image: p.image || null } : null,
        product_missing: !p,
    };
}

exports.list = async (req, res) => {
    const { page, limit, skip, q, productId, filter } = parseListQuery(req.query);
    const [docs, total] = await Promise.all([
        CommentModel.find(filter, "-email").sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        CommentModel.countDocuments(filter),
    ]);
    const ids = [...new Set(docs.map((c) => String(c.product_id)).filter(isObjectId))];
    const products = ids.length ? await ProductModel.find({ _id: { $in: ids } }, { name: 1, image: 1 }).lean() : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    res.status(200).json({
        status: "success",
        filter: { page, limit, q, product_id: productId || null },
        data: { docs: docs.map((c) => adminComment(c, byId)), total, totalPages: Math.ceil(total / limit), page, limit },
    });
};

exports.remove = async (req, res) => {
    const id = assertObjectId(req.params.id, "Mã bình luận");
    const deleted = await CommentModel.findByIdAndDelete(id, { projection: { _id: 1 } });
    if (!deleted) throw notFound("Không tìm thấy bình luận (có thể đã bị xóa).");
    res.status(200).json({ status: "success", message: "Đã xóa bình luận.", data: { _id: id } });
};

exports.parseListQuery = parseListQuery;
