// Ô nhập mã giảm giá ở checkout. "Áp dụng" chỉ XEM TRƯỚC (backend không trừ lượt); số tiền thật được backend
// tính lại khi đặt hàng. Giỏ hàng thay đổi -> bỏ kết quả xem trước cũ để không hiển thị số tiền sai.
import React from "react";
import { formatPrice, apiMessage } from "../../shared/ultils/profile";

const row = { display: "flex", justifyContent: "space-between", gap: 10 };

const CouponBox = ({ carts, applied, onApplied, error, onError, preview, disabled }) => {
    const [code, setCode] = React.useState(applied ? applied.code : "");
    const [loading, setLoading] = React.useState(false);
    const cartKey = (carts || []).map((c) => `${c._id}:${c.qty}`).join(",");
    const lastKey = React.useRef(cartKey);

    React.useEffect(() => {
        if (lastKey.current !== cartKey) {
            lastKey.current = cartKey;
            if (applied) {
                onApplied(null);
                onError("Giỏ hàng đã thay đổi, vui lòng bấm Áp dụng lại mã giảm giá.");
            }
        }
    }, [cartKey, applied, onApplied, onError]);

    const apply = async () => {
        const c = code.trim();
        onError("");
        if (!c) return onError("Vui lòng nhập mã giảm giá.");
        if (!carts || !carts.length) return onError("Giỏ hàng đang trống.");
        setLoading(true);
        try {
            const { data } = await preview({ code: c, items: carts.map((i) => ({ prd_id: i._id, qty: i.qty })) });
            onApplied(data.data);
            setCode(data.data.code);
        } catch (err) {
            onApplied(null);
            onError(apiMessage(err, "Không kiểm tra được mã giảm giá. Vui lòng thử lại."));
        } finally {
            setLoading(false);
        }
    };
    const remove = () => {
        onApplied(null);
        onError("");
        setCode("");
    };

    return (
        <div style={{ border: "1px dashed #eb1f27", borderRadius: 6, padding: 10, margin: "10px 10px 0" }}>
            <label htmlFor="checkout-coupon" style={{ fontWeight: "bold", fontSize: 14 }}>
                Mã giảm giá
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                    id="checkout-coupon"
                    className="form-control"
                    style={{ flex: "1 1 160px", textTransform: "uppercase" }}
                    maxLength={30}
                    placeholder="Nhập mã (nếu có)"
                    value={code}
                    disabled={disabled || loading || Boolean(applied)}
                    onChange={(e) => {
                        setCode(e.target.value);
                        onError("");
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            if (!applied) apply();
                        }
                    }}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "checkout-coupon-error" : undefined}
                />
                {applied ? (
                    <button type="button" className="btn btn-outline-secondary" onClick={remove} disabled={disabled}>
                        Bỏ mã
                    </button>
                ) : (
                    <button type="button" className="btn btn-danger" onClick={apply} disabled={disabled || loading}>
                        {loading ? "Đang kiểm tra..." : "Áp dụng"}
                    </button>
                )}
            </div>
            {error ? (
                <div id="checkout-coupon-error" role="alert" style={{ color: "#c60a11", fontSize: 13, marginTop: 6 }}>
                    {error}
                </div>
            ) : null}
            {applied ? (
                <div style={{ fontSize: 14, marginTop: 8 }} aria-live="polite">
                    <div style={row}>
                        <span>Tạm tính (đã gồm khuyến mãi sản phẩm)</span>
                        <span>{formatPrice(applied.subtotal)}</span>
                    </div>
                    <div style={{ ...row, color: "#2f855a" }}>
                        <span>
                            Mã {applied.code}
                            {applied.type === "percent" ? ` (-${applied.value}%)` : ""}
                        </span>
                        <span>-{formatPrice(applied.coupon_discount)}</span>
                    </div>
                    <div style={{ ...row, fontWeight: "bold" }}>
                        <span>Dự kiến thanh toán</span>
                        <span style={{ color: "#eb1f27" }}>{formatPrice(applied.total)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#777" }}>Số tiền cuối cùng do hệ thống xác nhận khi đặt hàng.</div>
                </div>
            ) : null}
        </div>
    );
};

export default CouponBox;
