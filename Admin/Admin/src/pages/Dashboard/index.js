import React from "react";
import { Link } from "react-router-dom";
const Home = () => {
    return (
        <>
            <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
                <div className="row">
                    <ol className="breadcrumb">
                        <li><Link to="/"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></Link></li>
                        <li className="active">Trang chủ quản trị</li>
                    </ol>
                </div>{/*/.row*/}
                <div className="row">
                    <div className="col-lg-12">
                        <h1 className="page-header">Trang chủ quản trị</h1>
                    </div>
                </div>{/*/.row*/}
                <div className="row">
                    <div className="col-xs-12 col-md-6 col-lg-3">
                        <div className="panel panel-blue panel-widget ">
                            <div className="row no-padding">
                                <div className="col-sm-3 col-lg-5 widget-left">
                                    <svg className="glyph stroked bag"><use xlinkHref="#stroked-bag" /></svg>
                                </div>
                                <div className="col-sm-9 col-lg-7 widget-right">
                                    <div className="large">120</div>
                                    <div className="text-muted">Sản Phẩm</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="col-xs-12 col-md-6 col-lg-3">
                        <div className="panel panel-orange panel-widget">
                            <div className="row no-padding">
                                <div className="col-sm-3 col-lg-5 widget-left">
                                    <svg className="glyph stroked empty-message"><use xlinkHref="#stroked-empty-message" /></svg>
                                </div>
                                <div className="col-sm-9 col-lg-7 widget-right">
                                    <div className="large">52</div>
                                    <div className="text-muted">Bình Luận</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="col-xs-12 col-md-6 col-lg-3">
                        <div className="panel panel-teal panel-widget">
                            <div className="row no-padding">
                                <div className="col-sm-3 col-lg-5 widget-left">
                                    <svg className="glyph stroked male-user"><use xlinkHref="#stroked-male-user" /></svg>
                                </div>
                                <div className="col-sm-9 col-lg-7 widget-right">
                                    <div className="large">24</div>
                                    <div className="text-muted">Thành Viên</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="col-xs-12 col-md-6 col-lg-3">
                        <div className="panel panel-red panel-widget">
                            <div className="row no-padding">
                                <div className="col-sm-3 col-lg-5 widget-left">
                                    <svg className="glyph stroked app-window-with-content"><use xlinkHref="#stroked-app-window-with-content" /></svg>
                                </div>
                                <div className="col-sm-9 col-lg-7 widget-right">
                                    <div className="large">25</div>
                                    <div className="text-muted">Bình luận</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>{/*/.row*/}
            </div>	{/*/.main*/}
        </>
    )
}
export default Home;