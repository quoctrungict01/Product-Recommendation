// Danh sách sản phẩm có bộ lọc, sắp xếp và phân trang — dùng cho trang Tìm kiếm và trang Danh mục.
//  - Toàn bộ trạng thái nằm trên URL (?q=&category=&min=&max=&stock=1&sort=&page=) -> chia sẻ link, nút Back hoạt động.
//  - Một request GET /products cho mỗi trạng thái; backend lọc, sắp xếp và cắt trang (12 sản phẩm/trang).
//  - Đổi từ khóa/bộ lọc/sắp xếp -> về trang 1; chuyển trang -> giữ nguyên bộ lọc (component Pagination giữ query).
//  - Phản hồi cũ đến muộn (người dùng đã đổi bộ lọc) bị bỏ qua.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { getProducts as getProductsApi, getCategories as getCategoriesApi } from "../../services/Api";
import ProductItem from "./Product-item";
import Pagination from "./Pagination";
import { toMoney } from "../ultils/pricing";
import "./catalog.css";

export const PAGE_SIZE = 12;
export const SORT_OPTIONS = [
    { value: "newest", label: "Mới nhất" },
    { value: "price_asc", label: "Giá tăng dần" },
    { value: "price_desc", label: "Giá giảm dần" },
    { value: "name_asc", label: "Tên A → Z" },
    { value: "name_desc", label: "Tên Z → A" },
];
const SORTS = SORT_OPTIONS.map((o) => o.value);
const defaultApi = { getProducts: getProductsApi, getCategories: getCategoriesApi };

/** Đọc trạng thái từ URL (giá trị sai bị bỏ qua thay vì gửi lên backend). */
export const readBrowseParams = (searchParams, fixedCategoryId) => {
    const page = Number.parseInt(searchParams.get("page"), 10);
    const sort = searchParams.get("sort");
    const min = toMoney(searchParams.get("min") || "");
    const max = toMoney(searchParams.get("max") || "");
    const category = searchParams.get("category") || "";
    return {
        q: (searchParams.get("q") ?? searchParams.get("keyword") ?? "").trim().slice(0, 100),
        // Danh mục cố định (trang /Category-:id) luôn được gửi đi, kể cả khi sai -> backend báo lỗi thay vì hiện mọi sản phẩm.
        category: fixedCategoryId || (/^[0-9a-fA-F]{24}$/.test(category) ? category : ""),
        min: min === null ? "" : String(min),
        max: max === null ? "" : String(max),
        stock: searchParams.get("stock") === "1",
        sort: SORTS.includes(sort) ? sort : "newest",
        page: page >= 1 && page <= 1000 ? page : 1,
    };
};

/** Trạng thái -> tham số API. */
export const toApiParams = (s) => {
    const params = { page: s.page, limit: PAGE_SIZE, sort: s.sort };
    if (s.q) params.q = s.q;
    if (s.category) params.category_id = s.category;
    if (s.min !== "") params.min_price = s.min;
    if (s.max !== "") params.max_price = s.max;
    if (s.stock) params.in_stock = "true";
    return params;
};

const PriceFilter = ({ min, max, onApply }) => {
    const [draft, setDraft] = React.useState({ min, max });
    const [error, setError] = React.useState("");
    React.useEffect(() => setDraft({ min, max }), [min, max]);
    const submit = (e) => {
        e.preventDefault();
        const lo = draft.min.trim() === "" ? "" : toMoney(draft.min);
        const hi = draft.max.trim() === "" ? "" : toMoney(draft.max);
        if (lo === null || hi === null) return setError("Giá phải là số nguyên không âm.");
        if (lo !== "" && hi !== "" && lo > hi) return setError("Giá từ phải nhỏ hơn hoặc bằng giá đến.");
        setError("");
        onApply({ min: lo === "" ? "" : String(lo), max: hi === "" ? "" : String(hi) });
    };
    return (
        <form onSubmit={submit} noValidate className="row" aria-label="Lọc theo giá">
            <div className="col-6 col-md-4">
                <label htmlFor="filter-min">Giá từ (đ)</label>
                <input id="filter-min" className="form-control form-control-sm" inputMode="numeric" placeholder="0" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} />
            </div>
            <div className="col-6 col-md-4">
                <label htmlFor="filter-max">Giá đến (đ)</label>
                <input id="filter-max" className="form-control form-control-sm" inputMode="numeric" placeholder="Không giới hạn" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} />
            </div>
            <div className="col-12 col-md-4" style={{ display: "flex", alignItems: "flex-end" }}>
                <button type="submit" className="btn btn-sm btn-danger btn-block">
                    Áp dụng giá
                </button>
            </div>
            {error ? (
                <div className="col-12 catalog-filter-error" role="alert">
                    {error}
                </div>
            ) : null}
        </form>
    );
};

const ProductBrowser = ({ fixedCategoryId, renderTitle, api = defaultApi }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const state = readBrowseParams(searchParams, fixedCategoryId);
    const apiParams = toApiParams(state);
    const key = JSON.stringify(apiParams);
    const [result, setResult] = React.useState({ status: "loading", docs: [], pages: null, total: 0, message: "" });
    const [categories, setCategories] = React.useState([]);
    const [reload, setReload] = React.useState(0);
    const latest = React.useRef(0);

    React.useEffect(() => {
        if (fixedCategoryId) return undefined;
        let alive = true;
        api.getCategories({ params: { limit: 50 } })
            .then(({ data }) => alive && setCategories(data.data.docs || []))
            .catch(() => alive && setCategories([]));
        return () => {
            alive = false;
        };
    }, [fixedCategoryId, api]);

    React.useEffect(() => {
        const reqId = ++latest.current;
        setResult((r) => ({ ...r, status: "loading", message: "" }));
        api.getProducts({ params: JSON.parse(key) })
            .then(({ data }) => {
                if (reqId !== latest.current) return;
                setResult({ status: "ready", docs: data.data.docs || [], total: data.data.total ?? (data.pages && data.pages.totalRows) ?? 0, pages: data.pages || null, message: "" });
            })
            .catch((err) => {
                if (reqId !== latest.current) return;
                const message = (err && err.response && err.response.data && err.response.data.message) || "Không tải được danh sách sản phẩm. Vui lòng thử lại.";
                setResult({ status: "error", docs: [], total: 0, pages: null, message });
            });
    }, [key, api, reload]);

    /** Đổi bộ lọc -> cập nhật URL, luôn quay về trang 1. */
    const update = (patch) => {
        const next = new URLSearchParams(searchParams);
        next.delete("page");
        next.delete("keyword");
        const set = (name, value) => (value === "" || value === false || value === undefined ? next.delete(name) : next.set(name, value === true ? "1" : value));
        if ("q" in patch) set("q", patch.q);
        if ("category" in patch) set("category", patch.category);
        if ("min" in patch) set("min", patch.min);
        if ("max" in patch) set("max", patch.max);
        if ("stock" in patch) set("stock", patch.stock);
        if ("sort" in patch) set("sort", patch.sort === "newest" ? "" : patch.sort);
        setSearchParams(next);
    };
    const hasFilters = Boolean(state.q || (!fixedCategoryId && state.category) || state.min || state.max || state.stock);
    const clearFilters = () => update({ q: "", category: "", min: "", max: "", stock: false });

    return (
        <div className="products">
            {renderTitle ? renderTitle({ total: result.total, status: result.status, q: state.q }) : null}
            <div className="catalog-filters">
                <div className="row">
                    {!fixedCategoryId ? (
                        <div className="col-12 col-md-4">
                            <label htmlFor="filter-category">Danh mục</label>
                            <select id="filter-category" className="form-control form-control-sm" value={state.category} onChange={(e) => update({ category: e.target.value })}>
                                <option value="">Tất cả danh mục</option>
                                {categories.map((c) => (
                                    <option key={c._id} value={c._id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}
                    <div className="col-7 col-md-4">
                        <label htmlFor="filter-sort">Sắp xếp</label>
                        <select id="filter-sort" className="form-control form-control-sm" value={state.sort} onChange={(e) => update({ sort: e.target.value })}>
                            {SORT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="col-5 col-md-4" style={{ display: "flex", alignItems: "flex-end" }}>
                        <div className="form-check" style={{ paddingBottom: 6 }}>
                            <input id="filter-stock" type="checkbox" className="form-check-input" checked={state.stock} onChange={(e) => update({ stock: e.target.checked })} />
                            <label htmlFor="filter-stock" className="form-check-label">
                                Chỉ hàng còn
                            </label>
                        </div>
                    </div>
                </div>
                <PriceFilter min={state.min} max={state.max} onApply={(range) => update(range)} />
            </div>

            {result.status === "loading" ? (
                <div className="catalog-state" role="status">
                    Đang tải sản phẩm...
                </div>
            ) : result.status === "error" ? (
                <div className="catalog-state" role="alert">
                    <p className="text-danger">{result.message}</p>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setReload((n) => n + 1)}>
                        Thử lại
                    </button>
                </div>
            ) : result.docs.length === 0 ? (
                <div className="catalog-state">
                    <p>{result.total > 0 ? "Trang này không có sản phẩm." : state.q ? `Không tìm thấy sản phẩm nào phù hợp với “${state.q}”.` : "Không có sản phẩm nào phù hợp với bộ lọc."}</p>
                    {result.total > 0 ? (
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => update({})}>
                            Về trang đầu
                        </button>
                    ) : hasFilters ? (
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={clearFilters}>
                            Xóa bộ lọc
                        </button>
                    ) : null}
                </div>
            ) : (
                <>
                    <p className="catalog-summary">
                        Tìm thấy {result.total} sản phẩm
                        {result.pages && result.pages.totalPages > 1 ? ` · Trang ${result.pages.currentPage}/${result.pages.totalPages}` : ""}
                    </p>
                    <div className="catalog-grid">
                        {result.docs.map((product) => (
                            <ProductItem key={product._id} item={product} />
                        ))}
                    </div>
                    {result.pages ? (
                        <div id="pagination">
                            <Pagination pages={result.pages} />
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
};

export default ProductBrowser;
