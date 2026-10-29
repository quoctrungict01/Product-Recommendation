import React from "react";

const Sidebar = () => {
    return (
        <>
            <div id="sidebar-collapse" className="col-sm-3 col-lg-2 sidebar">
                    <form role="search">
                        <div className="form-group">
                            <input type="text" className="form-control" placeholder="Search" />
                        </div>
                    </form>
                    <ul className="nav menu">
                        <li><a href="/"><svg className="glyph stroked dashboard-dial"><use xlinkHref="#stroked-dashboard-dial" /></svg> Dashboard</a></li>
                        <li><a href="/user"><svg className="glyph stroked male user "><use xlinkHref="#stroked-male-user" /></svg>Quản lý thành viên</a></li>
                        <li><a href="/category"><svg className="glyph stroked open folder"><use xlinkHref="#stroked-open-folder" /></svg>Quản lý danh mục</a></li>
                        <li><a href="/product"><svg className="glyph stroked bag"><use xlinkHref="#stroked-bag" /></svg>Quản lý sản phẩm</a></li>
                        <li><a href="/comment"><svg className="glyph stroked two messages"><use xlinkHref="#stroked-two-messages" /></svg> Quản lý bình luận</a></li>
                        <li><a href="/order"><svg className="glyph stroked chain"><use xlinkHref="#stroked-chain" /></svg> Quản lý đơn hàng</a></li>
                        <li><a href="setting.html"><svg className="glyph stroked gear"><use xlinkHref="#stroked-gear" /></svg> Cấu hình</a></li>
                    </ul>
                </div>{/*/.sidebar*/}
            
        </>
    )
}
export default Sidebar;








