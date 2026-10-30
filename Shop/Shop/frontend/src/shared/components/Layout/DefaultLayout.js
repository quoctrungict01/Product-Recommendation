import { getCategories } from "../../../services/Api";
import React from "react";
import Header from "./Header";
import Footer from "./Footer";
import Menu from "./Menu";
import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

// Khung chung của mọi trang Shop: Header, menu danh mục, Footer.
// Phần thân do route con quyết định:
//  - ShopLayout: trang mua sắm (cột nội dung + cột banner quảng cáo bên phải).
//  - FullWidthLayout: trang tài khoản, trang 404 (chỉ nội dung, không banner).
// Slideshow quảng cáo chỉ nằm ở trang chủ (pages/Home).
const DefaultLayout = () => {
    const [categories, setCategories] = React.useState([]);
    React.useEffect(() => {
        let alive = true;
        getCategories()
            .then(({ data }) => alive && setCategories(data.data.docs))
            .catch(() => {}); // backend chưa chạy: menu trống, trang vẫn hiển thị
        return () => {
            alive = false;
        };
    }, []);
    return (
        <>
            <Header />
            {/*	Body	*/}
            <div id="body">
                <div className="container">
                    <div className="row">
                        <div className="col-lg-12 col-md-12 col-sm-12">
                            <Menu categories={categories} />
                        </div>
                    </div>
                    <Outlet />
                </div>
            </div>
            {/*	End Body	*/}

            <Footer />
        </>
    );
};

/** Trang mua sắm: nội dung bên trái, banner quảng cáo bên phải (xuống dưới trên màn hình hẹp). */
export const ShopLayout = () => (
    <div className="row">
        <div id="main" className="col-lg-8 col-md-12 col-sm-12">
            <Outlet />
        </div>
        <Sidebar />
    </div>
);

/** Trang tài khoản / 404: nội dung chiếm toàn bộ chiều rộng, không banner. */
export const FullWidthLayout = () => (
    <div className="row">
        <div id="main" className="col-lg-12 col-md-12 col-sm-12">
            <Outlet />
        </div>
    </div>
);

export default DefaultLayout;
