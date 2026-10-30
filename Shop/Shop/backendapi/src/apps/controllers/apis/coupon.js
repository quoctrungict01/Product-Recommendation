// Quản trị mã giảm giá — CHỈ ADMIN (router đặt requireAdmin). Xem trước mã ở checkout: controllers/apis/order.js.
// Không có API xóa: mã đã dùng phải được giữ lại để đối chiếu đơn hàng; admin vô hiệu hóa thay vì xóa.
const CouponModel = require("../../models/coupon");
const { badRequest, notFound, conflict } = require("../../../libs/http-error");
const { assertObjectId, escapeRegex } = require("../../../libs/validate");
const { validateCouponBody, couponState } = require("../../../libs/coupon");

const STATES = ["active", "scheduled", "expired", "used_up", "disabled"];

const view = (c, now = new Date()) => ({
    _id: String(c._id),
    code: c.code,
    description: c.description || "",
    type: c.type,
    value: c.value,
    min_order: c.min_order || 0,
    max_discount: c.max_discount ?? null,
    starts_at: c.starts_at || null,
    ends_at: c.ends_at || null,
    usage_limit: c.usage_limit ?? null,
    used_count: c.used_count || 0,
    is_active: c.is_active !== false,
    state: couponState(c, now),
    createdAt: c.createdAt || null,
    updatedAt: c.updatedAt || null,
});

function intParam(query, name, def, max) {
    const v = query[name];
    if (v === undefined || v === "") return def;
    if (typeof v !== "string" || !/^\d{1,6}$/.test(v) || Number(v) < 1) throw badRequest(`Tham số ${name} phải là số nguyên dương.`);
    return Math.min(Number(v), max);
}

/** GET /coupons/admin?page=&limit=&q=&state= — mới nhất trước. state lọc sau khi tính trạng thái hiển thị. */
exports.list = async (req, res) => {
    const page = intParam(req.query, "page", 1, 10000);
    const limit = intParam(req.query, "limit", 20, 50);
    const q = typeof req.query.q === "string" ? req.query.q.trim().toUpperCase().slice(0, 30) : "";
    if (req.query.q !== undefined && typeof req.query.q !== "string") throw badRequest("Tham số q không hợp lệ.");
    const state = req.query.state || "";
    if (state && !STATES.includes(state)) throw badRequest(`state phải là một trong: ${STATES.join(", ")}.`);
    const filter = q ? { code: new RegExp(escapeRegex(q)) } : {};
    // Số mã giảm giá của một cửa hàng nhỏ (vài trăm) -> lọc trạng thái trong bộ nhớ là đủ và chính xác theo giờ hiện tại.
    const now = new Date();
    let docs = (await CouponModel.find(filter).sort({ _id: -1 }).lean()).map((c) => view(c, now));
    if (state) docs = docs.filter((c) => c.state === state);
    const total = docs.length;
    res.status(200).json({
        status: "success",
        data: { docs: docs.slice((page - 1) * limit, page * limit), total, page, limit, totalPages: Math.ceil(total / limit) },
    });
};

exports.show = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const coupon = await CouponModel.findById(id).lean();
    if (!coupon) throw notFound("Không tìm thấy mã giảm giá.");
    res.status(200).json({ status: "success", data: view(coupon) });
};

exports.create = async (req, res) => {
    const data = validateCouponBody(req.body);
    if (await CouponModel.exists({ code: data.code })) throw conflict(`Mã "${data.code}" đã tồn tại.`);
    const coupon = await new CouponModel({ ...data, used_count: 0 }).save();
    res.status(201).json({ status: "success", message: `Đã tạo mã "${data.code}".`, data: view(coupon.toObject ? coupon.toObject() : coupon) });
};

/** PUT /coupons/admin/:id — sửa điều kiện. Không sửa được used_count; mã đã dùng không đổi được code. */
exports.update = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const current = await CouponModel.findById(id).lean();
    if (!current) throw notFound("Không tìm thấy mã giảm giá.");
    const data = validateCouponBody(req.body, current);
    if (data.code !== current.code && (await CouponModel.exists({ code: data.code, _id: { $ne: id } }))) throw conflict(`Mã "${data.code}" đã tồn tại.`);
    // Điều kiện used_count <= usage_limit mới được kiểm tra lại ngay lúc ghi (tránh đè lên lượt vừa dùng).
    const filter = { _id: id };
    if (data.usage_limit !== null) filter.used_count = { $lte: data.usage_limit };
    const updated = await CouponModel.findOneAndUpdate(filter, { $set: data }, { new: true, runValidators: true }).lean();
    if (!updated) throw conflict("Số lượt đã dùng vừa vượt giới hạn mới. Vui lòng tải lại.");
    res.status(200).json({ status: "success", message: `Đã cập nhật mã "${updated.code}".`, data: view(updated) });
};

/** PATCH /coupons/admin/:id/status { is_active } — bật/vô hiệu hóa. */
exports.setStatus = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.is_active !== "boolean" || Object.keys(body).length !== 1) throw badRequest("Chỉ gửi { is_active: true | false }.");
    const updated = await CouponModel.findOneAndUpdate({ _id: id }, { $set: { is_active: body.is_active } }, { new: true }).lean();
    if (!updated) throw notFound("Không tìm thấy mã giảm giá.");
    res.status(200).json({ status: "success", message: body.is_active ? `Đã bật mã "${updated.code}".` : `Đã vô hiệu hóa mã "${updated.code}".`, data: view(updated) });
};
