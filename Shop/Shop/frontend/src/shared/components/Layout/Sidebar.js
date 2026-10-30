import { publicAsset } from "../../ultils/publicAsset";
import React from "react";

const Sidebar = () => {
    return (
        <>
            <div id="sidebar" className="col-lg-4 col-md-12 col-sm-12">
                <div id="banner">
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src={publicAsset("images/banner-1.jpg")} alt="Banner khuyến mãi" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src={publicAsset("images/banner-2.jpg")} alt="Banner khuyến mãi" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src={publicAsset("images/banner-3.jpg")} alt="Banner khuyến mãi" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src={publicAsset("images/banner-4.jpg")} alt="Banner khuyến mãi" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src={publicAsset("images/banner-5.jpg")} alt="Banner khuyến mãi" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src={publicAsset("images/banner-6.png")} alt="Banner khuyến mãi" /></a>
                    </div>
                </div>
            </div>
        </>
    )
}
export default Sidebar;