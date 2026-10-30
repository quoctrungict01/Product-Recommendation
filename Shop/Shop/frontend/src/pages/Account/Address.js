// Địa chỉ giao hàng mặc định (dùng để tự điền khi đặt hàng).
import React from "react";
import { useDispatch } from "react-redux";
import { getMe, updateMe } from "../../services/Api";
import { UPDATE_USER } from "../../shared/constants/action-type";
import AddressFields from "../../shared/components/AddressFields";
import { addressErrors, cleanAddress, emptyAddress, formatAddress, apiMessage } from "../../shared/ultils/profile";
import Notice from "./Notice";

const defaultApi = { getMe, updateMe };

const Address = ({ api = defaultApi, fetchImpl }) => {
    const dispatch = useDispatch();
    const [saved, setSaved] = React.useState(undefined); // undefined = đang tải; null = chưa có địa chỉ
    const [address, setAddress] = React.useState(emptyAddress());
    const [errors, setErrors] = React.useState({});
    const [notice, setNotice] = React.useState(null);
    const [saving, setSaving] = React.useState(false);
    const [formKey, setFormKey] = React.useState(0);

    React.useEffect(() => {
        let alive = true;
        api.getMe()
            .then(({ data }) => {
                if (!alive) return;
                const a = data.data.user.address || null;
                setSaved(a);
                setAddress(a ? { ...emptyAddress(), ...a, district: a.district || "" } : emptyAddress());
            })
            .catch((err) => {
                if (!alive) return;
                setSaved(null);
                setNotice({ type: "error", text: apiMessage(err, "Không tải được địa chỉ đã lưu.") });
            });
        return () => {
            alive = false;
        };
    }, [api]);

    const persist = async (value, successText) => {
        setSaving(true);
        setNotice(null);
        try {
            const { data } = await api.updateMe({ address: value });
            const user = data.data.user;
            setSaved(user.address || null);
            dispatch({ type: UPDATE_USER, payload: { user } });
            setNotice({ type: "success", text: successText });
            return true;
        } catch (err) {
            setNotice({ type: "error", text: apiMessage(err, "Không lưu được địa chỉ. Vui lòng thử lại.") });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const onSave = async (e) => {
        e.preventDefault();
        const errs = addressErrors(address);
        setErrors(errs);
        if (Object.keys(errs).length) {
            setNotice({ type: "error", text: "Vui lòng kiểm tra lại các ô được đánh dấu." });
            return;
        }
        await persist(cleanAddress(address), "Đã lưu địa chỉ mặc định.");
    };

    const onDelete = async () => {
        // eslint-disable-next-line no-restricted-globals
        if (!window.confirm("Xóa địa chỉ mặc định?")) return;
        if (await persist(null, "Đã xóa địa chỉ mặc định.")) {
            setAddress(emptyAddress());
            setErrors({});
            setFormKey((k) => k + 1);
        }
    };

    if (saved === undefined) return <p>Đang tải địa chỉ...</p>;

    return (
        <form className="account-section" onSubmit={onSave} noValidate>
            <h3>Địa chỉ giao hàng mặc định</h3>
            <Notice notice={notice} />
            <p className="account-hint" style={{ marginTop: 0 }}>
                {saved ? (
                    <>
                        Đang lưu: <b>{formatAddress(saved)}</b>
                    </>
                ) : (
                    "Bạn chưa lưu địa chỉ. Địa chỉ mặc định sẽ được tự điền khi đặt hàng."
                )}
            </p>
            <AddressFields key={formKey} idPrefix="account-addr" value={address} onChange={setAddress} errors={errors} fetchImpl={fetchImpl} disabled={saving} />
            <div style={{ marginTop: 12 }}>
                <button type="submit" className="account-btn" disabled={saving}>
                    {saving ? "Đang lưu..." : "Lưu địa chỉ"}
                </button>
                {saved ? (
                    <button type="button" className="account-btn-secondary" onClick={onDelete} disabled={saving}>
                        Xóa địa chỉ
                    </button>
                ) : null}
            </div>
        </form>
    );
};

export default Address;
