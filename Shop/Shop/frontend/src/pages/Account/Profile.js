// Hồ sơ cá nhân (họ tên, số điện thoại, email) và đổi mật khẩu.
import React from "react";
import { useDispatch } from "react-redux";
import { getMe, updateMe, changePasswordApi } from "../../services/Api";
import { UPDATE_USER } from "../../shared/constants/action-type";
import { phoneError, emailError, newPasswordError, normalizePhone, apiMessage } from "../../shared/ultils/profile";
import Notice from "./Notice";

const defaultApi = { getMe, updateMe, changePassword: changePasswordApi };

const Profile = ({ api = defaultApi }) => {
    const dispatch = useDispatch();
    const [original, setOriginal] = React.useState(null);
    const [form, setForm] = React.useState({ full_name: "", phone: "", email: "", current_password: "" });
    const [errors, setErrors] = React.useState({});
    const [notice, setNotice] = React.useState(null);
    const [saving, setSaving] = React.useState(false);
    const [loadError, setLoadError] = React.useState("");

    const [pw, setPw] = React.useState({ current_password: "", new_password: "", confirm: "" });
    const [pwErrors, setPwErrors] = React.useState({});
    const [pwNotice, setPwNotice] = React.useState(null);
    const [pwSaving, setPwSaving] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        api.getMe()
            .then(({ data }) => {
                if (!alive) return;
                const user = data.data.user;
                setOriginal(user);
                setForm({ full_name: user.full_name || "", phone: user.phone || "", email: user.email || "", current_password: "" });
                dispatch({ type: UPDATE_USER, payload: { user } });
            })
            .catch((err) => alive && setLoadError(apiMessage(err, "Không tải được hồ sơ. Vui lòng thử lại.")));
        return () => {
            alive = false;
        };
    }, [api, dispatch]);

    const emailChanged = original && form.email.trim().toLowerCase() !== String(original.email || "").toLowerCase();

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const onPwChange = (e) => setPw({ ...pw, [e.target.name]: e.target.value });

    const onSave = async (e) => {
        e.preventDefault();
        setNotice(null);
        const next = {};
        if (form.full_name.trim().length > 100) next.full_name = "Họ tên tối đa 100 ký tự.";
        const pe = phoneError(form.phone, { required: false });
        if (pe) next.phone = pe;
        const ee = emailError(form.email);
        if (ee) next.email = ee;
        if (emailChanged && !form.current_password) next.current_password = "Nhập mật khẩu hiện tại để đổi email.";
        setErrors(next);
        if (Object.keys(next).length) return;

        const body = { full_name: form.full_name.trim(), phone: normalizePhone(form.phone), email: form.email.trim() };
        if (emailChanged) body.current_password = form.current_password;
        setSaving(true);
        try {
            const { data } = await api.updateMe(body);
            const user = data.data.user;
            setOriginal(user);
            setForm({ full_name: user.full_name || "", phone: user.phone || "", email: user.email || "", current_password: "" });
            dispatch({ type: UPDATE_USER, payload: { user, token: data.data.token } });
            setNotice({ type: "success", text: "Đã lưu thông tin cá nhân." });
        } catch (err) {
            setNotice({ type: "error", text: apiMessage(err, "Không lưu được thông tin. Vui lòng thử lại.") });
        } finally {
            setSaving(false);
        }
    };

    const onChangePassword = async (e) => {
        e.preventDefault();
        setPwNotice(null);
        const next = {};
        if (!pw.current_password) next.current_password = "Vui lòng nhập mật khẩu hiện tại.";
        const ne = newPasswordError(pw.new_password);
        if (ne) next.new_password = ne;
        else if (pw.new_password === pw.current_password) next.new_password = "Mật khẩu mới phải khác mật khẩu hiện tại.";
        if (pw.confirm !== pw.new_password) next.confirm = "Mật khẩu nhập lại không khớp.";
        setPwErrors(next);
        if (Object.keys(next).length) return;
        setPwSaving(true);
        try {
            const { data } = await api.changePassword({ current_password: pw.current_password, new_password: pw.new_password });
            dispatch({ type: UPDATE_USER, payload: { user: data.data.user, token: data.data.token } });
            setPw({ current_password: "", new_password: "", confirm: "" });
            setPwNotice({ type: "success", text: "Đã đổi mật khẩu. Các thiết bị khác cần đăng nhập lại." });
        } catch (err) {
            setPwNotice({ type: "error", text: apiMessage(err, "Không đổi được mật khẩu. Vui lòng thử lại.") });
        } finally {
            setPwSaving(false);
        }
    };

    if (loadError) return <Notice notice={{ type: "error", text: loadError }} />;
    if (!original) return <p>Đang tải hồ sơ...</p>;

    const field = (name, label, props = {}, hint) => (
        <div className="form-group">
            <label htmlFor={`profile-${name}`}>{label}</label>
            <input id={`profile-${name}`} name={name} className="form-control" value={form[name]} onChange={onChange} aria-invalid={Boolean(errors[name])} {...props} />
            {errors[name] ? <div className="account-error">{errors[name]}</div> : hint ? <div className="account-hint">{hint}</div> : null}
        </div>
    );
    const pwField = (name, label, autoComplete) => (
        <div className="form-group">
            <label htmlFor={`pw-${name}`}>{label}</label>
            <input id={`pw-${name}`} name={name} type="password" className="form-control" autoComplete={autoComplete} value={pw[name]} onChange={onPwChange} aria-invalid={Boolean(pwErrors[name])} maxLength={128} />
            {pwErrors[name] ? <div className="account-error">{pwErrors[name]}</div> : null}
        </div>
    );

    return (
        <>
            <form className="account-section" onSubmit={onSave} noValidate>
                <h3>Thông tin cá nhân</h3>
                <Notice notice={notice} />
                {field("full_name", "Họ và tên", { maxLength: 100, autoComplete: "name" })}
                {field("phone", "Số điện thoại", { type: "tel", maxLength: 20, autoComplete: "tel" }, "Dùng để tự điền khi đặt hàng.")}
                {field("email", "Email đăng nhập", { type: "email", maxLength: 254, autoComplete: "email" })}
                {emailChanged ? field("current_password", "Mật khẩu hiện tại (bắt buộc khi đổi email)", { type: "password", autoComplete: "current-password", maxLength: 128 }) : null}
                <button type="submit" className="account-btn" disabled={saving}>
                    {saving ? "Đang lưu..." : "Lưu thông tin"}
                </button>
            </form>

            <form className="account-section" onSubmit={onChangePassword} noValidate>
                <h3>Đổi mật khẩu</h3>
                <Notice notice={pwNotice} />
                {pwField("current_password", "Mật khẩu hiện tại", "current-password")}
                {pwField("new_password", "Mật khẩu mới", "new-password")}
                <div className="account-hint" style={{ marginTop: -8, marginBottom: 12 }}>
                    Ít nhất 8 ký tự, có cả chữ cái và chữ số.
                </div>
                {pwField("confirm", "Nhập lại mật khẩu mới", "new-password")}
                <button type="submit" className="account-btn" disabled={pwSaving}>
                    {pwSaving ? "Đang đổi..." : "Đổi mật khẩu"}
                </button>
            </form>
        </>
    );
};

export default Profile;
