// Quản lý bình luận: dữ liệu thật từ GET /comments/admin (tìm kiếm, phân trang), xóa có xác nhận.
// Backend không trả email người bình luận. Bình luận của sản phẩm đã bị xóa vẫn hiện, ghi rõ "Sản phẩm không còn".
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminComments, deleteAdminComment } from "../../services/Api";
import { formatDate, apiMessage } from "../../shared/ultils/format";
import Pager from "../../shared/components/Pager";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";

export const PAGE_SIZE = 20;
const defaultApi = { getAdminComments, deleteAdminComment };

/** Rút gọn nội dung dài để đưa vào hộp xác nhận. */
const excerpt = (text, n = 80) => (text.length > n ? `${text.slice(0, n)}…` : text);

const Comment = ({ api = defaultApi, confirmFn = (m) => window.confirm(m) }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
    const q = searchParams.get("q") || "";
    const [keyword, setKeyword] = React.useState(q);
    const [result, setResult] = React.useState({ status: "loading", docs: [], total: 0, totalPages: 0, message: "" });
    const [notice, setNotice] = React.useState(null);
    const [reload, setReload] = React.useState(0);
    const [busy, setBusy] = React.useState(null);

    React.useEffect(() => setKeyword(q), [q]);

    React.useEffect(() => {
        let alive = true;
        const params = { page, limit: PAGE_SIZE };
        if (q) params.q = q;
        setResult((r) => ({ ...r, status: "loading" }));
        api.getAdminComments({ params })
            .then(({ data }) => {
                if (!alive) return;
                const d = data.data || {};
                setResult({ status: "ready", docs: d.docs || [], total: d.total || 0, totalPages: d.totalPages || 0, message: "" });
            })
            .catch((err) => alive && setResult({ status: "error", docs: [], total: 0, totalPages: 0, message: apiMessage(err, "Không tải được danh sách bình luận.") }));
        return () => {
            alive = false;
        };
    }, [api, page, q, reload]);

    const update = (patch, keepPage = false) => {
        const next = new URLSearchParams(searchParams);
        for (const [k, v] of Object.entries(patch)) {
            if (!v || (k === "page" && v === 1)) next.delete(k);
            else next.set(k, String(v));
        }
        if (!keepPage) next.delete("page");
        setSearchParams(next);
    };

    const remove = async (c) => {
        if (busy) return;
        if (!confirmFn(`Xóa bình luận của "${c.name}"?\n"${excerpt(c.content)}"\nThao tác này không hoàn tác được.`)) return;
        setBusy(c._id);
        setNotice(null);
        try {
            const { data } = await api.deleteAdminComment(c._id);
            setNotice({ type: "success", text: data.message || "Đã xóa bình luận." });
            // Xóa hết bình luận của trang cuối -> lùi một trang.
            if (result.docs.length === 1 && page > 1) update({ page: page - 1 }, true);
            else setReload((n) => n + 1);
        } catch (err) {
            if (err && err.response && err.response.status === 404) setReload((n) => n + 1); // đã bị xóa ở nơi khác
            setNotice({ type: "danger", text: apiMessage(err, "Không xóa được bình luận. Vui lòng thử lại.") });
        } finally {
            setBusy(null);
        }
    };

    return (
        <PageShell title="Quản lý bình luận" crumbs={[{ label: "Quản lý bình luận" }]}>
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
                            <label htmlFor="cm-q">Tìm theo người bình luận hoặc nội dung</label>
                            <div className="input-group">
                                <input id="cm-q" className="form-control" maxLength={100} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="vd. giao nhanh" />
                                <span className="input-group-btn">
                                    <button className="btn btn-primary" type="submit">
                                        Tìm
                                    </button>
                                </span>
                            </div>
                        </div>
                        {q ? (
                            <div className="col-md-3 form-group" style={{ paddingTop: 25 }}>
                                <button type="button" className="btn btn-default" onClick={() => update({ q: "" })}>
                                    Xóa bộ lọc
                                </button>
                            </div>
                        ) : null}
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
                                {result.status === "loading" ? "Đang tải..." : `Có ${result.total} bình luận`}
                            </p>
                            <div className="table-responsive">
                                <table className="table table-striped table-bordered table-hover">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 140 }}>Thời gian</th>
                                            <th style={{ width: 170 }}>Người bình luận</th>
                                            <th>Nội dung</th>
                                            <th style={{ width: 220 }}>Sản phẩm</th>
                                            <th style={{ width: 90 }}>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.status === "ready" && result.docs.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} style={{ textAlign: "center", padding: 20 }}>
                                                    {q ? "Không có bình luận nào phù hợp." : "Chưa có bình luận nào."}
                                                </td>
                                            </tr>
                                        ) : null}
                                        {result.docs.map((c) => (
                                            <tr key={c._id}>
                                                <td style={{ fontSize: 12 }}>{formatDate(c.createdAt)}</td>
                                                <td>{c.name}</td>
                                                <td style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.content}</td>
                                                <td>
                                                    {c.product ? (
                                                        <Link to={`/product-edit/${c.product._id}`}>{c.product.name}</Link>
                                                    ) : (
                                                        <span className="label label-default" title={c.product_id ? `Mã sản phẩm: ${c.product_id}` : undefined}>
                                                            Sản phẩm không còn
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button type="button" className="btn btn-danger btn-sm" disabled={Boolean(busy)} onClick={() => remove(c)} aria-label={`Xóa bình luận của ${c.name}`}>
                                                        {busy === c._id ? "Đang xóa..." : "Xóa"}
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

export default Comment;
