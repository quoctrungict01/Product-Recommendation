// Form thêm/sửa sản phẩm (dùng chung). Gửi JSON đúng trường backend yêu cầu (category_id, price, promotion, ...).
// Kiểm tra ở giao diện giống backend (libs/product-input.js); backend vẫn kiểm tra lại và là nơi quyết định.
import React from "react";
import { useNavigate } from "react-router-dom";
import { getCategories, getProduct, addProduct, updateProduct, uploadProductImage } from "../../services/Api";
import { getImageProduct } from "../../shared/ultils";
import { formatMoney, toMoney, apiMessage } from "../../shared/ultils/format";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";

const defaultApi = { getCategories, getProduct, addProduct, updateProduct, uploadProductImage };
const IMAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,199}$/;
const MAX_UPLOAD = 2 * 1024 * 1024;

export const emptyProduct = () => ({
    name: "",
    category_id: "",
    image: "",
    price: "",
    promo_type: "none", // none | discount | gift
    discount: "",
    gift: "",
    status: "Mới 100%",
    accessories: "",
    details: "",
    is_stock: true,
    is_featured: false,
});

/** Sản phẩm từ API -> giá trị form. promotion là số tiền giảm (số) hoặc chữ (quà tặng). */
export const fromProduct = (p) => {
    const amount = toMoney(p.promotion);
    const text = typeof p.promotion === "string" ? p.promotion.trim() : "";
    return {
        name: p.name || "",
        category_id: p.category_id ? String(p.category_id) : "",
        image: p.image || "",
        price: toMoney(p.price) !== null ? String(toMoney(p.price)) : String(p.price || ""),
        promo_type: amount !== null ? (amount > 0 ? "discount" : "none") : text ? "gift" : "none",
        discount: amount ? String(amount) : "",
        gift: amount === null ? text : "",
        status: p.status || "",
        accessories: p.accessories || "",
        details: p.details || "",
        is_stock: p.is_stock !== false,
        is_featured: p.is_featured === true,
    };
};

/** Lỗi theo từng ô; rỗng = hợp lệ. */
export const validateProductForm = (v) => {
    const e = {};
    const req = (field, label, max) => {
        const s = String(v[field] || "").trim();
        if (!s) e[field] = `${label} là bắt buộc.`;
        else if (s.length > max) e[field] = `${label} tối đa ${max} ký tự.`;
    };
    req("name", "Tên sản phẩm", 200);
    if (!v.category_id) e.category_id = "Chọn danh mục.";
    req("image", "Ảnh sản phẩm", 200);
    if (!e.image && (!IMAGE_RE.test(v.image.trim()) || v.image.includes(".."))) e.image = "Tên file ảnh chỉ gồm chữ, số, . _ - / (không có ..).";
    const price = toMoney(String(v.price));
    if (price === null || price < 1) e.price = "Giá gốc phải là số nguyên dương (VND).";
    if (v.promo_type === "discount") {
        const d = toMoney(String(v.discount));
        if (d === null || d < 1) e.discount = "Số tiền giảm phải là số nguyên dương.";
        else if (price !== null && d >= price) e.discount = "Số tiền giảm phải nhỏ hơn giá gốc.";
    }
    if (v.promo_type === "gift") {
        const g = v.gift.trim();
        if (!g) e.gift = "Nhập nội dung quà tặng.";
        else if (/^[\d\s.,+-]+$/.test(g)) e.gift = "Quà tặng phải là chữ; muốn giảm tiền hãy chọn 'Giảm giá'.";
        else if (g.length > 200) e.gift = "Tối đa 200 ký tự.";
    }
    req("status", "Tình trạng", 100);
    req("accessories", "Phụ kiện đi kèm", 300);
    req("details", "Mô tả", 5000);
    return e;
};

/** Giá trị form -> body JSON cho POST /products/create, PUT /products/:id/update. */
export const toPayload = (v) => ({
    name: v.name.trim(),
    category_id: v.category_id,
    image: v.image.trim(),
    price: String(toMoney(String(v.price))),
    promotion: v.promo_type === "discount" ? String(toMoney(String(v.discount))) : v.promo_type === "gift" ? v.gift.trim() : "0",
    status: v.status.trim(),
    accessories: v.accessories.trim(),
    details: v.details.trim(),
    is_stock: Boolean(v.is_stock),
    is_featured: Boolean(v.is_featured),
});

const FieldError = ({ id, text }) =>
    text ? (
        <span id={id} className="help-block" style={{ color: "#a94442" }}>
            {text}
        </span>
    ) : null;

const ProductForm = ({ productId = null, api = defaultApi }) => {
    const navigate = useNavigate();
    const isEdit = Boolean(productId);
    const [values, setValues] = React.useState(emptyProduct);
    const [categories, setCategories] = React.useState([]);
    const [errors, setErrors] = React.useState({});
    const [notice, setNotice] = React.useState(null);
    const [loading, setLoading] = React.useState(isEdit);
    const [loadError, setLoadError] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        api.getCategories({ params: { limit: 100 } })
            .then(({ data }) => alive && setCategories(data.data.docs || []))
            .catch(() => alive && setNotice({ type: "warning", text: "Không tải được danh mục. Hãy tải lại trang." }));
        if (isEdit) {
            api.getProduct(productId)
                .then(({ data }) => alive && setValues(fromProduct(data.data)))
                .catch((err) => alive && setLoadError(apiMessage(err, "Không tải được sản phẩm.")))
                .finally(() => alive && setLoading(false));
        }
        return () => {
            alive = false;
        };
    }, [api, isEdit, productId]);

    const set = (field) => (e) => {
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setValues((v) => ({ ...v, [field]: value }));
        setErrors((er) => ({ ...er, [field]: undefined }));
    };

    const onUpload = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file) return;
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return setErrors((er) => ({ ...er, image: "Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF." }));
        if (file.size > MAX_UPLOAD) return setErrors((er) => ({ ...er, image: "Ảnh tối đa 2 MB." }));
        setUploading(true);
        try {
            const { data } = await api.uploadProductImage(file);
            setValues((v) => ({ ...v, image: data.data.image }));
            setErrors((er) => ({ ...er, image: undefined }));
        } catch (err) {
            setErrors((er) => ({ ...er, image: apiMessage(err, "Tải ảnh lên thất bại.") }));
        } finally {
            setUploading(false);
        }
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        setNotice(null);
        const found = validateProductForm(values);
        setErrors(found);
        if (Object.keys(found).length) {
            setNotice({ type: "danger", text: "Vui lòng sửa các ô được đánh dấu." });
            return;
        }
        setSaving(true);
        try {
            const body = toPayload(values);
            if (isEdit) await api.updateProduct(productId, body);
            else await api.addProduct(body);
            navigate("/product", { state: { notice: { type: "success", text: isEdit ? `Đã cập nhật "${body.name}".` : `Đã thêm "${body.name}".` } } });
        } catch (err) {
            const field = err && err.response && err.response.data && err.response.data.details && err.response.data.details.field;
            const message = apiMessage(err, "Không lưu được sản phẩm. Vui lòng thử lại.");
            const map = { promotion: values.promo_type === "gift" ? "gift" : "discount" };
            if (field) setErrors((er) => ({ ...er, [map[field] || field]: message }));
            setNotice({ type: "danger", text: message });
            setSaving(false);
        }
    };

    const price = toMoney(String(values.price));
    const discount = values.promo_type === "discount" ? toMoney(String(values.discount)) : 0;
    const finalPrice = price !== null && price > 0 && discount !== null && discount < price ? price - (discount || 0) : null;
    const percent = finalPrice !== null && discount ? Math.min(99, Math.max(1, Math.round((discount * 100) / price))) : 0;

    const title = isEdit ? `Sửa sản phẩm${values.name ? `: ${values.name}` : ""}` : "Thêm sản phẩm";
    const input = (field, label, props = {}) => (
        <div className={`form-group${errors[field] ? " has-error" : ""}`}>
            <label htmlFor={`prd-${field}`}>{label}</label>
            <input id={`prd-${field}`} className="form-control" value={values[field]} onChange={set(field)} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `prd-${field}-err` : undefined} {...props} />
            <FieldError id={`prd-${field}-err`} text={errors[field]} />
        </div>
    );

    return (
        <PageShell title={title} crumbs={[{ label: "Quản lý sản phẩm", to: "/product" }, { label: isEdit ? "Sửa sản phẩm" : "Thêm sản phẩm" }]}>
            <Notice notice={notice} onClose={() => setNotice(null)} />
            {loadError ? (
                <div className="alert alert-danger" role="alert">
                    {loadError}
                </div>
            ) : loading ? (
                <p role="status">Đang tải sản phẩm...</p>
            ) : (
                <div className="panel panel-default">
                    <div className="panel-body">
                        <form onSubmit={onSubmit} noValidate>
                            <div className="col-md-6">
                                {input("name", "Tên sản phẩm *", { maxLength: 200 })}
                                <div className={`form-group${errors.category_id ? " has-error" : ""}`}>
                                    <label htmlFor="prd-category_id">Danh mục *</label>
                                    <select id="prd-category_id" className="form-control" value={values.category_id} onChange={set("category_id")} aria-invalid={Boolean(errors.category_id)}>
                                        <option value="">-- Chọn danh mục --</option>
                                        {categories.map((c) => (
                                            <option key={c._id} value={c._id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                    <FieldError text={errors.category_id} />
                                </div>
                                {input("price", "Giá gốc (VND) *", { inputMode: "numeric", placeholder: "VD: 19990000" })}
                                <div className="form-group">
                                    <label htmlFor="prd-promo_type">Khuyến mại</label>
                                    <select id="prd-promo_type" className="form-control" value={values.promo_type} onChange={set("promo_type")}>
                                        <option value="none">Không có</option>
                                        <option value="discount">Giảm giá (số tiền)</option>
                                        <option value="gift">Quà tặng / ghi chú (không đổi giá)</option>
                                    </select>
                                </div>
                                {values.promo_type === "discount" ? input("discount", "Số tiền giảm (VND) *", { inputMode: "numeric", placeholder: "VD: 500000" }) : null}
                                {values.promo_type === "gift" ? input("gift", "Nội dung quà tặng *", { maxLength: 200, placeholder: "VD: Tặng ốp lưng" }) : null}
                                <div className="well well-sm" aria-live="polite">
                                    Giá bán cuối cùng:{" "}
                                    {finalPrice !== null ? (
                                        <>
                                            <b style={{ color: "#c9302c", fontSize: 18 }}>{formatMoney(finalPrice)}</b>
                                            {discount ? (
                                                <>
                                                    {" "}
                                                    <del style={{ color: "#888" }}>{formatMoney(price)}</del> <span className="label label-danger">-{percent}%</span>
                                                </>
                                            ) : null}
                                        </>
                                    ) : (
                                        <span style={{ color: "#888" }}>nhập giá hợp lệ để xem</span>
                                    )}
                                </div>
                                {input("status", "Tình trạng máy *", { maxLength: 100, placeholder: "VD: Mới 100%, nguyên seal" })}
                                {input("accessories", "Phụ kiện đi kèm *", { maxLength: 300 })}
                            </div>
                            <div className="col-md-6">
                                <div className={`form-group${errors.image ? " has-error" : ""}`}>
                                    <label htmlFor="prd-image">Ảnh sản phẩm *</label>
                                    <input id="prd-image" className="form-control" value={values.image} onChange={set("image")} placeholder="Tên file trong images/products, hoặc tải ảnh lên" aria-invalid={Boolean(errors.image)} />
                                    <div style={{ marginTop: 6 }}>
                                        <label className="btn btn-default btn-sm" style={{ marginBottom: 0 }}>
                                            {uploading ? "Đang tải ảnh..." : "Tải ảnh lên (JPG/PNG/WEBP/GIF, ≤ 2 MB)"}
                                            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onUpload} disabled={uploading} style={{ display: "none" }} aria-label="Chọn file ảnh" />
                                        </label>
                                    </div>
                                    <FieldError text={errors.image} />
                                    {values.image && !errors.image ? <img src={getImageProduct(values.image)} alt="Xem trước" style={{ marginTop: 8, maxWidth: 180, maxHeight: 180, objectFit: "contain" }} /> : null}
                                </div>
                                <div className="form-group">
                                    <div className="checkbox">
                                        <label>
                                            <input type="checkbox" checked={values.is_stock} onChange={set("is_stock")} /> Còn hàng (bỏ chọn = hết hàng, khách không đặt được)
                                        </label>
                                    </div>
                                    <div className="checkbox">
                                        <label>
                                            <input type="checkbox" checked={values.is_featured} onChange={set("is_featured")} /> Sản phẩm nổi bật (hiện ở trang chủ)
                                        </label>
                                    </div>
                                </div>
                                <div className={`form-group${errors.details ? " has-error" : ""}`}>
                                    <label htmlFor="prd-details">Mô tả sản phẩm *</label>
                                    <textarea id="prd-details" className="form-control" rows={6} maxLength={5000} value={values.details} onChange={set("details")} aria-invalid={Boolean(errors.details)} />
                                    <FieldError text={errors.details} />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
                                    {saving ? "Đang lưu..." : isEdit ? "Cập nhật" : "Thêm mới"}
                                </button>{" "}
                                <button type="button" className="btn btn-default" onClick={() => navigate("/product")} disabled={saving}>
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </PageShell>
    );
};

export default ProductForm;
