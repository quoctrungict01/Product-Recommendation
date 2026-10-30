import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { getProducts } from "../../services/Api";
import ProductItem from "../../shared/components/Product-item";
import Slider from "../../shared/components/Layout/Slider";

// Trang chủ: 6 sản phẩm nổi bật + 6 sản phẩm mới nhất (lọc ở backend).
const Section = ({ title, products, error, moreLink }) => (
    <div className="products">
        <h3>{title}</h3>
        {error ? (
            <p className="text-danger" role="alert">
                Không tải được sản phẩm. Vui lòng tải lại trang.
            </p>
        ) : (
            <div className="product-list card-deck">
                {products.map((product) => (
                    <ProductItem key={product._id} item={product} />
                ))}
            </div>
        )}
        {moreLink ? (
            <p style={{ textAlign: "right", margin: "6px 0 0" }}>
                <Link to={moreLink} style={{ color: "#EB1F27" }}>
                    Xem tất cả sản phẩm »
                </Link>
            </p>
        ) : null}
    </div>
);

const Home = () => {
    const [latest, setLatest] = React.useState({ docs: [], error: false });
    const [featured, setFeatured] = React.useState({ docs: [], error: false });
    useEffect(() => {
        getProducts({ params: { limit: 6, is_featured: true } })
            .then((res) => setFeatured({ docs: res.data.data.docs, error: false }))
            .catch(() => setFeatured({ docs: [], error: true }));
        getProducts({ params: { limit: 6, sort: "newest" } })
            .then((res) => setLatest({ docs: res.data.data.docs, error: false }))
            .catch(() => setLatest({ docs: [], error: true }));
    }, []);
    return (
        <>
            {/* Slideshow quảng cáo: chỉ ở trang chủ */}
            <Slider />
            <Section title="Sản phẩm nổi bật" products={featured.docs} error={featured.error} />
            <Section title="Sản phẩm mới" products={latest.docs} error={latest.error} moreLink="/Search" />
        </>
    );
};
export default Home;
