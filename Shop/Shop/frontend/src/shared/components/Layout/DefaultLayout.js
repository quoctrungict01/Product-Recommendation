import { getCategories } from "../../../services/Api";
import React from "react";
import Header from "./Header";
import Footer from "./Footer";
import Menu from "./Menu";
import Sidebar from "./Sidebar";
import Slider from "./Slider";
import { Outlet } from "react-router-dom";

const DefaultLayout = ({ children }) => {
    const [categories, setCategories] = React.useState([]);
    React.useEffect(() => {
      getCategories().then(({data})=>{
        setCategories(data.data.docs);
      });
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
                    <div className="row">
                        <div id="main" className="col-lg-8 col-md-12 col-sm-12">
                            <Slider />
                            <Outlet/>
                        </div>
                        <Sidebar />
                    </div>
                </div>
            </div>
            {/*	End Body	*/}

            <Footer />
        </>
    );
};

export default DefaultLayout;
