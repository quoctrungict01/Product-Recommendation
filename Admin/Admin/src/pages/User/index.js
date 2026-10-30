// Quản lý thành viên: danh sách thật từ GET /users (tìm kiếm, lọc vai trò, phân trang), sửa, xóa có xác nhận.
// Quy tắc do backend thực thi (giao diện chỉ ẩn nút cho rõ ràng):
//  - không tạo/nâng quyền admin, không tự xóa/tự hạ quyền, không xóa tài khoản admin;
//  - không bao giờ trả mật khẩu/hash.
import React from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { getUsers, deleteUser } from "../../services/Api";
import { formatDate, apiMessage } from "../../shared/ultils/format";
import { loadAdminSession } from "../../shared/auth/session";
import Pager from "../../shared/components/Pager";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";

export const PAGE_SIZE = 20;
export const ROLE_LABEL = {
    admin: { label: "Quản trị viên", className: "label label-danger" },
    member: { label: "Thành viên", className: "label label-success" },
};
const defaultApi = { getUsers, deleteUser };
const currentAdminId = () => {
    const s = loadAdminSession();
    return s && s.user ? String(s.user._id) : null;
};

/** Lý do không xóa được (hiện thay cho nút Xóa), hoặc null. */
export const deleteBlockedReason = (user, meId) => {
    if (String(user._id) === meId) return "Không thể tự xóa tài khoản của chính mình.";
    if (user.role === "admin") return "Không xóa được tài khoản quản trị viên.";
    return null;
};

const User = ({ api = defaultApi, confirmFn = (m) => window.confirm(m), meId = currentAdminId() }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
    const role = ROLE_LABEL[searchParams.get("role")] ? searchParams.get("role") : "";
    const q = searchParams.get("q") || "";
    const [keyword, setKeyword] = React.useState(q);
    const [result, setResult] = React.useState({ status: "loading", docs: [], total: 0, totalPages: 0, message: "" });
    const [notice, setNotice] = React.useState((location.state && location.state.notice) || null);
    const [reload, setReload] = React.useState(0);
    const [busy, setBusy] = React.useState(null);

    React.useEffect(() => setKeyword(q), [q]);

    React.useEffect(() => {
        let alive = true;
        const params = { page, limit: PAGE_SIZE };
        if (q) params.q = q;
        if (role) params.role = role;
        setResult((r) => ({ ...r, status: "loading" }));
        api.getUsers({ params })
            .then(({ data }) => {
                if (!alive) return;
                const d = data.data || {};
                const pages = data.pages || {};
                setResult({ status: "ready", docs: d.docs || [], total: d.total ?? pages.totalRows ?? 0, totalPages: d.totalPages ?? pages.totalPages ?? 0, message: "" });
            })
            .catch((err) => alive && setResult({ status: "error", docs: [], total: 0, totalPages: 0, message: apiMessage(err, "Không tải được danh sách thành viên.") }));
        return () => {
            alive = false;
        };
    }, [api, page, q, role, reload]);

    const update = (patch, keepPage = false) => {
        const next = new URLSearchParams(searchParams);
        for (const [k, v] of Object.entries(patch)) {
            if (!v || (k === "page" && v === 1)) next.delete(k);
            else next.set(k, String(v));
        }
        if (!keepPage) next.delete("page");
        setSearchParams(next);
    };

    const remove = async (u) => {
        if (busy) return;
        const who = u.full_name ? `${u.full_name} (${u.email})` : u.email;
        if (!confirmFn(`Xóa tài khoản ${who}?\nNgười này sẽ không đăng nhập được nữa. Đơn hàng đã đặt vẫn được giữ. Thao tác này không hoàn tác được.`)) return;
        setBusy(u._id);
        setNotice(null);
        try {
            await api.deleteUser(u._id);
            setNotice({ type: "success", text: `Đã xóa tài khoản ${u.email}.` });
            if (result.docs.length === 1 && page > 1) update({ page: page - 1 }, true);
            else setReload((n) => n + 1);
        } catch (err) {
            setNotice({ type: "danger", text: apiMessage(err, "Không xóa được tài khoản. Vui lòng thử lại.") });
        } finally {
            setBusy(null);
        }
    };

    return (
        <PageShell
            title="Quản lý thành viên"
            crumbs={[{ label: "Quản lý thành viên" }]}
            actions={
                <Link to="/user-add" className="btn btn-success">
                    <i className="glyphicon glyphicon-plus" /> Thêm thành viên
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
                            <label htmlFor="us-q">Tìm theo họ tên, email hoặc số điện thoại</label>
                            <div className="input-group">
                                <input id="us-q" className="form-control" maxLength={100} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                                <span className="input-group-btn">
                                    <button className="btn btn-primary" type="submit">
                                        Tìm
                                    </button>
                                </span>
                            </div>
                        </div>
                        <div className="col-md-3 form-group">
                            <label htmlFor="us-role">Vai trò</label>
                            <select id="us-role" className="form-control" value={role} onChange={(e) => update({ role: e.target.value })}>
                                <option value="">Tất cả</option>
                                {Object.entries(ROLE_LABEL).map(([k, v]) => (
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
                                {result.status === "loading" ? "Đang tải..." : `Có ${result.total} tài khoản`}
                            </p>
                            <div className="table-responsive">
                                <table className="table table-striped table-bordered table-hover">
                                    <thead>
                                        <tr>
                                            <th>Họ tên</th>
                                            <th>Email</th>
                                            <th>Số điện thoại</th>
                                            <th>Vai trò</th>
                                            <th>Ngày tạo</th>
                                            <th style={{ width: 170 }}>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.status === "ready" && result.docs.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ textAlign: "center", padding: 20 }}>
                                                    {q || role ? "Không có tài khoản nào phù hợp." : "Chưa có tài khoản nào."}
                                                </td>
                                            </tr>
                                        ) : null}
                                        {result.docs.map((u) => {
                                            const blocked = deleteBlockedReason(u, meId);
                                            const r = ROLE_LABEL[u.role] || ROLE_LABEL.member;
                                            return (
                                                <tr key={u._id}>
                                                    <td>
                                                        {u.full_name || <span style={{ color: "#999" }}>(chưa có tên)</span>}
                                                        {String(u._id) === meId ? <small style={{ color: "#666" }}> (bạn)</small> : null}
                                                    </td>
                                                    <td>{u.email}</td>
                                                    <td>{u.phone || "—"}</td>
                                                    <td>
                                                        <span className={r.className}>{r.label}</span>
                                                    </td>
                                                    <td style={{ fontSize: 12 }}>{formatDate(u.createdAt)}</td>
                                                    <td>
                                                        <Link to={`/user-edit/${u._id}`} className="btn btn-primary btn-sm" aria-label={`Xem và sửa ${u.email}`}>
                                                            Xem / Sửa
                                                        </Link>{" "}
                                                        {blocked ? (
                                                            <button type="button" className="btn btn-default btn-sm" disabled title={blocked} aria-label={blocked}>
                                                                Xóa
                                                            </button>
                                                        ) : (
                                                            <button type="button" className="btn btn-danger btn-sm" disabled={Boolean(busy)} onClick={() => remove(u)} aria-label={`Xóa tài khoản ${u.email}`}>
                                                                {busy === u._id ? "Đang xóa..." : "Xóa"}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
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

export default User;
