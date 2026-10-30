// Thêm / xem và sửa tài khoản. Không có ô chọn vai trò: tài khoản tạo mới luôn là thành viên (backend bắt buộc),
// và giao diện không cho nâng/hạ quyền. Mật khẩu chỉ gửi đi, không bao giờ được hiển thị lại.
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getUser, createUser, updateUser } from "../../services/Api";
import { formatDate, apiMessage } from "../../shared/ultils/format";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";
import { ROLE_LABEL } from "./index";

const defaultApi = { getUser, createUser, updateUser };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^(\+84|0)\d{8,10}$/;

export const emptyUser = () => ({ full_name: "", email: "", phone: "", password: "" });
export const normalizePhone = (v) => String(v || "").replace(/[\s.-]/g, "");

/** Cùng quy tắc với backend (src/libs/validate.js). isNew: mật khẩu bắt buộc. */
export const validateUserForm = (v, isNew) => {
    const e = {};
    if (v.full_name.trim().length > 100) e.full_name = "Họ tên tối đa 100 ký tự.";
    const email = v.email.trim();
    if (!email) e.email = "Vui lòng nhập email.";
    else if (!EMAIL_RE.test(email) || email.length > 254) e.email = "Email không hợp lệ.";
    const phone = normalizePhone(v.phone);
    if (phone && !PHONE_RE.test(phone)) e.phone = "Số điện thoại không hợp lệ (vd. 0912345678).";
    if (isNew || v.password) {
        if (v.password.length < 8) e.password = "Mật khẩu phải có ít nhất 8 ký tự.";
        else if (v.password.length > 128) e.password = "Mật khẩu tối đa 128 ký tự.";
        else if (!/\p{L}/u.test(v.password) || !/\d/.test(v.password)) e.password = "Mật khẩu phải có cả chữ cái và chữ số.";
    }
    return e;
};

/** Body gửi backend. Không bao giờ có trường role. */
export const toUserPayload = (v, isNew) => {
    const body = { full_name: v.full_name.trim(), email: v.email.trim().toLowerCase() };
    if (isNew) {
        body.password = v.password;
        if (normalizePhone(v.phone)) body.phone = normalizePhone(v.phone);
    } else {
        body.phone = normalizePhone(v.phone) || null;
        if (v.password) body.password = v.password;
    }
    return body;
};

const formatAddress = (a) => (a ? [a.detail, a.ward, a.district, a.province].filter(Boolean).join(", ") : "");

const UserForm = ({ api = defaultApi }) => {
    const { id } = useParams();
    const isNew = !id;
    const navigate = useNavigate();
    const [values, setValues] = React.useState(emptyUser);
    const [account, setAccount] = React.useState(null);
    const [errors, setErrors] = React.useState({});
    const [load, setLoad] = React.useState(isNew ? "ready" : "loading");
    const [loadMessage, setLoadMessage] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [notice, setNotice] = React.useState(null);
    const [reload, setReload] = React.useState(0);

    React.useEffect(() => {
        if (isNew) return undefined;
        let alive = true;
        setLoad("loading");
        api.getUser(id)
            .then(({ data }) => {
                if (!alive) return;
                const u = data.data;
                setAccount(u);
                setValues({ full_name: u.full_name || "", email: u.email || "", phone: u.phone || "", password: "" });
                setLoad("ready");
            })
            .catch((err) => {
                if (!alive) return;
                setLoadMessage(err && err.response && err.response.status === 404 ? "Không tìm thấy tài khoản (có thể đã bị xóa)." : apiMessage(err, "Không tải được thông tin tài khoản."));
                setLoad("error");
            });
        return () => {
            alive = false;
        };
    }, [api, id, isNew, reload]);

    const set = (field) => (e) => {
        setValues((v) => ({ ...v, [field]: e.target.value }));
        setErrors((er) => ({ ...er, [field]: undefined }));
    };

    const submit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const errs = validateUserForm(values, isNew);
        setErrors(errs);
        if (Object.keys(errs).length) {
            setNotice({ type: "danger", text: "Vui lòng sửa các ô được đánh dấu." });
            return;
        }
        setSaving(true);
        setNotice(null);
        try {
            const body = toUserPayload(values, isNew);
            if (isNew) await api.createUser(body);
            else await api.updateUser(id, body);
            const text = isNew ? `Đã tạo tài khoản ${body.email}.` : values.password ? `Đã cập nhật ${body.email} và đặt lại mật khẩu (các phiên đăng nhập cũ của người này bị đăng xuất).` : `Đã cập nhật ${body.email}.`;
            navigate("/user", { state: { notice: { type: "success", text } } });
        } catch (err) {
            const msg = apiMessage(err, isNew ? "Không tạo được tài khoản." : "Không cập nhật được tài khoản.");
            if (err && err.response && err.response.status === 409) setErrors({ email: msg });
            setNotice({ type: "danger", text: msg });
            setSaving(false);
        }
    };

    const field = (name, label, props = {}) => (
        <div className={`form-group${errors[name] ? " has-error" : ""}`}>
            <label htmlFor={`uf-${name}`}>{label}</label>
            <input id={`uf-${name}`} className="form-control" value={values[name]} onChange={set(name)} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `uf-${name}-err` : undefined} {...props} />
            {errors[name] ? (
                <span id={`uf-${name}-err`} className="help-block">
                    {errors[name]}
                </span>
            ) : null}
        </div>
    );

    const title = isNew ? "Thêm thành viên" : "Thông tin thành viên";
    const role = account ? ROLE_LABEL[account.role] || ROLE_LABEL.member : ROLE_LABEL.member;

    return (
        <PageShell title={title} crumbs={[{ label: "Quản lý thành viên", to: "/user" }, { label: title }]}>
            <Notice notice={notice} onClose={() => setNotice(null)} />
            {load === "loading" ? <p role="status">Đang tải...</p> : null}
            {load === "error" ? (
                <div className="alert alert-danger" role="alert">
                    {loadMessage}{" "}
                    <button type="button" className="btn btn-default btn-xs" onClick={() => setReload((n) => n + 1)}>
                        Thử lại
                    </button>
                </div>
            ) : null}
            {load === "ready" ? (
                <div className="panel panel-default">
                    <div className="panel-body">
                        <form className="col-md-8" onSubmit={submit} noValidate>
                            <p>
                                Vai trò: <span className={role.className}>{role.label}</span>
                                {isNew ? <small style={{ color: "#666" }}> — tài khoản tạo ở đây luôn là thành viên.</small> : null}
                            </p>
                            {account ? (
                                <dl className="dl-horizontal" style={{ marginLeft: 0 }}>
                                    <dt>Ngày tạo</dt>
                                    <dd>{formatDate(account.createdAt)}</dd>
                                    <dt>Cập nhật</dt>
                                    <dd>{formatDate(account.updatedAt)}</dd>
                                    <dt>Địa chỉ mặc định</dt>
                                    <dd>{formatAddress(account.address) || "—"}</dd>
                                </dl>
                            ) : null}
                            {field("full_name", "Họ tên", { maxLength: 100, autoComplete: "off" })}
                            {field("email", "Email *", { type: "email", maxLength: 254, autoComplete: "off" })}
                            {field("phone", "Số điện thoại", { type: "tel", maxLength: 20, autoComplete: "off" })}
                            {field("password", isNew ? "Mật khẩu *" : "Đặt lại mật khẩu (để trống nếu không đổi)", { type: "password", maxLength: 128, autoComplete: "new-password" })}
                            <p className="help-block" style={{ marginTop: -8 }}>
                                Tối thiểu 8 ký tự, có cả chữ cái và chữ số.
                            </p>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? "Đang lưu..." : isNew ? "Tạo tài khoản" : "Cập nhật"}
                            </button>{" "}
                            <button type="button" className="btn btn-default" onClick={() => navigate("/user")} disabled={saving}>
                                Hủy
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}
        </PageShell>
    );
};

export default UserForm;
