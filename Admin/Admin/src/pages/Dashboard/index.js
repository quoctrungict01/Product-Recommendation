// Dashboard quản trị — số liệu lấy từ API thống kê (backend: libs/stats.js), không có số dán cứng.
// Doanh thu thực tế = tổng tiền các đơn "Đã giao", ghi nhận theo ngày giao (giờ Việt Nam).
import React from "react";
import { Link } from "react-router-dom";
import { getStatsSummary, getStatsRevenue, getTopProducts } from "../../services/Api";
import { formatMoney, apiMessage, ORDER_STATUS, ORDER_STATUS_KEYS } from "../../shared/ultils/format";
import BarChart from "../../shared/components/BarChart";
import PageShell from "../../shared/components/PageShell";

const defaultApi = { getStatsSummary, getStatsRevenue, getTopProducts };

const useLoad = (fn, deps) => {
    const [state, setState] = React.useState({ status: "loading", data: null, message: "" });
    const [reload, setReload] = React.useState(0);
    React.useEffect(() => {
        let alive = true;
        setState((s) => ({ ...s, status: "loading", message: "" }));
        fn()
            .then(({ data }) => alive && setState({ status: "ready", data: data.data, message: "" }))
            .catch((err) => alive && setState({ status: "error", data: null, message: apiMessage(err, "Không tải được số liệu.") }));
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, reload]);
    return [state, () => setReload((n) => n + 1)];
};

const ErrorBox = ({ message, onRetry }) => (
    <div className="alert alert-danger" role="alert" style={{ marginBottom: 0 }}>
        {message}{" "}
        <button type="button" className="btn btn-default btn-xs" onClick={onRetry}>
            Thử lại
        </button>
    </div>
);
const Loading = () => (
    <p role="status" style={{ color: "#777", margin: 0 }}>
        Đang tải...
    </p>
);

const Card = ({ title, value, sub }) => (
    <div className="col-xs-12 col-sm-6 col-lg-4">
        <div className="panel panel-default" style={{ minHeight: 96 }}>
            <div className="panel-body">
                <div style={{ fontSize: 13, color: "#666" }}>{title}</div>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#222", margin: "4px 0" }}>{value}</div>
                {sub ? <div style={{ fontSize: 12, color: "#777" }}>{sub}</div> : null}
            </div>
        </div>
    </div>
);

const labelFor = (key, group) => (group === "month" ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : `${key.slice(8, 10)}/${key.slice(5, 7)}`);

const Dashboard = ({ api = defaultApi }) => {
    const [range, setRange] = React.useState({ from: "", to: "", group: "day" });
    const [draft, setDraft] = React.useState(range);
    const [rangeError, setRangeError] = React.useState("");
    const [topSort, setTopSort] = React.useState("qty");
    const params = {};
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;
    const rangeKey = JSON.stringify(range);

    const [summary, reloadSummary] = useLoad(() => api.getStatsSummary(), [api]);
    const [revenue, reloadRevenue] = useLoad(() => api.getStatsRevenue({ params: { ...params, group: range.group } }), [api, rangeKey]);
    const [top, reloadTop] = useLoad(() => api.getTopProducts({ params: { ...params, sort: topSort, limit: 10 } }), [api, rangeKey, topSort]);

    const applyRange = (e) => {
        e.preventDefault();
        if (draft.from && draft.to && draft.from > draft.to) return setRangeError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
        setRangeError("");
        setRange({ ...draft });
    };

    const s = summary.data;
    const r = revenue.data;
    const statusTotal = s ? ORDER_STATUS_KEYS.reduce((t, k) => t + (s.orders.by_status[k] || 0), 0) : 0;

    return (
        <PageShell title="Trang chủ quản trị" crumbs={[{ label: "Trang chủ quản trị" }]}>
            <p style={{ color: "#666", marginTop: -10 }}>Doanh thu thực tế chỉ tính đơn <b>Đã giao</b> (theo ngày giao, giờ Việt Nam). Đơn chờ xác nhận, đang giao, đã hủy và đơn demo cũ không được tính.</p>

            {summary.status === "error" ? (
                <ErrorBox message={summary.message} onRetry={reloadSummary} />
            ) : summary.status === "loading" ? (
                <Loading />
            ) : (
                <div className="row">
                    <Card title="Doanh thu hôm nay" value={formatMoney(s.revenue.today.revenue)} sub={`${s.revenue.today.orders} đơn đã giao`} />
                    <Card title="Doanh thu tháng này" value={formatMoney(s.revenue.month.revenue)} sub={`${s.revenue.month.orders} đơn · TB ${formatMoney(s.revenue.month.average_order_value)}/đơn`} />
                    <Card title="Doanh thu năm nay" value={formatMoney(s.revenue.year.revenue)} sub={`${s.revenue.year.orders} đơn · TB ${formatMoney(s.revenue.year.average_order_value)}/đơn`} />
                    <Card title="Tổng số đơn hàng" value={s.orders.total.toLocaleString("vi-VN")} sub="Mọi trạng thái, gồm đơn demo" />
                    <Card title="Chờ xác nhận" value={s.orders.pending.toLocaleString("vi-VN")} sub={<Link to="/order?status=pending">Xử lý đơn chờ »</Link>} />
                    <Card title="Đang xử lý" value={s.orders.in_progress.toLocaleString("vi-VN")} sub="Đã xác nhận + đang giao" />
                </div>
            )}

            <div className="panel panel-default">
                <div className="panel-heading">Doanh thu theo {range.group === "month" ? "tháng" : "ngày"}</div>
                <div className="panel-body">
                    <form className="form-inline" onSubmit={applyRange} style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                        <div className="form-group">
                            <label htmlFor="st-from" style={{ display: "block", fontSize: 12 }}>
                                Từ ngày
                            </label>
                            <input id="st-from" type="date" className="form-control" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="st-to" style={{ display: "block", fontSize: 12 }}>
                                Đến ngày
                            </label>
                            <input id="st-to" type="date" className="form-control" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="st-group" style={{ display: "block", fontSize: 12 }}>
                                Nhóm theo
                            </label>
                            <select id="st-group" className="form-control" value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })}>
                                <option value="day">Ngày</option>
                                <option value="month">Tháng</option>
                            </select>
                        </div>
                        <button type="submit" className="btn btn-primary">
                            Xem
                        </button>
                        <span style={{ fontSize: 12, color: "#888" }}>Để trống: 30 ngày (theo ngày) hoặc 12 tháng (theo tháng) gần nhất.</span>
                    </form>
                    {rangeError ? (
                        <div className="text-danger" role="alert">
                            {rangeError}
                        </div>
                    ) : null}
                    {revenue.status === "error" ? (
                        <ErrorBox message={revenue.message} onRetry={reloadRevenue} />
                    ) : revenue.status === "loading" ? (
                        <Loading />
                    ) : (
                        <>
                            <p style={{ fontSize: 14 }}>
                                {labelFor(r.range.from, "day")}/{r.range.from.slice(0, 4)} – {labelFor(r.range.to, "day")}/{r.range.to.slice(0, 4)}: <b>{formatMoney(r.totals.revenue)}</b> từ {r.totals.orders} đơn đã giao · giá trị trung bình{" "}
                                <b>{formatMoney(r.totals.average_order_value)}</b>/đơn · {r.orders_created.total} đơn mới được tạo ({r.orders_created.by_status.cancelled} đã hủy)
                            </p>
                            {r.totals.orders === 0 ? (
                                <div className="well well-sm" style={{ textAlign: "center", color: "#666" }}>
                                    Chưa có đơn nào được giao thành công trong khoảng thời gian này.
                                </div>
                            ) : (
                                <BarChart
                                    title={`Doanh thu theo ${r.range.group === "month" ? "tháng" : "ngày"}`}
                                    formatValue={formatMoney}
                                    data={r.series.map((b) => ({ key: b.key, label: labelFor(b.key, r.range.group), value: b.revenue, detail: `${b.orders} đơn` }))}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="row">
                <div className="col-md-7">
                    <div className="panel panel-default">
                        <div className="panel-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                            <span>Sản phẩm bán chạy (đơn đã giao, cùng khoảng thời gian)</span>
                            <select aria-label="Xếp hạng theo" className="form-control input-sm" style={{ width: "auto" }} value={topSort} onChange={(e) => setTopSort(e.target.value)}>
                                <option value="qty">Theo số lượng</option>
                                <option value="revenue">Theo doanh thu</option>
                            </select>
                        </div>
                        <div className="panel-body">
                            {top.status === "error" ? (
                                <ErrorBox message={top.message} onRetry={reloadTop} />
                            ) : top.status === "loading" ? (
                                <Loading />
                            ) : top.data.docs.length === 0 ? (
                                <p style={{ color: "#666", margin: 0 }}>Chưa có sản phẩm nào được bán (giao thành công) trong khoảng này.</p>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-striped" style={{ marginBottom: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Sản phẩm</th>
                                                <th>Số lượng</th>
                                                <th>Doanh thu*</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {top.data.docs.map((p, i) => (
                                                <tr key={p.prd_id}>
                                                    <td>{i + 1}</td>
                                                    <td>{p.name}</td>
                                                    <td>{p.qty}</td>
                                                    <td>{formatMoney(p.revenue)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <p style={{ fontSize: 12, color: "#888", margin: "6px 0 0" }}>* Đơn giá lúc bán × số lượng (đã trừ khuyến mãi sản phẩm, chưa trừ mã giảm giá của cả đơn).</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="col-md-5">
                    <div className="panel panel-default">
                        <div className="panel-heading">Đơn hàng theo trạng thái (toàn bộ)</div>
                        <div className="panel-body">
                            {summary.status === "error" ? (
                                <ErrorBox message={summary.message} onRetry={reloadSummary} />
                            ) : summary.status === "loading" ? (
                                <Loading />
                            ) : statusTotal === 0 ? (
                                <p style={{ color: "#666", margin: 0 }}>Chưa có đơn hàng nào.</p>
                            ) : (
                                <ul style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Số đơn theo trạng thái">
                                    {ORDER_STATUS_KEYS.map((k) => {
                                        const n = s.orders.by_status[k] || 0;
                                        const pct = statusTotal ? Math.round((n * 100) / statusTotal) : 0;
                                        return (
                                            <li key={k} style={{ marginBottom: 10 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                                    <Link to={`/order?status=${k}`}>
                                                        <span className={ORDER_STATUS[k].className}>{ORDER_STATUS[k].label}</span>
                                                    </Link>
                                                    <span>
                                                        {n.toLocaleString("vi-VN")} đơn ({pct}%)
                                                    </span>
                                                </div>
                                                <div style={{ background: "#eee", borderRadius: 4, height: 8, marginTop: 4 }}>
                                                    <div style={{ width: `${pct}%`, minWidth: n ? 4 : 0, background: "#8a8a8a", height: 8, borderRadius: 4 }} />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            <p style={{ fontSize: 12, color: "#888", margin: "6px 0 0" }}>Đơn demo cũ chưa có trạng thái được tính là "Chờ xác nhận".</p>
                        </div>
                    </div>
                </div>
            </div>
        </PageShell>
    );
};

export default Dashboard;
