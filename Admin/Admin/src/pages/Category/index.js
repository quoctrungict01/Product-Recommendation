// Quản lý danh mục: thêm, sửa tên ngay trên dòng, xóa có xác nhận, phân trang.
// Backend từ chối xóa danh mục còn sản phẩm (tránh sản phẩm mồ côi) — thông báo hiển thị nguyên văn.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { getCategories, addCategory, updateCategory, deleteCategory } from "../../services/Api";
import { apiMessage } from "../../shared/ultils/format";
import Pager from "../../shared/components/Pager";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";

export const PAGE_SIZE = 10;
const defaultApi = { getCategories, addCategory, updateCategory, deleteCategory };

export const categoryNameError = (name) => {
    const n = String(name || "").trim();
    if (!n) return "Tên danh mục không được để trống.";
    if (n.length > 100) return "Tên danh mục tối đa 100 ký tự.";
    return "";
};

const Category = ({ api = defaultApi, confirmFn = (m) => window.confirm(m) }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
    const [result, setResult] = React.useState({ status: "loading", docs: [], total: 0, totalPages: 0, message: "" });
    const [reload, setReload] = React.useState(0);
    const [notice, setNotice] = React.useState(null);
    const [newName, setNewName] = React.useState("");
    const [newError, setNewError] = React.useState("");
    const [editing, setEditing] = React.useState(null); // { id, name, error }
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        setResult((r) => ({ ...r, status: "loading" }));
        api.getCategories({ params: { page, limit: PAGE_SIZE, with_counts: 1 } })
            .then(({ data }) => alive && setResult({ status: "ready", docs: data.data.docs || [], total: data.data.total || 0, totalPages: data.data.totalPages || 0, message: "" }))
            .catch((err) => alive && setResult({ status: "error", docs: [], total: 0, totalPages: 0, message: apiMessage(err, "Không tải được danh mục.") }));
        return () => {
            alive = false;
        };
    }, [api, page, reload]);

    const goPage = (p) => setSearchParams(p > 1 ? { page: String(p) } : {});

    const onAdd = async (e) => {
        e.preventDefault();
        const err = categoryNameError(newName);
        setNewError(err);
        setNotice(null);
        if (err || busy) return;
        setBusy(true);
        try {
            await api.addCategory({ name: newName.trim() });
            setNotice({ type: "success", text: `Đã thêm danh mục "${newName.trim()}".` });
            setNewName("");
            if (page !== 1) goPage(1);
            else setReload((n) => n + 1);
        } catch (er) {
            setNewError(apiMessage(er, "Không thêm được danh mục."));
        } finally {
            setBusy(false);
        }
    };

    const onSave = async () => {
        const err = categoryNameError(editing.name);
        if (err) return setEditing({ ...editing, error: err });
        if (busy) return;
        setBusy(true);
        setNotice(null);
        try {
            await api.updateCategory(editing.id, { name: editing.name.trim() });
            setNotice({ type: "success", text: `Đã đổi tên danh mục thành "${editing.name.trim()}".` });
            setEditing(null);
            setReload((n) => n + 1);
        } catch (er) {
            setEditing({ ...editing, error: apiMessage(er, "Không lưu được danh mục.") });
        } finally {
            setBusy(false);
        }
    };

    const onDelete = async (c) => {
        if (busy) return;
        const warn = c.product_count > 0 ? `\nDanh mục đang có ${c.product_count} sản phẩm nên sẽ không xóa được.` : "";
        if (!confirmFn(`Xóa danh mục "${c.name}"?${warn}`)) return;
        setBusy(true);
        setNotice(null);
        try {
            await api.deleteCategory(c._id);
            setNotice({ type: "success", text: `Đã xóa danh mục "${c.name}".` });
            if (result.docs.length === 1 && page > 1) goPage(page - 1);
            else setReload((n) => n + 1);
        } catch (er) {
            setNotice({ type: "danger", text: apiMessage(er, "Không xóa được danh mục.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <PageShell title="Quản lý danh mục" crumbs={[{ label: "Quản lý danh mục" }]}>
            <Notice notice={notice} onClose={() => setNotice(null)} />
            <div className="panel panel-default">
                <div className="panel-body">
                    <form className="form-inline" onSubmit={onAdd} noValidate style={{ marginBottom: 15 }}>
                        <div className={`form-group${newError ? " has-error" : ""}`}>
                            <label htmlFor="cat-new" style={{ marginRight: 8 }}>
                                Thêm danh mục
                            </label>
                            <input id="cat-new" className="form-control" maxLength={100} placeholder="Tên danh mục..." value={newName} onChange={(e) => { setNewName(e.target.value); setNewError(""); }} aria-invalid={Boolean(newError)} />
                        </div>{" "}
                        <button type="submit" className="btn btn-success" disabled={busy}>
                            <i className="glyphicon glyphicon-plus" /> Thêm
                        </button>
                        {newError ? (
                            <div className="text-danger" role="alert" style={{ marginTop: 6 }}>
                                {newError}
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
                                {result.status === "loading" ? "Đang tải..." : `Có ${result.total} danh mục`}
                            </p>
                            <div className="table-responsive">
                                <table className="table table-striped table-bordered table-hover">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 60 }}>#</th>
                                            <th>Tên danh mục</th>
                                            <th style={{ width: 120 }}>Số sản phẩm</th>
                                            <th style={{ width: 200 }}>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.status === "ready" && result.docs.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: "center" }}>
                                                    Chưa có danh mục nào.
                                                </td>
                                            </tr>
                                        ) : null}
                                        {result.docs.map((c, i) => {
                                            const isEditing = editing && editing.id === c._id;
                                            return (
                                                <tr key={c._id}>
                                                    <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                                                    <td>
                                                        {isEditing ? (
                                                            <div className={editing.error ? "has-error" : ""}>
                                                                <input
                                                                    className="form-control"
                                                                    aria-label={`Tên mới cho ${c.name}`}
                                                                    maxLength={100}
                                                                    value={editing.name}
                                                                    autoFocus
                                                                    onChange={(e) => setEditing({ ...editing, name: e.target.value, error: "" })}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") onSave();
                                                                        if (e.key === "Escape") setEditing(null);
                                                                    }}
                                                                />
                                                                {editing.error ? (
                                                                    <span className="help-block" role="alert">
                                                                        {editing.error}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        ) : (
                                                            c.name
                                                        )}
                                                    </td>
                                                    <td>{typeof c.product_count === "number" ? c.product_count : "—"}</td>
                                                    <td>
                                                        {isEditing ? (
                                                            <>
                                                                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onSave}>
                                                                    Lưu
                                                                </button>{" "}
                                                                <button type="button" className="btn btn-default btn-sm" disabled={busy} onClick={() => setEditing(null)}>
                                                                    Hủy
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => setEditing({ id: c._id, name: c.name, error: "" })} aria-label={`Sửa ${c.name}`}>
                                                                    <i className="glyphicon glyphicon-pencil" /> Sửa
                                                                </button>{" "}
                                                                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => onDelete(c)} aria-label={`Xóa ${c.name}`}>
                                                                    <i className="glyphicon glyphicon-remove" /> Xóa
                                                                </button>
                                                            </>
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
                    <Pager page={page} totalPages={result.totalPages} onChange={goPage} disabled={result.status === "loading"} />
                </div>
            </div>
        </PageShell>
    );
};

export default Category;
