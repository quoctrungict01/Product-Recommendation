// Đơn hàng của tôi: chỉ đơn gắn với tài khoản đang đăng nhập (backend lọc theo token), mới nhất trước.
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getMyOrders } from "../../services/Api";
import Pagination from "../../shared/components/Pagination";
import { getImageProduct } from "../../shared/ultils";
import { formatPrice, orderCode, formatAddress, ORDER_STATUS, apiMessage } from "../../shared/ultils/profile";
import Notice from "./Notice";

const PAGE_SIZE = 5;
const formatDate = (d) => {
    const date = new Date(d);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
};

const StatusBadge = ({ status }) => {
    const s = ORDER_STATUS[status] || ORDER_STATUS.pending;
    return (
        <span className="order-status" style={{ color: s.color, background: s.bg }}>
            {s.label}
        </span>
    );
};

const Orders = ({ load = getMyOrders }) => {
    const [searchParams] = useSearchParams();
    const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
    const [state, setState] = React.useState({ loading: true, error: "", data: null });

    React.useEffect(() => {
        let alive = true;
        setState((s) => ({ ...s, loading: true, error: "" }));
        load({ params: { page, limit: PAGE_SIZE } })
            .then(({ data }) => alive && setState({ loading: false, error: "", data: data.data }))
            .catch((err) => alive && setState({ loading: false, error: apiMessage(err, "Không tải được đơn hàng. Vui lòng thử lại."), data: null }));
        return () => {
            alive = false;
        };
    }, [load, page]);

    if (state.loading && !state.data) return <p>Đang tải đơn hàng...</p>;
    if (state.error) return <Notice notice={{ type: "error", text: state.error }} />;
    const { docs = [], pages = 0, total = 0 } = state.data || {};

    if (total === 0) {
        return (
            <div className="account-section">
                <p style={{ margin: 0 }}>
                    Bạn chưa có đơn hàng nào. <Link to="/">Tiếp tục mua sắm</Link>
                </p>
                <p className="account-hint">Chỉ đơn đặt khi đã đăng nhập mới hiện ở đây.</p>
            </div>
        );
    }

    return (
        <div>
            <p className="account-hint" style={{ marginTop: 0 }}>
                Tổng cộng {total} đơn hàng.
            </p>
            {docs.map((o) => (
                <div className="order-card" key={o._id}>
                    <div className="order-card-head">
                        <span>
                            Mã đơn <b>{orderCode(o._id)}</b> · {formatDate(o.createdAt)}
                        </span>
                        <StatusBadge status={o.status} />
                    </div>
                    {o.items.map((i) => (
                        <div className="order-item" key={`${o._id}-${i.prd_id}`}>
                            {i.image ? <img src={getImageProduct(i.image)} alt="" /> : <span style={{ width: 44 }} />}
                            <span className="order-item-name">
                                {i.name} <span style={{ color: "#777" }}>× {i.qty}</span>
                            </span>
                            <span>{formatPrice(i.price * i.qty)}</span>
                        </div>
                    ))}
                    {o.product_discount > 0 || o.coupon ? (
                        <div className="order-item" style={{ fontSize: 13, color: "#555", flexDirection: "column", alignItems: "stretch" }}>
                            {o.product_discount > 0 ? (
                                <span style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>Khuyến mãi sản phẩm</span>
                                    <span>-{formatPrice(o.product_discount)}</span>
                                </span>
                            ) : null}
                            {o.coupon ? (
                                <span style={{ display: "flex", justifyContent: "space-between", color: "#2f855a" }}>
                                    <span>Mã giảm giá {o.coupon.code}</span>
                                    <span>-{formatPrice(o.coupon.discount)}</span>
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="order-card-foot">
                        <span style={{ color: "#555" }}>
                            Giao tới: {o.fullName} · {o.phone} · {o.shipping_address ? formatAddress(o.shipping_address) : o.address}
                        </span>
                        <span>
                            Tổng tiền: <span className="order-total">{formatPrice(o.totalPrice)}</span>
                        </span>
                    </div>
                </div>
            ))}
            <Pagination pages={{ totalRows: total, totalPages: pages, currentPage: page, hasNext: page < pages, hasPrev: page > 1, prev: page - 1, next: page + 1 }} />
        </div>
    );
};

export default Orders;
