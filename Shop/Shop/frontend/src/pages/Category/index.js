// Trang danh mục: sản phẩm của một danh mục, có lọc giá/còn hàng, sắp xếp và phân trang ở backend.
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getCategory } from "../../services/Api";
import ProductBrowser from "../../shared/components/ProductBrowser";

const Category = () => {
    const { id } = useParams();
    const [category, setCategory] = React.useState(null);
    const [notFound, setNotFound] = React.useState(false);

    useEffect(() => {
        let alive = true;
        setCategory(null);
        setNotFound(false);
        getCategory(id, {})
            .then(({ data }) => alive && setCategory(data.data))
            .catch(() => alive && setNotFound(true));
        window.scrollTo({ top: 430, behavior: "smooth" });
        return () => {
            alive = false;
        };
    }, [id]);

    if (notFound) {
        return (
            <div className="products">
                <h3>Không tìm thấy danh mục.</h3>
            </div>
        );
    }
    return (
        <ProductBrowser
            key={id}
            fixedCategoryId={id}
            renderTitle={({ total, status }) => (
                <h3>
                    {category ? category.name : "Danh mục"}
                    {status === "ready" ? ` (hiện có ${total} sản phẩm)` : ""}
                </h3>
            )}
        />
    );
};

export default Category;
