import React, { useEffect } from "react";
import { getProducts } from "../../services/Api";
import ProductItem from "../../shared/components/Product-item";
const Home = () => {
    const [latestProduct, setLatestProduct] = React.useState([]);
    const [featuredProduct, setFeaturedProduct] = React.useState([]);
    useEffect(() => {
        getProducts({
            params: {
                limit: 6,
            }
        }).then((res) => {
            setLatestProduct(res.data.data.docs);
        });
        getProducts({
            params: {
                limit: 6,
                "filter[is_featured]": true,
                // "filter[is_stock]": true,
            },
        }).then((res) => {
            setFeaturedProduct(res.data.data.docs);
        });

    }, []);
    return (
        <>
            {/*	Feature Product	*/}
            <div className="products">
                <h3>Sản phẩm nổi bật</h3>
                <div className="product-list card-deck">
                    {
                        featuredProduct.map((product) => {
                            return <ProductItem key={product._id} item={product} />
                        })
                    }

                </div>
            </div>
            {/*	End Feature Product	*/}
            {/*	Latest Product	*/}
            <div className="products">
                <h3>Sản phẩm mới</h3>
                <div className="product-list card-deck">
                    {
                        latestProduct.map((value) =>
                            <ProductItem item={value} />
                        )
                    }
                </div>
            </div>
            {/*	End Latest Product	*/}
        </>
    )
}
export default Home;