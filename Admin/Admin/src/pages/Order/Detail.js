// Chi tiết đơn hàng + đổi trạng thái. Nút chỉ hiện các bước backend cho phép (next_statuses);
// backend vẫn kiểm tra lại (libs/order-status.js). Hủy đơn phải xác nhận.
import React from "react";
import { Link, useParams } from "react-router-dom";
import { getAdminOrder, updateOrderStatus } from "../../services/Api";
import { getImageProduct } from "../../shared/ultils";
import { formatMoney, formatDate, orderCode, ORDER_STATUS, apiMessage } from "../../shared/ultils/format";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";
import { StatusLabel } from "./index";

const defaultApi = { getAdminOrder, updateOrderStatus };
const ACTION_LABEL = {
    confirmed: "Xác nhận đơn",
    shipping: "Bắt đầu giao hàng",
    delivered: "Đã giao thành công",
    cancelled: "Hủy đơn",
};

const formatAddress = (a) => (a ? [a.detail, a.ward, a.district, a.province].filter(Boolean).join(", ") : "");

const OrderDetail = ({ api = defaultApi, confirmFn = (m) => window.confirm(m) }) => {
    const { id } = useParams();
    const [order, setOrder] = React.useState(null);
    const [loadError, setLoadError] = React.useState("");
    const [notice, setNotice] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        setLoadError("");
        api.getAdminOrder(id)
            .then(({ data }) => alive && setOrder(data.data))
            .catch((err) => alive && setLoadError(apiMessage(err, "Không tải được đơn hàng.")));
        return () => {
            alive = false;
        };
    }, [api, id]);

    const change = async (to) => {
        if (busy) return;
        const label = ORDER_STATUS[to].label;
        const msg = to === "cancelled" ? `Hủy đơn ${orderCode(order._id)}?\nĐơn đã hủy không thể khôi phục.` : `Chuyển đơn ${orderCode(order._id)} sang "${label}"?`;
        if (!confirmFn(msg)) return;
        setBusy(true);
        setNotice(null);
        try {
            const { data } = await api.updateOrderStatus(order._id, to);
            setOrder(data.data);
            setNotice({ type: "success", text: data.message || `Đã chuyển đơn sang "${label}".` });
        } catch (err) {
            setNotice({ type: "danger", text: apiMessage(err, "Không cập nhật được trạng thái đơn.") });
            // Có thể đơn vừa được người khác đổi: tải lại để hiện đúng trạng thái.
            api.getAdminOrder(order._id).then(({ data }) => setOrder(data.data)).catch(() => {});
        } finally {
            setBusy(false);
        }
    };

    const crumbs = [{ label: "Quản lý đơn hàng", to: "/order" }, { label: order ? `Đơn ${orderCode(order._id)}` : "Chi tiết đơn" }];
    if (loadError) {
        return (
            <PageShell title="Chi tiết đơn hàng" crumbs={crumbs}>
                <div className="alert alert-danger" role="alert">
                    {loadError} <Link to="/order">Về danh sách</Link>
                </div>
            </PageShell>
        );
    }
    if (!order) {
        return (
            <PageShell title="Chi tiết đơn hàng" crumbs={crumbs}>
                <p role="status">Đang tải đơn hàng...</p>
            </PageShell>
        );
    }
    const itemsTotal = order.items.reduce((n, i) => n + i.subtotal, 0);
    // Đơn từ đợt 5 lưu chi tiết giá; đơn cũ không có -> chỉ hiện tổng đã lưu (không tính lại theo giá hiện tại).
    const couponDiscount = typeof order.coupon_discount === "number" ? order.coupon_discount : 0;
    const expectedTotal = itemsTotal - couponDiscount;
    const address = formatAddress(order.shipping_address) || order.address;

    return (
        <PageShell title={`Đơn hàng ${orderCode(order._id)}`} crumbs={crumbs} actions={<Link to="/order" className="btn btn-default">« Danh sách đơn</Link>}>
            <Notice notice={notice} onClose={() => setNotice(null)} />
            <div className="row">
                <div className="col-md-6">
                    <div className="panel panel-default">
                        <div className="panel-heading">Trạng thái</div>
                        <div className="panel-body">
                            <p style={{ fontSize: 16 }}>
                                Hiện tại: <StatusLabel status={order.status} />
                                {order.legacy_status ? <span style={{ fontSize: 12, color: "#888" }}> (đơn cũ chưa có trạng thái, mặc định Chờ xác nhận)</span> : null}
                            </p>
                            {order.next_statuses.length ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {order.next_statuses.map((s) => (
                                        <button key={s} type="button" className={`btn ${s === "cancelled" ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={() => change(s)}>
                                            {ACTION_LABEL[s]}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: "#666" }}>Đơn đã ở trạng thái cuối, không thể thay đổi.</p>
                            )}
                            <p style={{ fontSize: 12, color: "#888", marginTop: 10 }}>Quy trình: Chờ xác nhận → Đã xác nhận → Đang giao → Đã giao. Chỉ hủy được khi đơn chưa giao cho vận chuyển.</p>
                            {order.status_history.length ? (
                                <ul style={{ fontSize: 13, paddingLeft: 18 }} aria-label="Lịch sử trạng thái">
                                    {order.status_history.map((h, i) => (
                                        <li key={i}>
                                            {formatDate(h.at)}: {ORDER_STATUS[h.from].label} → {ORDER_STATUS[h.to].label}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div className="col-md-6">
                    <div className="panel panel-default">
                        <div className="panel-heading">Khách hàng & giao hàng</div>
                        <div className="panel-body">
                            <p>
                                <b>Người nhận:</b> {order.fullName}
                                <br />
                                <b>Điện thoại:</b> {order.phone}
                                <br />
                                <b>Email:</b> {order.email}
                                <br />
                                <b>Địa chỉ giao:</b> {address}
                                <br />
                                <b>Tài khoản:</b> {order.user ? `${order.user.full_name || ""} ${order.user.email ? `(${order.user.email})` : "(tài khoản đã bị xóa)"}` : "Khách không đăng nhập"}
                                <br />
                                <b>Ngày đặt:</b> {formatDate(order.createdAt)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="panel panel-default">
                <div className="panel-heading">Sản phẩm</div>
                <div className="panel-body">
                    <div className="table-responsive">
                        <table className="table table-bordered">
                            <thead>
                                <tr>
                                    <th>Sản phẩm</th>
                                    <th>Đơn giá (lúc đặt)</th>
                                    <th>Số lượng</th>
                                    <th>Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((i) => (
                                    <tr key={i.prd_id}>
                                        <td>
                                            {i.image ? <img src={getImageProduct(i.image)} alt="" style={{ width: 40, height: 40, objectFit: "contain", marginRight: 8 }} /> : null}
                                            {i.name}
                                        </td>
                                        <td>
                                            {formatMoney(i.price)}
                                            {typeof i.original_price === "number" && i.original_price > i.price ? (
                                                <div style={{ fontSize: 12 }}>
                                                    <del style={{ color: "#888" }}>{formatMoney(i.original_price)}</del>
                                                </div>
                                            ) : null}
                                        </td>
                                        <td>{i.qty}</td>
                                        <td>{formatMoney(i.subtotal)}</td>
                                    </tr>
                                ))}
                                {typeof order.subtotal_original === "number" ? (
                                    <>
                                        <tr>
                                            <td colSpan={3} style={{ textAlign: "right" }}>
                                                Tổng giá gốc
                                            </td>
                                            <td>{formatMoney(order.subtotal_original)}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan={3} style={{ textAlign: "right" }}>
                                                Khuyến mãi sản phẩm
                                            </td>
                                            <td>-{formatMoney(order.product_discount || 0)}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan={3} style={{ textAlign: "right" }}>
                                                Mã giảm giá {order.coupon ? <code>{order.coupon.code}</code> : "(không dùng)"}
                                            </td>
                                            <td>-{formatMoney(couponDiscount)}</td>
                                        </tr>
                                    </>
                                ) : null}
                                <tr>
                                    <td colSpan={3} style={{ textAlign: "right" }}>
                                        <b>Tổng tiền đơn hàng</b>
                                    </td>
                                    <td>
                                        <b style={{ color: "#c9302c" }}>{formatMoney(order.totalPrice)}</b>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    {expectedTotal !== order.totalPrice ? <p className="text-warning">Lưu ý: tổng các dòng trừ mã giảm giá ({formatMoney(expectedTotal)}) khác tổng tiền đã lưu của đơn.</p> : null}
                    {typeof order.subtotal_original !== "number" ? <p style={{ fontSize: 12, color: "#888" }}>Đơn đặt trước khi có chi tiết giá: chỉ hiển thị đơn giá và tổng tiền đã lưu lúc đặt.</p> : null}
                </div>
            </div>
        </PageShell>
    );
};

export default OrderDetail;
