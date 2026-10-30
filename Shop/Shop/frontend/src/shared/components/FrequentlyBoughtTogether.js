// Gợi ý trên trang chi tiết sản phẩm.
//
// Khách hàng thấy hai khu vực, đều theo kiểu thẻ sản phẩm sẵn có của TrungShop:
//   - "Thường được mua cùng": CHỈ các sản phẩm suy ra từ luật kết hợp (source = association-rule).
//   - "Có thể bạn cũng quan tâm": các sản phẩm dự phòng (source = fallback).
// Khu vực nào không có sản phẩm thì không hiển thị. Không có thông tin kỹ thuật nào.
//
// Chế độ nghiên cứu (chỉ khi URL có ?research=1, hoặc REACT_APP_RECO_RESEARCH=true; giao diện
// khách không có nút/link nào dẫn tới): thêm nút đổi Apriori / FP-Growth và chỉ số luật để kiểm thử.

import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getRecommendations } from "../../services/Api";
import { getImageProduct } from "../ultils";
import PriceTag from "./PriceTag";
import "./FrequentlyBoughtTogether.css";

const ALGORITHMS = [
    { value: "apriori", label: "Apriori" },
    { value: "fpgrowth", label: "FP-Growth" },
];
const FALLBACK_LABELS = { "same-category": "cùng danh mục", "best-seller": "bán chạy" };
const pct = (x) => `${(x * 100).toFixed(1)}%`;

const ProductCard = ({ item, research }) => {
    const { product, rule, source } = item;
    const to = `/ProductDetails-${product._id}${research ? "?research=1" : ""}`;
    return (
        <div className="product-item card text-center fbt-card">
            <Link to={to}>
                <img src={getImageProduct(product.image)} alt={product.name} loading="lazy" />
            </Link>
            <h4>
                <Link to={to}>{product.name}</Link>
            </h4>
            {/* Giá bán sau ưu đãi do backend gắn vào (product.final_price); thiếu thì hiện price. */}
            <PriceTag product={product} />
            <Link to={to} className="btn btn-sm btn-outline-danger fbt-detail">
                Xem chi tiết
            </Link>

            {research && (
                <div className="fbt-metrics">
                    {source === "association-rule" ? (
                        <>
                            <b>Luật kết hợp</b>
                            <br />
                            conf {pct(rule.confidence)} · lift {rule.lift.toFixed(2)}
                            <br />
                            sup {pct(rule.support)} ({rule.supportCount} đơn)
                        </>
                    ) : (
                        <b>Fallback: {FALLBACK_LABELS[item.fallbackReason] || item.fallbackReason}</b>
                    )}
                </div>
            )}
        </div>
    );
};

const ProductSection = ({ title, items, research, dimmed }) => (
    <div className="row fbt-section">
        <div className="col-lg-12 col-md-12 col-sm-12">
            <h3>{title}</h3>
            <div className={`fbt-list${dimmed ? " is-loading" : ""}`}>
                {items.map((item) => (
                    <ProductCard key={item.product._id} item={item} research={research} />
                ))}
            </div>
        </div>
    </div>
);

const ResearchPanel = ({ algorithm, onChange, data, loading, error }) => {
    const meta = data && data.algorithm === algorithm ? data.meta : null;
    return (
        <div className="row fbt-section fbt-research">
            <div className="col-lg-12 col-md-12 col-sm-12">
                <b>Chế độ nghiên cứu</b>{" "}
                {ALGORITHMS.map((a) => (
                    <button
                        key={a.value}
                        type="button"
                        className={`btn btn-sm ${algorithm === a.value ? "btn-dark" : "btn-outline-dark"}`}
                        aria-pressed={algorithm === a.value}
                        disabled={loading}
                        onClick={() => onChange(a.value)}
                    >
                        {a.label}
                    </button>
                ))}
                {error && <div className="fbt-research-error">{error}</div>}
                {meta && (
                    <div className="fbt-research-meta">
                        Thời gian khai phá: {meta.miningMs} ms ({meta.cache === "hit" ? "cache" : "mới khai phá"}) · Giao dịch:{" "}
                        {meta.transactionCount} · min_sup {pct(data.params.minSupport)} ({meta.minSupportCount} đơn) · min_conf{" "}
                        {pct(data.params.minConfidence)} · Tập phổ biến: {meta.frequentItemsetCount} · Luật: {meta.ruleCount} · Luật
                        khớp: {meta.matchedRuleCount} · Từ luật: {meta.ruleItemCount} · Fallback: {meta.fallbackCount}
                    </div>
                )}
            </div>
        </div>
    );
};

const FrequentlyBoughtTogether = ({ productId }) => {
    const [searchParams] = useSearchParams();
    const research = searchParams.get("research") === "1" || process.env.REACT_APP_RECO_RESEARCH === "true";
    const [algorithm, setAlgorithm] = useState("fpgrowth");
    const [state, setState] = useState({ loading: true, error: null, data: null });
    const lastProductId = useRef(productId);

    useEffect(() => {
        if (!productId) return undefined;
        let cancelled = false; // bỏ kết quả cũ nếu đổi sản phẩm/thuật toán nhanh
        // Đổi sản phẩm: xóa gợi ý cũ ngay. Đổi thuật toán: giữ gợi ý cũ (làm mờ) tới khi có kết quả.
        const productChanged = lastProductId.current !== productId;
        lastProductId.current = productId;
        setState((s) => ({ loading: true, error: null, data: productChanged ? null : s.data }));

        getRecommendations(productId, { params: { algorithm } })
            .then(({ data }) => {
                if (!cancelled) setState({ loading: false, error: null, data: data.data });
            })
            .catch((err) => {
                if (!cancelled) {
                    setState({ loading: false, error: err?.response?.data?.message || "Không tải được gợi ý.", data: null });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [productId, algorithm]);

    const { loading, error, data } = state;
    const items = data?.items || [];
    const ruleItems = items.filter((i) => i.source === "association-rule");
    const fallbackItems = items.filter((i) => i.source === "fallback");
    const dimmed = loading && Boolean(data);

    return (
        <>
            {research && <ResearchPanel algorithm={algorithm} onChange={setAlgorithm} data={data} loading={loading} error={error} />}
            {ruleItems.length > 0 && <ProductSection title="Thường được mua cùng" items={ruleItems} research={research} dimmed={dimmed} />}
            {fallbackItems.length > 0 && (
                <ProductSection title="Có thể bạn cũng quan tâm" items={fallbackItems} research={research} dimmed={dimmed} />
            )}
        </>
    );
};

export default FrequentlyBoughtTogether;
