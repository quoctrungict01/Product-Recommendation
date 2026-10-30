// Quản lý mã giảm giá: danh sách (tìm mã, lọc trạng thái, phân trang), bật/vô hiệu hóa có xác nhận.
import React from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { getCoupons, setCouponActive } from "../../services/Api";
import { formatMoney, formatDate, apiMessage } from "../../shared/ultils/format";
import Pager from "../../shared/components/Pager";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";

export const PAGE_SIZE = 20;
export const COUPON_STATE = {
    active: { label: "Đang hiệu lực", className: "label label-success" },
    scheduled: { label: "Chưa bắt đầu", className: "label label-info" },
    expired: { label: "Hết hạn", className: "label label-default" },
    used_up: { label: "Hết lượt", className: "label label-warning" },
    disabled: { label: "Đã vô hiệu hóa", className: "label label-danger" },
};
const defaultApi = { getCoupons, setCouponActive };

export const describeCoupon = (c) => {
    const main = c.type === "percent" ? `Giảm ${c.value}%${c.max_discount ? ` (tối đa ${formatMoney(c.max_discount)})` : ""}` : `Giảm ${formatMoney(c.value)}`;
    return c.min_order ? `${main} · đơn từ ${formatMoney(c.min_order)}` : main;
};

const Coupon = ({ api = defaultApi, confirmFn = (m) => window.confirm(m) }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
    const state = COUPON_STATE[searchParams.get("state")] ? searchParams.get("state") : "";
    const q = searchParams.get("q") || "";
    const [keyword, setKeyword] = React.useState(q);
    const [result, setResult] = React.useState({ status: "loading", docs: [], total: 0, totalPages: 0, message: "" });
    const [notice, setNotice] = React.useState((location.state && location.state.notice) || null);
    const [reload, setReload] = React.useState(0);
    const [busy, setBusy] = React.useState(null);

    React.useEffect(() => {
        let alive = true;
        const params = { page, limit: PAGE_SIZE };
        if (state) params.state = state;
        if (q) params.q = q;
        setResult((r) => ({ ...r, status: "loading" }));
        api.getCoupons({ params })
            .then(({ data }) => alive && setResult({ status: "ready", docs: data.data.docs || [], total: data.data.total || 0, totalPages: data.data.totalPages || 0, message: "" }))
            .catch((err) => alive && setResult({ status: "error", docs: [], total: 0, totalPages: 0, message: apiMessage(err, "Không tải được danh sách mã giảm giá.") }));
        return () => {
            alive = false;
        };
    }, [api, page, state, q, reload]);

    const update = (patch, keepPage = false) => {
        const next = new URLSearchParams(searchParams);
        for (const [k, v] of Object.entries(patch)) {
            if (!v || (k === "page" && v === 1)) next.delete(k);
            else next.set(k, String(v));
        }
        if (!keepPage) next.delete("page");
        setSearchParams(next);
    };

    const toggle = async (c) => {
        if (busy) return;
        const enable = !c.is_active;
        const msg = enable ? `Bật lại mã "${c.code}"?` : `Vô hiệu hóa mã "${c.code}"?\nKhách sẽ không dùng được mã này nữa (đơn đã đặt không bị ảnh hưởng).`;
        if (!confirmFn(msg)) return;
        setBusy(c._id);
        setNotice(null);
        try {
            const { data } = await api.setCouponActive(c._id, enable);
            setNotice({ type: "success", text: data.message || "Đã cập nhật." });
            setReload((n) => n + 1);
        } catch (err) {
            setNotice({ type: "danger", text: apiMessage(err, "Không cập nhật được mã giảm giá.") });
        } finally {
            setBusy(null);
        }
    };

    return (
        <PageShell
            title="Mã giảm giá"
            crumbs={[{ label: "Mã giảm giá" }]}
            actions={
                <Link to="/coupon-add" className="btn btn-success">
                    <i className="glyphicon glyphicon-plus" /> Tạo mã
                </Link>
            }
        >
            <Notice notice={notice} onClose={() => setNotice(null)} />
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
                            <label htmlFor="cp-q">Tìm theo mã</label>
                            <div className="input-group">
                                <input id="cp-q" className="form-control" maxLength={30} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                                <span className="input-group-btn">
                                    <button className="btn btn-primary" type="submit">
                                        Tìm
                                    </button>
                                </span>
                            </div>
                        </div>
                        <div className="col-md-3 form-group">
                            <label htmlFor="cp-state">Trạng thái</label>
                            <select id="cp-state" className="form-control" value={state} onChange={(e) => update({ state: e.target.value })}>
                                <option value="">Tất cả</option>
                                {Object.entries(COUPON_STATE).map(([k, v]) => (
                                    <option key={k} value={k}>
                                        {v.label}
                                    </option>
                                ))}
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
                                {result.status === "loading" ? "Đang tải..." : `Có ${result.total} mã`}
                            </p>
                            <div className="table-responsive">
                                <table className="table table-striped table-bordered table-hover">
                                    <thead>
                                        <tr>
                                            <th>Mã</th>
                                            <th>Ưu đãi</th>
                                            <th>Hiệu lực</th>
                                            <th>Đã dùng</th>
                                            <th>Trạng thái</th>
                                            <th style={{ width: 190 }}>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.status === "ready" && result.docs.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ textAlign: "center", padding: 20 }}>
                                                    Chưa có mã giảm giá nào phù hợp.
                                                </td>
                                            </tr>
                                        ) : null}
                                        {result.docs.map((c) => (
                                            <tr key={c._id}>
                                                <td>
                                                    <code>{c.code}</code>
                                                    {c.description ? <div style={{ fontSize: 12, color: "#666" }}>{c.description}</div> : null}
                                                </td>
                                                <td>{describeCoupon(c)}</td>
                                                <td style={{ fontSize: 12 }}>
                                                    {c.starts_at ? `Từ ${formatDate(c.starts_at)}` : "Từ khi tạo"}
                                                    <br />
                                                    {c.ends_at ? `Đến ${formatDate(c.ends_at)}` : "Không hết hạn"}
                                                </td>
                                                <td>
                                                    {c.used_count}
                                                    {c.usage_limit ? ` / ${c.usage_limit}` : " / không giới hạn"}
                                                </td>
                                                <td>
                                                    <span className={COUPON_STATE[c.state].className}>{COUPON_STATE[c.state].label}</span>
                                                </td>
                                                <td>
                                                    <Link to={`/coupon-edit/${c._id}`} className="btn btn-primary btn-sm" aria-label={`Sửa mã ${c.code}`}>
                                                        Sửa
                                                    </Link>{" "}
                                                    <button type="button" className={`btn btn-sm ${c.is_active ? "btn-danger" : "btn-success"}`} disabled={Boolean(busy)} onClick={() => toggle(c)} aria-label={`${c.is_active ? "Vô hiệu hóa" : "Bật lại"} mã ${c.code}`}>
                                                        {c.is_active ? "Vô hiệu hóa" : "Bật lại"}
                                                    </button>
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

export default Coupon;
