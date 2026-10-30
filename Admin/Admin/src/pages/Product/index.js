// Quản lý sản phẩm: tìm kiếm, lọc danh mục/tồn kho/nổi bật, sắp xếp, phân trang (backend cắt trang), xóa có xác nhận.
// Trạng thái bộ lọc nằm trên URL (?q=&category=&stock=&featured=&sort=&page=) nên F5/Back giữ nguyên.
import React from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { getProducts, getCategories, deleteProduct } from "../../services/Api";
import { getImageProduct } from "../../shared/ultils";
import { formatMoney, apiMessage } from "../../shared/ultils/format";
import Pager from "../../shared/components/Pager";
import Notice from "../../shared/components/Notice";
import PageShell from "../../shared/components/PageShell";

export const PAGE_SIZE = 10;
const SORTS = [
    { value: "newest", label: "Mới nhất" },
    { value: "name_asc", label: "Tên A → Z" },
    { value: "name_desc", label: "Tên Z → A" },
    { value: "price_asc", label: "Giá bán tăng dần" },
    { value: "price_desc", label: "Giá bán giảm dần" },
];
const defaultApi = { getProducts, getCategories, deleteProduct };

const readState = (sp) => {
    const page = Number.parseInt(sp.get("page"), 10);
    return {
        q: sp.get("q") || "",
        category: sp.get("category") || "",
        stock: ["in", "out"].includes(sp.get("stock")) ? sp.get("stock") : "",
        featured: ["1", "0"].includes(sp.get("featured")) ? sp.get("featured") : "",
        sort: SORTS.some((s) => s.value === sp.get("sort")) ? sp.get("sort") : "newest",
        page: page >= 1 ? page : 1,
    };
};

const PriceCell = ({ p }) => {
    const sale = typeof p.final_price === "number" ? p.final_price : null;
    if (sale === null) return <span className="text-danger">Giá không hợp lệ</span>;
    return (
        <div>
            <b style={{ color: "#c9302c" }}>{formatMoney(sale)}</b>
            {p.has_discount ? (
                <div style={{ fontSize: 12 }}>
                    <del style={{ color: "#888" }}>{formatMoney(p.original_price)}</del> <span className="label label-danger">-{p.discount_percent}%</span>
                </div>
            ) : (
                <div style={{ fontSize: 12, color: "#888" }}>Không giảm giá</div>
            )}
            {p.promotion_text ? <div style={{ fontSize: 12 }}>🎁 {p.promotion_text}</div> : null}
        </div>
    );
};

const Product = ({ api = defaultApi, confirmFn = (m) => window.confirm(m) }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const state = readState(searchParams);
    const [keyword, setKeyword] = React.useState(state.q);
    const [categories, setCategories] = React.useState([]);
    const [result, setResult] = React.useState({ status: "loading", docs: [], total: 0, totalPages: 0, message: "" });
    const [notice, setNotice] = React.useState((location.state && location.state.notice) || null);
    const [reload, setReload] = React.useState(0);
    const [deleting, setDeleting] = React.useState(null);
    const latest = React.useRef(0);

    const params = { page: state.page, limit: PAGE_SIZE, sort: state.sort };
    if (state.q) params.q = state.q;
    if (state.category) params.category_id = state.category;
    if (state.stock) params.stock = state.stock;
    if (state.featured) params.is_featured = state.featured === "1" ? "true" : "false";
    const key = JSON.stringify(params);

    React.useEffect(() => setKeyword(state.q), [state.q]);

    React.useEffect(() => {
        let alive = true;
        api.getCategories({ params: { limit: 100 } })
            .then(({ data }) => alive && setCategories(data.data.docs || []))
            .catch(() => alive && setCategories([]));
        return () => {
            alive = false;
        };
    }, [api]);

    React.useEffect(() => {
        const id = ++latest.current;
        setResult((r) => ({ ...r, status: "loading" }));
        api.getProducts({ params: JSON.parse(key) })
            .then(({ data }) => {
                if (id !== latest.current) return;
                const d = data.data;
                setResult({ status: "ready", docs: d.docs || [], total: d.total || 0, totalPages: d.totalPages || 0, message: "" });
            })
            .catch((err) => {
                if (id !== latest.current) return;
                setResult({ status: "error", docs: [], total: 0, totalPages: 0, message: apiMessage(err, "Không tải được danh sách sản phẩm.") });
            });
    }, [key, api, reload]);

    /** Đổi bộ lọc -> về trang 1; chuyển trang -> giữ bộ lọc. */
    const update = (patch, keepPage = false) => {
        const next = new URLSearchParams(searchParams);
        for (const [k, v] of Object.entries(patch)) {
            if (v === "" || v === null || v === undefined || (k === "sort" && v === "newest") || (k === "page" && v === 1)) next.delete(k);
            else next.set(k, String(v));
        }
        if (!keepPage) next.delete("page");
        setSearchParams(next);
    };

    const catName = (id) => (categories.find((c) => c._id === id) || {}).name || "—";

    const onDelete = async (p) => {
        if (deleting) return;
        if (!confirmFn(`Xóa sản phẩm "${p.name}"?\nThao tác này không thể hoàn tác.`)) return;
        setDeleting(p._id);
        setNotice(null);
        try {
            await api.deleteProduct(p._id);
            setNotice({ type: "success", text: `Đã xóa sản phẩm "${p.name}".` });
            // Xóa phần tử cuối của trang cuối -> lùi một trang.
            if (result.docs.length === 1 && state.page > 1) update({ page: state.page - 1 }, true);
            else setReload((n) => n + 1);
        } catch (err) {
            setNotice({ type: "danger", text: apiMessage(err, "Không xóa được sản phẩm.") });
        } finally {
            setDeleting(null);
        }
    };

    return (
        <PageShell
            title="Danh sách sản phẩm"
            crumbs={[{ label: "Quản lý sản phẩm" }]}
            actions={
                <Link to="/product-add" className="btn btn-success">
                    <i className="glyphicon glyphicon-plus" /> Thêm sản phẩm
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
                        <div className="col-md-4 form-group">
                            <label htmlFor="prd-q">Tìm theo tên</label>
                            <div className="input-group">
                                <input id="prd-q" className="form-control" maxLength={100} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tên sản phẩm (có dấu hoặc không dấu)" />
                                <span className="input-group-btn">
                                    <button className="btn btn-primary" type="submit">
                                        Tìm
                                    </button>
                                </span>
                            </div>
                        </div>
                        <div className="col-md-2 form-group">
                            <label htmlFor="prd-category">Danh mục</label>
                            <select id="prd-category" className="form-control" value={state.category} onChange={(e) => update({ category: e.target.value })}>
                                <option value="">Tất cả</option>
                                {categories.map((c) => (
                                    <option key={c._id} value={c._id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-2 form-group">
                            <label htmlFor="prd-stock">Tồn kho</label>
                            <select id="prd-stock" className="form-control" value={state.stock} onChange={(e) => update({ stock: e.target.value })}>
                                <option value="">Tất cả</option>
                                <option value="in">Còn hàng</option>
                                <option value="out">Hết hàng</option>
                            </select>
                        </div>
                        <div className="col-md-2 form-group">
                            <label htmlFor="prd-featured">Nổi bật</label>
                            <select id="prd-featured" className="form-control" value={state.featured} onChange={(e) => update({ featured: e.target.value })}>
                                <option value="">Tất cả</option>
                                <option value="1">Nổi bật</option>
                                <option value="0">Không nổi bật</option>
                            </select>
                        </div>
                        <div className="col-md-2 form-group">
                            <label htmlFor="prd-sort">Sắp xếp</label>
                            <select id="prd-sort" className="form-control" value={state.sort} onChange={(e) => update({ sort: e.target.value })}>
                                {SORTS.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
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
                                {result.status === "loading" ? "Đang tải..." : `Có ${result.total} sản phẩm${result.totalPages > 1 ? ` · Trang ${state.page}/${result.totalPages}` : ""}`}
                            </p>
                            <div className="table-responsive">
                                <table className="table table-striped table-bordered table-hover">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 50 }}>#</th>
                                            <th style={{ width: 90 }}>Ảnh</th>
                                            <th>Tên sản phẩm</th>
                                            <th>Danh mục</th>
                                            <th>Giá bán / giá gốc</th>
                                            <th>Trạng thái</th>
                                            <th style={{ width: 130 }}>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.status === "ready" && result.docs.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ textAlign: "center", padding: 20 }}>
                                                    Không có sản phẩm nào phù hợp.
                                                </td>
                                            </tr>
                                        ) : null}
                                        {result.docs.map((p, i) => (
                                            <tr key={p._id}>
                                                <td>{(state.page - 1) * PAGE_SIZE + i + 1}</td>
                                                <td>
                                                    <img src={getImageProduct(p.image)} alt={p.name} style={{ width: 70, height: 70, objectFit: "contain" }} />
                                                </td>
                                                <td>
                                                    <b>{p.name}</b>
                                                </td>
                                                <td>{catName(p.category_id)}</td>
                                                <td>
                                                    <PriceCell p={p} />
                                                </td>
                                                <td>
                                                    {p.is_stock === false ? <span className="label label-default">Hết hàng</span> : <span className="label label-success">Còn hàng</span>}{" "}
                                                    {p.is_featured ? <span className="label label-warning">Nổi bật</span> : null}
                                                </td>
                                                <td>
                                                    <Link to={`/product-edit/${p._id}`} className="btn btn-primary btn-sm" title="Sửa" aria-label={`Sửa ${p.name}`}>
                                                        <i className="glyphicon glyphicon-pencil" /> Sửa
                                                    </Link>{" "}
                                                    <button type="button" className="btn btn-danger btn-sm" disabled={Boolean(deleting)} onClick={() => onDelete(p)} aria-label={`Xóa ${p.name}`}>
                                                        <i className="glyphicon glyphicon-remove" /> {deleting === p._id ? "..." : "Xóa"}
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
                    <Pager page={state.page} totalPages={result.totalPages} onChange={(p) => update({ page: p }, true)} disabled={result.status === "loading"} />
                </div>
            </div>
        </PageShell>
    );
};

export default Product;
