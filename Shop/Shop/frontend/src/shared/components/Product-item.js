import React from "react";
import { getImageProduct } from "../ultils";
import { Link } from "react-router-dom";
import PriceTag from "./PriceTag";
import { getPricing } from "../ultils/pricing";

// Giữ để tương thích với nơi khác đang import; giá trị không phải số -> "" (không hiện "NaN").
export const formatPrice = (price) => {
    const n = typeof price === "number" ? price : Number(String(price ?? "").replace(/[., ]/g, ""));
    if (price === null || price === undefined || price === "" || !Number.isFinite(n)) return "";
    return new Intl.NumberFormat("vi-VN").format(n);
};

const ProductItem = ({ item }) => {
    const to = `/ProductDetails-${item._id}`;
    const soldOut = item.is_stock === false;
    const { hasDiscount, percent } = getPricing(item);
    return (
        <div className={`product-item card text-center${soldOut ? " out-of-stock" : ""}`}>
            {soldOut ? <div className="product-item-badge">Hết hàng</div> : null}
            {hasDiscount ? <div className="product-item-badge sale">-{percent}%</div> : null}
            <Link to={to}>
                <img src={getImageProduct(item.image)} alt={item.name} loading="lazy" />
            </Link>
            <h4>
                <Link to={to}>{item.name}</Link>
            </h4>
            <PriceTag product={item} />
        </div>
    );
};

export default ProductItem;
