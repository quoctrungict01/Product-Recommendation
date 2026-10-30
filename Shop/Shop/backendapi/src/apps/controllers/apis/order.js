// Đơn hàng.
//  - POST /order: CÔNG KHAI (khách chưa đăng nhập vẫn đặt được). Dữ liệu được kiểm tra; giá và tổng tiền
//    lấy từ DB (không tin giá do trình duyệt gửi) = giá bán SAU ưu đãi (libs/pricing.js);
//    sản phẩm không tồn tại/hết hàng/chưa có giá hợp lệ bị từ chối.
//    Có JWT hợp lệ -> đơn gắn user_id của tài khoản đó; user_id trong body luôn bị bỏ qua.
//  - GET /order/my: THÀNH VIÊN, chỉ đơn có user_id = người đang đăng nhập (đơn demo cũ không có user_id).
//  - GET /order/getAll, GET /order/topProductPairs: CHỈ ADMIN (router đặt requireAdmin).
//  - GET /order/admin, GET /order/admin/:id, PATCH /order/admin/:id/status: CHỈ ADMIN (đợt 4) — danh sách
//    phân trang/tìm kiếm/lọc, chi tiết và đổi trạng thái theo libs/order-status.js.
const OrderModel = require("../../models/order");
const ProductModel = require("../../models/product");
const UserModel = require("../../models/user");
const { ORDER_STATUSES } = require("../../models/order");
const { HttpError, badRequest, notFound, conflict } = require("../../../libs/http-error");
const { currentStatus, nextStatuses, canTransition, statusFilter, LABELS } = require("../../../libs/order-status");
const { keywordRegexes } = require("../../../libs/product-query");
const { escapeRegex, assertObjectId } = require("../../../libs/validate");
const { productPricing } = require("../../../libs/pricing");
const CouponModel = require("../../models/coupon");
const { CODE_RE, normalizeCode, couponDiscount, couponProblem } = require("../../../libs/coupon");
const { requiredString, validateEmail, validatePhone, validateAddress, formatAddress, isObjectId } = require("../../../libs/validate");

const MAX_ITEMS = 50;
const MAX_QTY = 99;

/** Giá bán cuối cùng của sản phẩm (sau ưu đãi hợp lệ), hoặc NaN nếu sản phẩm chưa có giá hợp lệ. */
function productPrice(product) {
    const { final_price: price } = productPricing(product);
    return price === null ? NaN : price;
}

/** Kiểm tra thông tin người nhận và giỏ hàng; trả về dữ liệu đã chuẩn hóa. */
function validateOrderBody(body) {
    if (!body || typeof body !== "object") throw badRequest("Thiếu dữ liệu đơn hàng.");
    const fullName = requiredString(body.fullName, "Họ và tên", { max: 100 });
    const phone = validatePhone(body.phone);
    const email = validateEmail(body.email);
    // Địa chỉ có cấu trúc (shipping_address) hoặc một dòng chữ (address — cách cũ, vẫn hỗ trợ).
    let shippingAddress = null;
    let address;
    if (body.shipping_address !== undefined && body.shipping_address !== null) {
        shippingAddress = validateAddress(body.shipping_address);
        address = formatAddress(shippingAddress);
    } else {
        address = requiredString(body.address, "Địa chỉ", { max: 300 });
    }
    const qtyById = validateItems(body.items);
    const couponCode = validateCouponCode(body.coupon_code);
    return { fullName, phone, email, address, shippingAddress, qtyById, couponCode };
}

/** Giỏ hàng [{prd_id, qty}] -> Map(id -> qty). Giá trong body (nếu có) luôn bị bỏ qua. */
function validateItems(list) {
    if (!Array.isArray(list) || list.length === 0) throw badRequest("Giỏ hàng trống.");
    if (list.length > MAX_ITEMS) throw badRequest(`Một đơn tối đa ${MAX_ITEMS} sản phẩm.`);
    const qtyById = new Map();
    for (const item of list) {
        const id = item && String(item.prd_id);
        if (!isObjectId(id)) throw badRequest("Mã sản phẩm trong giỏ không hợp lệ.");
        const qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw badRequest(`Số lượng phải là số nguyên từ 1 đến ${MAX_QTY}.`);
        qtyById.set(id, Math.min(MAX_QTY, (qtyById.get(id) || 0) + qty));
    }
    return qtyById;
}

/** coupon_code tùy chọn: chuỗi (một mã duy nhất) hoặc bỏ trống. Mảng/đối tượng -> 400 (không áp hai mã). */
function validateCouponCode(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string") throw badRequest("Mỗi đơn chỉ dùng được một mã giảm giá.", { field: "coupon_code" });
    const code = normalizeCode(value);
    if (!code) return "";
    if (!CODE_RE.test(code)) throw badRequest("Mã giảm giá không tồn tại.", { field: "coupon_code" });
    return code;
}

/**
 * Tính giá giỏ hàng từ DATABASE (không tin giá frontend):
 * mỗi dòng có original_price (giá gốc) và price (giá bán sau khuyến mãi sản phẩm).
 */
async function priceCart(qtyById) {
    const ids = [...qtyById.keys()];
    const products = await ProductModel.find({ _id: { $in: ids } });
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const items = [];
    for (const id of ids) {
        const product = byId.get(id);
        if (!product) throw badRequest("Có sản phẩm trong giỏ không còn tồn tại.");
        if (product.is_stock === false) throw badRequest(`Sản phẩm "${product.name}" đã hết hàng.`);
        const pricing = productPricing(product);
        if (pricing.final_price === null) throw badRequest(`Sản phẩm "${product.name}" chưa có giá hợp lệ.`);
        items.push({ prd_id: id, original_price: pricing.original_price, price: pricing.final_price, qty: qtyById.get(id) });
    }
    const subtotal_original = items.reduce((t, i) => t + i.original_price * i.qty, 0);
    const subtotal = items.reduce((t, i) => t + i.price * i.qty, 0);
    return { items, subtotal_original, product_discount: subtotal_original - subtotal, subtotal };
}

/** Tìm coupon theo mã và kiểm tra dùng được cho tạm tính; lỗi -> 400 với lý do cụ thể. */
async function loadUsableCoupon(code, subtotal) {
    const coupon = await CouponModel.findOne({ code }).lean();
    const problem = couponProblem(coupon, subtotal);
    if (problem) throw badRequest(problem, { field: "coupon_code" });
    return coupon;
}

/**
 * Giữ một lượt coupon NGUYÊN TỬ: chỉ tăng used_count nếu mã còn bật và còn lượt tại đúng thời điểm ghi.
 * Nhiều đơn đồng thời tranh lượt cuối -> chỉ một đơn được; đơn còn lại nhận 409.
 */
async function reserveCoupon(coupon) {
    const filter = { _id: coupon._id, is_active: true };
    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
        filter.usage_limit = coupon.usage_limit;
        filter.used_count = { $lt: coupon.usage_limit };
    }
    const updated = await CouponModel.findOneAndUpdate(filter, { $inc: { used_count: 1 } }, { new: true }).lean();
    if (!updated) throw conflict("Mã giảm giá vừa hết lượt hoặc bị vô hiệu hóa. Vui lòng bỏ mã hoặc dùng mã khác.");
    return updated;
}

/** Trả lại lượt đã giữ (khi lưu đơn thất bại). Không bao giờ làm used_count âm. */
async function releaseCoupon(couponId) {
    await CouponModel.findOneAndUpdate({ _id: couponId, used_count: { $gt: 0 } }, { $inc: { used_count: -1 } });
}

exports.order = async (req, res) => {
    const { fullName, phone, email, address, shippingAddress, qtyById, couponCode } = validateOrderBody(req.body);
    const cart = await priceCart(qtyById);
    let coupon = null;
    let couponDiscountValue = 0;
    if (couponCode) {
        coupon = await loadUsableCoupon(couponCode, cart.subtotal);
        couponDiscountValue = couponDiscount(coupon, cart.subtotal);
    }
    const totalPrice = Math.max(0, cart.subtotal - couponDiscountValue);
    // user_id CHỈ lấy từ token đã xác thực (optionalAuth); khách -> null.
    const userId = req.user ? req.user._id : null;
    const doc = {
        user_id: userId,
        fullName,
        phone,
        email,
        address,
        shipping_address: shippingAddress,
        status: "pending",
        items: cart.items,
        subtotal_original: cart.subtotal_original,
        product_discount: cart.product_discount,
        subtotal: cart.subtotal,
        coupon_discount: couponDiscountValue,
        totalPrice,
    };
    if (coupon) doc.coupon = { coupon_id: coupon._id, code: coupon.code, type: coupon.type, value: coupon.value, discount: couponDiscountValue };

    // Giữ lượt ngay trước khi ghi đơn; ghi đơn lỗi -> trả lượt rồi báo lỗi (không mất lượt của mã).
    if (coupon) await reserveCoupon(coupon);
    let saved;
    try {
        saved = await new OrderModel(doc).save();
    } catch (err) {
        if (coupon) {
            await releaseCoupon(coupon._id).catch((e) => console.error("[coupon] không trả được lượt:", e && e.message));
        }
        throw err;
    }
    res.status(201).json({
        status: "success",
        message: "Created order successfully",
        data: {
            _id: String(saved._id),
            totalPrice,
            subtotal_original: cart.subtotal_original,
            product_discount: cart.product_discount,
            subtotal: cart.subtotal,
            coupon_discount: couponDiscountValue,
            coupon_code: coupon ? coupon.code : null,
        },
    });
};

/**
 * POST /coupons/preview { code, items: [{prd_id, qty}] } — CÔNG KHAI, chỉ xem trước: KHÔNG giữ/trừ lượt.
 * Dùng đúng hàm tính giá của bước đặt hàng nên số tiền xem trước khớp với số tiền thật (nếu mã chưa đổi).
 */
exports.previewCoupon = async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const code = validateCouponCode(body.code);
    if (!code) throw badRequest("Vui lòng nhập mã giảm giá.", { field: "coupon_code" });
    const cart = await priceCart(validateItems(body.items));
    const coupon = await loadUsableCoupon(code, cart.subtotal);
    const discount = couponDiscount(coupon, cart.subtotal);
    res.status(200).json({
        status: "success",
        data: {
            code: coupon.code,
            description: coupon.description || "",
            type: coupon.type,
            value: coupon.value,
            subtotal_original: cart.subtotal_original,
            product_discount: cart.product_discount,
            subtotal: cart.subtotal,
            coupon_discount: discount,
            total: Math.max(0, cart.subtotal - discount),
        },
    });
};

/**
 * Chi tiết giá đã LƯU trong đơn. Đơn cũ (trước đợt 5) không có các trường này -> null; không tính lại theo giá hiện tại.
 */
function priceBreakdown(o) {
    const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return {
        subtotal_original: num(o.subtotal_original),
        product_discount: num(o.product_discount),
        subtotal: num(o.subtotal),
        coupon_discount: num(o.coupon_discount),
        coupon: o.coupon ? { code: o.coupon.code, type: o.coupon.type, value: o.coupon.value, discount: o.coupon.discount } : null,
    };
}

const MY_ORDERS_MAX_LIMIT = 20;

/**
 * GET /order/my?page=&limit= — đơn hàng của người đang đăng nhập, mới nhất trước.
 * Bộ lọc luôn là user_id = req.user._id; tham số user_id trong query bị bỏ qua.
 */
exports.myOrders = async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MY_ORDERS_MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const filter = { user_id: req.user._id };
    const [total, orders] = await Promise.all([
        OrderModel.countDocuments(filter),
        OrderModel.find(filter, "-email -user_id")
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
    ]);
    // Tên/ảnh sản phẩm; sản phẩm đã bị xóa vẫn giữ dòng hàng.
    const productIds = [...new Set(orders.flatMap((o) => (o.items || []).map((i) => String(i.prd_id))))];
    const products = productIds.length ? await ProductModel.find({ _id: { $in: productIds } }, "name image").lean() : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const docs = orders.map((o) => ({
        _id: String(o._id),
        createdAt: o.createdAt,
        status: o.status || "pending",
        totalPrice: o.totalPrice,
        ...priceBreakdown(o),
        fullName: o.fullName,
        phone: o.phone,
        address: o.address,
        shipping_address: o.shipping_address || null,
        items: (o.items || []).map((i) => {
            const p = byId.get(String(i.prd_id));
            return { prd_id: String(i.prd_id), name: p ? p.name : "Sản phẩm không còn bán", image: p ? p.image : null, price: i.price, original_price: i.original_price ?? null, qty: i.qty };
        }),
    }));
    res.status(200).json({
        status: "success",
        data: { docs, page, limit, total, pages: Math.ceil(total / limit) },
    });
};

exports.getAllOrders = async (req, res) => {
    const orders = await OrderModel.find()
        .populate({
            path: "items.prd_id",
            model: ProductModel,
            select: "name",
        })
        .sort({ createdAt: -1 }); // mới nhất trước

    const ordersWithProductNames = orders.map((order) => ({
        ...order._doc,
        items: order.items.map((item) => ({
            ...item._doc,
            product: item.prd_id ? item.prd_id.name : "Unknown",
        })),
    }));

    res.status(200).json({
        status: "success",
        data: ordersWithProductNames,
    });
};

// Thống kê: tên và số lần xuất hiện của 5 cặp sản phẩm xuất hiện cùng nhau nhiều nhất (CHỈ ADMIN).
exports.getTopProductPairsNames = async (req, res) => {
    const orders = await OrderModel.find();
    const productPairs = {};
    orders.forEach((order) => {
        const itemIds = order.items.map((item) => item.prd_id);
        for (let i = 0; i < itemIds.length; i++) {
            for (let j = i + 1; j < itemIds.length; j++) {
                const pair = [itemIds[i], itemIds[j]].sort().join("-");
                productPairs[pair] = (productPairs[pair] || 0) + 1;
            }
        }
    });
    const topPairs = Object.keys(productPairs)
        .sort((a, b) => productPairs[b] - productPairs[a])
        .slice(0, 5);
    const uniqueProductIds = [...new Set(topPairs.flatMap((pair) => pair.split("-")))];
    const products = await ProductModel.find({ _id: { $in: uniqueProductIds } });
    const productMap = {};
    products.forEach((product) => {
        productMap[product._id.toString()] = product.name;
    });
    const responseData = topPairs.map((pair) => {
        const [productId1, productId2] = pair.split("-");
        return {
            pair: [
                { name: productMap[productId1], count: productPairs[pair] },
                { name: productMap[productId2], count: productPairs[pair] },
            ],
        };
    });
    res.status(200).json({ status: "success", data: responseData });
};

// ---------------------------------------------------------------- Quản trị đơn hàng (CHỈ ADMIN)

const ADMIN_MAX_LIMIT = 50;

function queryString(query, name, max) {
    const v = query[name];
    if (v === undefined || v === "") return "";
    if (typeof v !== "string") throw badRequest(`Tham số ${name} không hợp lệ.`);
    const t = v.trim().replace(/\s+/g, " ");
    if (t.length > max) throw badRequest(`Tham số ${name} tối đa ${max} ký tự.`);
    return t;
}

function queryInt(query, name, { def, min, max, clamp = false }) {
    const v = query[name];
    if (v === undefined || v === "") return def;
    if (typeof v !== "string" || !/^\d{1,6}$/.test(v)) throw badRequest(`Tham số ${name} phải là số nguyên.`);
    let n = Number(v);
    if (n > max && clamp) n = max;
    if (n < min || n > max) throw badRequest(`Tham số ${name} phải nằm trong khoảng ${min} – ${max}.`);
    return n;
}

/**
 * Bộ lọc tìm kiếm đơn: mã đơn (đủ 24 ký tự, hoặc mã ngắn kiểu "#A7B8C9D0" = 4–23 ký tự cuối của _id),
 * tên khách (có dấu/không dấu), số điện thoại hoặc email. Mọi chuỗi người dùng đều được escape.
 */
function orderSearchFilter(q) {
    const or = [];
    const hex = q.replace(/^#/, "");
    if (/^[0-9a-f]{24}$/i.test(hex)) or.push({ _id: hex.toLowerCase() });
    else if (/^[0-9a-f]{4,23}$/i.test(hex)) or.push({ $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: `${hex.toLowerCase()}$` } } });
    const regexes = keywordRegexes(q);
    if (regexes.length) or.push({ $and: regexes.map((re) => ({ fullName: re })) });
    const digits = q.replace(/[\s.-]/g, "");
    if (/^\+?\d{3,15}$/.test(digits)) or.push({ phone: new RegExp(escapeRegex(digits.replace(/^\+84/, "0"))) });
    or.push({ email: new RegExp(escapeRegex(q.toLowerCase()), "i") });
    return { $or: or };
}

const summary = (o) => ({
    _id: String(o._id),
    createdAt: o.createdAt,
    fullName: o.fullName,
    phone: o.phone,
    email: o.email,
    totalPrice: o.totalPrice,
    status: currentStatus(o),
    legacy_status: !ORDER_STATUSES.includes(o.status), // đơn cũ chưa có trường status (hiển thị như Chờ xác nhận)
    is_member: Boolean(o.user_id),
    item_count: (o.items || []).reduce((n, i) => n + (Number(i.qty) || 0), 0),
});

/** GET /order/admin?page=&limit=&status=&q=&sort=newest|oldest */
exports.adminList = async (req, res) => {
    const page = queryInt(req.query, "page", { def: 1, min: 1, max: 100000 });
    const limit = queryInt(req.query, "limit", { def: 20, min: 1, max: ADMIN_MAX_LIMIT, clamp: true });
    const status = queryString(req.query, "status", 20);
    if (status && !ORDER_STATUSES.includes(status)) throw badRequest(`status phải là một trong: ${ORDER_STATUSES.join(", ")}.`);
    const sort = queryString(req.query, "sort", 10) || "newest";
    if (!["newest", "oldest"].includes(sort)) throw badRequest("sort phải là newest hoặc oldest.");
    const q = queryString(req.query, "q", 100);
    const parts = [];
    if (status) parts.push(statusFilter(status));
    if (q) parts.push(orderSearchFilter(q));
    const filter = parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { $and: parts };
    const dir = sort === "oldest" ? 1 : -1;
    const [total, orders] = await Promise.all([
        OrderModel.countDocuments(filter),
        OrderModel.find(filter, "fullName phone email totalPrice status user_id items createdAt")
            .sort({ createdAt: dir, _id: dir })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
    ]);
    res.status(200).json({
        status: "success",
        filter: { page, limit, status: status || null, q, sort },
        data: { docs: orders.map(summary), total, page, limit, totalPages: Math.ceil(total / limit) },
    });
};

async function orderDetail(order) {
    const ids = [...new Set((order.items || []).map((i) => String(i.prd_id)))];
    const products = ids.length ? await ProductModel.find({ _id: { $in: ids } }, "name image").lean() : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const user = order.user_id ? await UserModel.findById(order.user_id, "email full_name").lean() : null;
    return {
        ...summary(order),
        updatedAt: order.updatedAt || null,
        delivered_at: order.delivered_at || null,
        ...priceBreakdown(order),
        address: order.address,
        shipping_address: order.shipping_address || null,
        user: order.user_id ? { _id: String(order.user_id), email: user ? user.email : null, full_name: user ? user.full_name : null, exists: Boolean(user) } : null,
        items: (order.items || []).map((i) => {
            const p = byId.get(String(i.prd_id));
            const price = Number(i.price) || 0;
            const qty = Number(i.qty) || 0;
            return { prd_id: String(i.prd_id), name: p ? p.name : "Sản phẩm đã bị xóa", image: p ? p.image : null, price, original_price: i.original_price ?? null, qty, subtotal: price * qty };
        }),
        status_history: (order.status_history || []).map((h) => ({ from: h.from, to: h.to, at: h.at, by: h.by ? String(h.by) : null })),
        next_statuses: nextStatuses(currentStatus(order)),
    };
}

/** GET /order/admin/:id */
exports.adminDetail = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const order = await OrderModel.findById(id).lean();
    if (!order) throw notFound("Không tìm thấy đơn hàng.");
    res.status(200).json({ status: "success", data: await orderDetail(order) });
};

/**
 * PATCH /order/admin/:id/status  body { status }
 * Chỉ các bước trong libs/order-status.js. Cập nhật có điều kiện theo trạng thái vừa đọc (hai admin cùng đổi
 * một đơn thì người sau nhận 409). Đơn cũ không có status chỉ được ghi status khi admin đổi chính đơn đó.
 */
exports.updateStatus = async (req, res) => {
    const id = assertObjectId(req.params.id);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const extra = Object.keys(body).filter((k) => k !== "status");
    if (extra.length) throw badRequest(`Chỉ được gửi trường status (thừa: ${extra.join(", ")}).`);
    const to = body.status;
    if (typeof to !== "string" || !ORDER_STATUSES.includes(to)) throw badRequest(`status phải là một trong: ${ORDER_STATUSES.join(", ")}.`);
    const order = await OrderModel.findById(id, "status").lean();
    if (!order) throw notFound("Không tìm thấy đơn hàng.");
    const from = currentStatus(order);
    if (from === to) throw conflict(`Đơn hàng đã ở trạng thái "${LABELS[to]}".`);
    if (!canTransition(from, to)) {
        const allowed = nextStatuses(from).map((s) => `"${LABELS[s]}"`);
        const hint = allowed.length ? ` Chỉ được chuyển sang: ${allowed.join(", ")}.` : " Đây là trạng thái cuối, không thể thay đổi.";
        throw new HttpError(409, `Không thể chuyển đơn từ "${LABELS[from]}" sang "${LABELS[to]}".${hint}`, "INVALID_TRANSITION");
    }
    const now = new Date();
    const updated = await OrderModel.findOneAndUpdate(
        { _id: id, ...statusFilter(from) },
        { $set: { status: to, ...(to === "delivered" ? { delivered_at: now } : {}) }, $push: { status_history: { from, to, at: now, by: req.user._id } } },
        { new: true, runValidators: true }
    ).lean();
    if (!updated) throw conflict("Đơn hàng vừa được cập nhật ở nơi khác. Vui lòng tải lại.");
    res.status(200).json({ status: "success", message: `Đã chuyển đơn sang "${LABELS[to]}".`, data: await orderDetail(updated) });
};

exports.validateOrderBody = validateOrderBody;
exports.priceCart = priceCart;
exports.productPrice = productPrice;
