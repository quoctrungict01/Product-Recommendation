// Thông tin người nhận + nút "Mua ngay".
//  - Khách chưa đăng nhập: nhập tay, đặt hàng bình thường (không cần tài khoản).
//  - Thành viên: tự điền họ tên, số điện thoại, email, địa chỉ từ hồ sơ; sửa ở đây chỉ áp dụng cho đơn này.
//  - Giá luôn do backend tính lại từ database; user_id do backend lấy từ token (giao diện không gửi).
import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { order as orderApi, getMe, previewCoupon } from "../../services/Api";
import CouponBox from "./CouponBox";
import { LOGOUT } from "../../shared/constants/action-type";
import { isTokenExpired } from "../../shared/ultils/authToken";
import AddressFields from "../../shared/components/AddressFields";
import { addressErrors, cleanAddress, emptyAddress, phoneError, emailError, normalizePhone, apiMessage } from "../../shared/ultils/profile";

const EXPIRED = "Phiên đăng nhập đã hết hạn nên đơn chưa được gửi. Hãy đăng nhập lại để đơn được lưu vào tài khoản, hoặc bấm Mua ngay lần nữa để đặt hàng không cần tài khoản.";

const fromProfile = (user) => ({
    info: { fullName: user.full_name || "", phone: user.phone || "", email: user.email || "" },
    address: user.address ? { ...emptyAddress(), ...user.address, district: user.address.district || "" } : emptyAddress(),
});

const defaultApi = { order: orderApi, getMe, previewCoupon };
const errStyle = { color: "#c60a11", fontSize: 13, marginTop: 4 };

const CheckoutForm = ({ carts, onSuccess, api = defaultApi, fetchImpl }) => {
    const dispatch = useDispatch();
    const { isLoggedIn, user, token } = useSelector(({ Auth }) => Auth);
    const initial = isLoggedIn && user ? fromProfile(user) : { info: { fullName: "", phone: "", email: "" }, address: emptyAddress() };
    const [info, setInfo] = React.useState(initial.info);
    const [address, setAddress] = React.useState(initial.address);
    const [addrKey, setAddrKey] = React.useState(0);
    const [errors, setErrors] = React.useState({});
    const [orderError, setOrderError] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [coupon, setCoupon] = React.useState(null); // kết quả xem trước đã áp dụng
    const [couponError, setCouponError] = React.useState("");
    const touched = React.useRef(false);

    // Lấy hồ sơ mới nhất từ backend (thông tin trong localStorage có thể đã cũ). Không ghi đè nếu khách đã bắt đầu sửa.
    React.useEffect(() => {
        if (!isLoggedIn) return undefined;
        let alive = true;
        api.getMe()
            .then(({ data }) => {
                if (!alive || touched.current) return;
                const p = fromProfile(data.data.user);
                setInfo(p.info);
                setAddress(p.address);
                setAddrKey((k) => k + 1);
            })
            .catch(() => {
                /* giữ thông tin đang có; lỗi 401 sẽ tự đăng xuất qua Http interceptor */
            });
        return () => {
            alive = false;
        };
    }, [isLoggedIn, api]);

    const onInfo = (e) => {
        touched.current = true;
        setInfo({ ...info, [e.target.name]: e.target.value });
    };
    const onAddress = (a) => {
        touched.current = true;
        setAddress(a);
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setOrderError("");
        if (!carts || carts.length === 0) {
            setOrderError("Giỏ hàng đang trống.");
            return;
        }
        const next = { ...addressErrors(address) };
        if (!info.fullName.trim()) next.fullName = "Vui lòng nhập họ và tên.";
        else if (info.fullName.trim().length > 100) next.fullName = "Họ tên tối đa 100 ký tự.";
        const pe = phoneError(info.phone);
        if (pe) next.phone = pe;
        const ee = emailError(info.email);
        if (ee) next.email = ee;
        setErrors(next);
        if (Object.keys(next).length) {
            setOrderError("Vui lòng kiểm tra lại thông tin người nhận.");
            return;
        }
        // Đang hiển thị "đã đăng nhập" nhưng token đã hết hạn: không âm thầm đặt thành đơn khách.
        if (isLoggedIn && isTokenExpired(token)) {
            dispatch({ type: LOGOUT });
            setOrderError(EXPIRED);
            return;
        }
        setSubmitting(true);
        try {
            const body = {
                fullName: info.fullName.trim(),
                phone: normalizePhone(info.phone),
                email: info.email.trim(),
                shipping_address: cleanAddress(address),
                items: carts.map((c) => ({ prd_id: c._id, qty: c.qty })),
            };
            // Chỉ gửi MÃ; số tiền giảm do backend tính lại.
            if (coupon) body.coupon_code = coupon.code;
            const { data } = await api.order(body);
            if (data.status === "success") onSuccess && onSuccess(data.data || {});
        } catch (err) {
            const res = err && err.response;
            if (res && res.status === 401) setOrderError(EXPIRED);
            else if (coupon && res && (res.status === 409 || (res.data && res.data.details && res.data.details.field === "coupon_code"))) {
                // Mã vừa hết lượt/hết hạn giữa lúc xem trước và lúc đặt: bỏ mã, giữ giỏ để khách quyết định.
                setCoupon(null);
                setCouponError(apiMessage(err, "Mã giảm giá không còn dùng được."));
                setOrderError("Đơn chưa được tạo vì mã giảm giá không còn dùng được. Bạn có thể đặt lại không dùng mã.");
            } else setOrderError(apiMessage(err, "Không đặt được hàng. Vui lòng thử lại."));
        } finally {
            setSubmitting(false);
        }
    };

    const input = (name, placeholder, props = {}) => (
        <div id={`customer-${name}`} className="col-lg-4 col-md-4 col-sm-12">
            <label htmlFor={`checkout-${name}`} className="sr-only">
                {placeholder}
            </label>
            <input id={`checkout-${name}`} name={name} placeholder={placeholder} className="form-control" value={info[name]} onChange={onInfo} aria-invalid={Boolean(errors[name])} {...props} />
            {errors[name] ? <div style={errStyle}>{errors[name]}</div> : null}
        </div>
    );

    return (
        <div id="customer">
            <p style={{ fontSize: 14, color: "#555", margin: "5px 0 10px" }}>
                {isLoggedIn ? (
                    <>
                        Thông tin được điền sẵn từ <Link to="/account/profile">hồ sơ</Link> của bạn. Thay đổi ở đây chỉ áp dụng cho đơn này, không đổi{" "}
                        <Link to="/account/address">địa chỉ mặc định</Link>.
                    </>
                ) : (
                    <>
                        Bạn có thể đặt hàng không cần tài khoản. <Link to="/login?next=%2FCart">Đăng nhập</Link> để tự điền thông tin và xem lại đơn hàng.
                    </>
                )}
            </p>
            <form onSubmit={onSubmit} noValidate>
                <div className="row">
                    {input("fullName", "Họ và tên (bắt buộc)", { maxLength: 100, autoComplete: "name" })}
                    {input("phone", "Số điện thoại (bắt buộc)", { type: "tel", maxLength: 20, autoComplete: "tel" })}
                    {input("email", "Email (bắt buộc)", { type: "email", maxLength: 254, autoComplete: "email" })}
                </div>
                <div style={{ padding: "0 10px" }}>
                    <AddressFields key={addrKey} idPrefix="checkout-addr" value={address} onChange={onAddress} errors={errors} fetchImpl={fetchImpl} disabled={submitting} />
                </div>
                <CouponBox carts={carts} applied={coupon} onApplied={setCoupon} error={couponError} onError={setCouponError} preview={api.previewCoupon || previewCoupon} disabled={submitting} />
                {orderError ? (
                    <p className="text-danger" role="alert" style={{ padding: "10px 10px 0" }}>
                        {orderError}
                    </p>
                ) : null}
                <div className="row">
                    <div className="by-now col-lg-6 col-md-6 col-sm-12">
                        <a onClick={onSubmit} href="/Cart" aria-disabled={submitting} role="button">
                            <b>{submitting ? "Đang gửi đơn..." : "Mua ngay"}</b>
                            <span>Giao hàng tận nơi siêu tốc</span>
                        </a>
                    </div>
                    <div className="by-now col-lg-6 col-md-6 col-sm-12">
                        <a href="tel:+84988550553">
                            <b>Trả góp Online</b>
                            <span>Vui lòng call (+84) 0988 550 553</span>
                        </a>
                    </div>
                </div>
                <button type="submit" style={{ display: "none" }} aria-hidden="true" tabIndex={-1} />
            </form>
        </div>
    );
};

export default CheckoutForm;
