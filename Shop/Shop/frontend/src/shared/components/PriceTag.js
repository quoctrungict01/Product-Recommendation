// Giá bán nổi bật; giá gốc gạch ngang và "-x%" CHỈ khi backend xác nhận có ưu đãi hợp lệ.
import React from "react";
import { getPricing, formatMoney } from "../ultils/pricing";
import "./catalog.css";

const PriceTag = ({ product, size = "md", label = "Giá bán:" }) => {
    const { price, original, percent, hasDiscount } = getPricing(product);
    if (price === null) {
        return (
            <p className={`price-tag price-tag-${size}`}>
                <b className="price-tag-contact">Liên hệ để biết giá</b>
            </p>
        );
    }
    return (
        <p className={`price-tag price-tag-${size}`}>
            {label ? <span className="price-tag-label">{label} </span> : null}
            <b className="price-tag-final">{formatMoney(price)}đ</b>
            {hasDiscount ? (
                <>
                    {" "}
                    <del className="price-tag-original" aria-label={`Giá gốc ${formatMoney(original)} đồng`}>
                        {formatMoney(original)}đ
                    </del>{" "}
                    <em className="price-tag-percent">-{percent}%</em>
                </>
            ) : null}
        </p>
    );
};

export default PriceTag;
