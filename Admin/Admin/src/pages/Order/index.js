// Quản lý đơn hàng: danh sách phân trang (backend), lọc trạng thái, tìm theo mã đơn/tên/SĐT/email.
// Đơn demo cũ không có trạng thái được hiển thị là "Chờ xác nhận" (không ghi gì vào database).
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminOrders } from "../../services/Api";
import { formatMoney, formatDate, orderCode, ORDER_STATUS, ORDER_STATUS_KEYS, apiMessage } from "../../shared/ultils/format";
import Pager from "../../shared/components/Pager";
import PageShell from "../../shared/components/PageShell";

export const PAGE_SIZE = 20;
const defaultApi = { getAdminOrders };

export const StatusLabel = ({ status }) => {
    const s = ORDER_STATUS[status] || ORDER_STATUS.pending;
    return <span className={s.className}>{s.label}</span>;
};

const Order = ({ api = defaultApi }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
    const status = ORDER_STATUS_KEYS.includes(searchParams.get("status")) ? searchParams.get("status") : "";
    const q = searchParams.get("q") || "";
    const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
    const [keyword, setKeyword] = React.useState(q);
    const [result, setResult] = React.useState({ status: "loading", docs: [], total: 0, totalPages: 0, message: "" });
    const [reload, setReload] = React.useState(0);
    const latest = React.useRef(0);

    React.useEffect(() => setKeyword(q), [q]);
    React.useEffect(() => {
        const id = ++latest.current;
        const params = { page, limit: PAGE_SIZE, sort };
        if (status) params.status = status;
        if (q) params.q = q;
        setResult((r) => ({ ...r, status: "loading" }));
        api.getAdminOrders({ params })
            .then(({ data }) => id === latest.current && setResult({ status: "ready", docs: data.data.docs || [], total: data.data.total || 0, totalPages: data.data.totalPages || 0, message: "" }))
            .catch((err) => id === latest.current && setResult({ status: "error", docs: [], total: 0, totalPages: 0, message: apiMessage(err, "Không tải được danh sách đơn hàng.") }));
    }, [api, page, status, q, sort, reload]);

    const update = (patch, keepPage = false) => {
        const next = new URLSearchParams(searchParams);
        for (const [k, v] of Object.entries(patch)) {
            if (!v || (k === "page" && v === 1) || (k === "sort" && v === "newest")) next.delete(k);
            else next.set(k, String(v));
        }
        if (!keepPage) next.delete("page");
        setSearchParams(next);
    };

    return (
        <PageShell title="Quản lý đơn hàng" crumbs={[{ label: "Quản lý đơn hàng" }]}>
            <div className="panel panel-default">
                <div className="panel-body">
                    <form
                        className="row"
                        role="search"
                        onSubmit={(e) => {
                            e.preventDefault();
                            update({ q: keyword.trim() });
                        }}
                    >
                        <div className="col-md-6 form-group">
                            <label htmlFor="ord-q">Tìm đơn hàng</label>
                            <div className="input-group">
                                <input id="ord-q" className="form-control" maxLength={100} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Mã đơn (#A7B8C9D0), tên khách, số điện thoại hoặc email" />
                                <span className="input-group-btn">
                                    <button className="btn btn-primary" type="submit">
                                        Tìm
                                    </button>
                                </span>
                            </div>
                        </div>
                        <div className="col-md-3 form-group">
                            <label htmlFor="ord-status">Trạng thái</label>
                            <select id="ord-status" className="form-control" value={status} onChange={(e) => update({ status: e.target.value })}>
                                <option value="">Tất cả</option>
                                {ORDER_STATUS_KEYS.map((k) => (
                                    <option key={k} value={k}>
                                        {ORDER_STATUS[k].label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3 form-group">
                            <label htmlFor="ord-sort">Sắp xếp</label>
                            <select id="ord-sort" className="form-control" value={sort} onChange={(e) => update({ sort: e.target.value })}>
                                <option value="newest">Mới nhất trước</option>
                                <option value="oldest">Cũ nhất trước</option>
                            </select>
                        </div>
                    </form>

                    {result.status === "error" ? (
                        <div className="alert alert-danger" role="alert">
                            {result.message}{" "}
                            <button type="button" className="btn btn-default btn-xs" onClick={() => setReload((n) => n + 1)}>
                                Thử lại
                            </button>
                        </div>
                    ) : (
                        <>
                            <p style={{ color: "#666" }} role="status">
                                {result.status === "loading" ? "Đang tải..." : `Có ${result.total} đơn hàng${result.totalPages > 1 ? ` · Trang ${page}/${result.totalPages}` : ""}`}
                            </p>
                            <div className="table-responsive">
                                <table className="table table-striped table-bordered table-hover">
                                    <thead>
                                        <tr>
                                            <th>Mã đơn</th>
                                            <th>Ngày đặt</th>
                                            <th>Khách hàng</th>
                                            <th>Số SP</th>
                                            <th>Tổng tiền</th>
                                            <th>Trạng thái</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.status === "ready" && result.docs.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ textAlign: "center", padding: 20 }}>
                                                    Không có đơn hàng nào phù hợp.
                                                </td>
                                            </tr>
                                        ) : null}
                                        {result.docs.map((o) => (
                                            <tr key={o._id}>
                                                <td>
                                                    <code>{orderCode(o._id)}</code>
                                                </td>
                                                <td>{formatDate(o.createdAt)}</td>
                                                <td>
                                                    <b>{o.fullName}</b> {o.is_member ? <span className="label label-info">Thành viên</span> : <span className="label label-default">Khách</span>}
                                                    <div style={{ fontSize: 12, color: "#666" }}>
                                                        {o.phone} · {o.email}
                                                    </div>
                                                </td>
                                                <td>{o.item_count}</td>
                                                <td>
                                                    <b>{formatMoney(o.totalPrice)}</b>
                                                </td>
                                                <td>
                                                    <StatusLabel status={o.status} />
                                                </td>
                                                <td>
                                                    <Link to={`/order/${o._id}`} className="btn btn-primary btn-sm" aria-label={`Xem đơn ${orderCode(o._id)}`}>
                                                        Xem / xử lý
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
                <div className="panel-footer">
                    <Pager page={page} totalPages={result.totalPages} onChange={(p) => update({ page: p }, true)} disabled={result.status === "loading"} />
                </div>
            </div>
        </PageShell>
    );
};

export default Order;
