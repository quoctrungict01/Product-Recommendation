import React from "react";

const Sidebar = () => {
    return (
        <>
            <div id="sidebar" className="col-lg-4 col-md-12 col-sm-12">
                <div id="banner">
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src="images/banner-1.jpg" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src="images/banner-2.jpg" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src="images/banner-3.jpg" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src="images/banner-4.jpg" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src="images/banner-5.jpg" /></a>
                    </div>
                    <div className="banner-item">
                        <a href="#"><img className="img-fluid" src="images/banner-6.png" /></a>
                    </div>
                </div>
            </div>
        </>
    )
}
export default Sidebar;