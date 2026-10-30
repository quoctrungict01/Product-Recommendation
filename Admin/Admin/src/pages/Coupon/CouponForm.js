// Tạo/sửa mã giảm giá. Kiểm tra ở giao diện giống backend (libs/coupon.js); backend kiểm tra lại.
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCoupon, createCoupon, updateCoupon } from "../../services/Api";
import { toMoney, formatMoney, apiMessage } from "../../shared/ultils/format";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";

const defaultApi = { getCoupon, createCoupon, updateCoupon };
const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

/** Date ISO -> giá trị ô datetime-local theo giờ máy người dùng. */
const toLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const emptyCoupon = () => ({ code: "", description: "", type: "fixed", value: "", min_order: "", max_discount: "", starts_at: "", ends_at: "", usage_limit: "", is_active: true });

export const fromCoupon = (c) => ({
    code: c.code,
    description: c.description || "",
    type: c.type,
    value: String(c.value),
    min_order: c.min_order ? String(c.min_order) : "",
    max_discount: c.max_discount ? String(c.max_discount) : "",
    starts_at: toLocalInput(c.starts_at),
    ends_at: toLocalInput(c.ends_at),
    usage_limit: c.usage_limit ? String(c.usage_limit) : "",
    is_active: c.is_active !== false,
});

export const validateCouponForm = (v, usedCount = 0) => {
    const e = {};
    const code = v.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) e.code = "Mã gồm 3–30 ký tự: chữ không dấu, số, - hoặc _.";
    const value = toMoney(v.value);
    if (v.type === "percent") {
        if (value === null || value < 1 || value > 100) e.value = "Phần trăm giảm từ 1 đến 100.";
    } else if (value === null || value < 1) e.value = "Số tiền giảm phải là số nguyên dương.";
    if (v.min_order && toMoney(v.min_order) === null) e.min_order = "Đơn tối thiểu phải là số nguyên không âm.";
    if (v.max_discount && (toMoney(v.max_discount) === null || toMoney(v.max_discount) < 1)) e.max_discount = "Giảm tối đa phải là số nguyên dương.";
    const limit = v.usage_limit ? toMoney(v.usage_limit) : null;
    if (v.usage_limit && (limit === null || limit < 1)) e.usage_limit = "Giới hạn lượt phải là số nguyên dương.";
    else if (limit !== null && limit < usedCount) e.usage_limit = `Không được nhỏ hơn số lượt đã dùng (${usedCount}).`;
    if (v.starts_at && v.ends_at && new Date(v.ends_at) <= new Date(v.starts_at)) e.ends_at = "Kết thúc phải sau thời điểm bắt đầu.";
    if (v.description.length > 200) e.description = "Mô tả tối đa 200 ký tự.";
    return e;
};

/** Giá trị form -> body JSON. Ô thời gian theo giờ máy -> ISO (UTC). */
export const toCouponPayload = (v) => ({
    code: v.code.trim().toUpperCase(),
    description: v.description.trim(),
    type: v.type,
    value: toMoney(v.value),
    min_order: v.min_order ? toMoney(v.min_order) : 0,
    max_discount: v.max_discount ? toMoney(v.max_discount) : null,
    starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : null,
    ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : null,
    usage_limit: v.usage_limit ? toMoney(v.usage_limit) : null,
    is_active: Boolean(v.is_active),
});

const CouponForm = ({ api = defaultApi, couponId: idProp }) => {
    const params = useParams();
    const couponId = idProp || params.id || null;
    const navigate = useNavigate();
    const [values, setValues] = React.useState(emptyCoupon);
    const [usedCount, setUsedCount] = React.useState(0);
    const [errors, setErrors] = React.useState({});
    const [notice, setNotice] = React.useState(null);
    const [loading, setLoading] = React.useState(Boolean(couponId));
    const [loadError, setLoadError] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (!couponId) return undefined;
        let alive = true;
        api.getCoupon(couponId)
            .then(({ data }) => {
                if (!alive) return;
                setValues(fromCoupon(data.data));
                setUsedCount(data.data.used_count || 0);
            })
            .catch((err) => alive && setLoadError(apiMessage(err, "Không tải được mã giảm giá.")))
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [api, couponId]);

    const set = (field) => (e) => {
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setValues((v) => ({ ...v, [field]: value }));
        setErrors((er) => ({ ...er, [field]: undefined }));
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const found = validateCouponForm(values, usedCount);
        setErrors(found);
        setNotice(null);
        if (Object.keys(found).length) return setNotice({ type: "danger", text: "Vui lòng sửa các ô được đánh dấu." });
        setSaving(true);
        try {
            const body = toCouponPayload(values);
            const { data } = couponId ? await api.updateCoupon(couponId, body) : await api.createCoupon(body);
            navigate("/coupon", { state: { notice: { type: "success", text: data.message || "Đã lưu mã giảm giá." } } });
        } catch (err) {
            const field = err && err.response && err.response.data && err.response.data.details && err.response.data.details.field;
            const message = apiMessage(err, "Không lưu được mã giảm giá.");
            if (field) setErrors((er) => ({ ...er, [field]: message }));
            setNotice({ type: "danger", text: message });
            setSaving(false);
        }
    };

    const field = (name, label, props = {}, help = null) => (
        <div className={`form-group${errors[name] ? " has-error" : ""}`}>
            <label htmlFor={`cp-${name}`}>{label}</label>
            <input id={`cp-${name}`} className="form-control" value={values[name]} onChange={set(name)} aria-invalid={Boolean(errors[name])} {...props} />
            {errors[name] ? <span className="help-block">{errors[name]}</span> : help ? <span className="help-block" style={{ color: "#888" }}>{help}</span> : null}
        </div>
    );
    const value = toMoney(values.value);
    const example = 1000000;
    const exampleDiscount = value ? Math.min(values.type === "percent" ? Math.floor((example * value) / 100) : value, toMoney(values.max_discount) || Infinity, example) : null;
    const lockedCode = couponId && usedCount > 0;

    return (
        <PageShell title={couponId ? "Sửa mã giảm giá" : "Tạo mã giảm giá"} crumbs={[{ label: "Mã giảm giá", to: "/coupon" }, { label: couponId ? "Sửa mã" : "Tạo mã" }]}>
            <Notice notice={notice} onClose={() => setNotice(null)} />
            {loadError ? (
                <div className="alert alert-danger" role="alert">
                    {loadError}
                </div>
            ) : loading ? (
                <p role="status">Đang tải...</p>
            ) : (
                <div className="panel panel-default">
                    <div className="panel-body">
                        <form onSubmit={onSubmit} noValidate>
                            <div className="col-md-6">
                                {field("code", "Mã *", { maxLength: 30, style: { textTransform: "uppercase" }, disabled: lockedCode }, lockedCode ? `Mã đã được dùng ${usedCount} lần nên không đổi được.` : "Chữ không dấu, số, - hoặc _; tự chuyển thành chữ in hoa.")}
                                {field("description", "Mô tả (hiện cho khách)", { maxLength: 200 })}
                                <div className="form-group">
                                    <label htmlFor="cp-type">Loại giảm</label>
                                    <select id="cp-type" className="form-control" value={values.type} onChange={set("type")}>
                                        <option value="fixed">Số tiền cố định</option>
                                        <option value="percent">Phần trăm</option>
                                    </select>
                                </div>
                                {field("value", values.type === "percent" ? "Phần trăm giảm (1–100) *" : "Số tiền giảm (VND) *", { inputMode: "numeric" })}
                                {values.type === "percent" ? field("max_discount", "Giảm tối đa (VND)", { inputMode: "numeric" }, "Để trống = không giới hạn.") : null}
                                {field("min_order", "Đơn tối thiểu (VND, sau khuyến mãi sản phẩm)", { inputMode: "numeric" }, "Để trống = không yêu cầu.")}
                                <div className="well well-sm" aria-live="polite">
                                    Ví dụ đơn {formatMoney(example)}: {exampleDiscount !== null ? <b>giảm {formatMoney(exampleDiscount)}</b> : "nhập giá trị để xem"}
                                </div>
                            </div>
                            <div className="col-md-6">
                                {field("starts_at", "Bắt đầu", { type: "datetime-local" }, "Để trống = có hiệu lực ngay.")}
                                {field("ends_at", "Kết thúc", { type: "datetime-local" }, "Để trống = không hết hạn.")}
                                {field("usage_limit", "Tổng lượt dùng tối đa", { inputMode: "numeric" }, `Để trống = không giới hạn.${couponId ? ` Đã dùng: ${usedCount}.` : ""}`)}
                                <div className="checkbox">
                                    <label>
                                        <input type="checkbox" checked={values.is_active} onChange={set("is_active")} /> Đang bật (bỏ chọn = vô hiệu hóa)
                                    </label>
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? "Đang lưu..." : couponId ? "Cập nhật" : "Tạo mã"}
                                </button>{" "}
                                <button type="button" className="btn btn-default" onClick={() => navigate("/coupon")} disabled={saving}>
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

export default CouponForm;
