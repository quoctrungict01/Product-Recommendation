import React from "react";
import { getImageProduct } from "../ultils";
import { Link } from "react-router-dom";

export const formatPrice = (price) => {
    const formatter = new Intl.NumberFormat("vi-VN");
    return formatter.format(price).replace(/\./g, ".");
};

const ProductItem = ({ item }) => {
    const formattedPrice = formatPrice(item.price);
    return (
        <div className="product-item card text-center">
            <Link to={`/ProductDetails-${item._id}`}><img src={getImageProduct(item.image)} /></Link>
            <h4><Link to={`/ProductDetails-${item._id}`}>{item.name}</Link></h4>
            <p>Giá Bán: <span>{formattedPrice}đ</span></p>
        </div>
    )
}

// export { formatPrice };
export default ProductItem;