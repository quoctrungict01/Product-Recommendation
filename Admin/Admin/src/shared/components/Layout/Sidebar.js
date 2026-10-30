import React from "react";
import { Link, useLocation } from "react-router-dom";

// Menu quản trị: điều hướng trong ứng dụng (không tải lại trang) và đánh dấu mục đang mở.
const ITEMS = [
    { to: "/", icon: "dashboard-dial", label: "Dashboard" },
    { to: "/user", icon: "male-user", label: "Quản lý thành viên" },
    { to: "/category", icon: "open-folder", label: "Quản lý danh mục" },
    { to: "/product", icon: "bag", label: "Quản lý sản phẩm" },
    { to: "/comment", icon: "two-messages", label: "Quản lý bình luận" },
    { to: "/order", icon: "chain", label: "Quản lý đơn hàng" },
    { to: "/coupon", icon: "tag", label: "Mã giảm giá" },
];

const isActive = (pathname, to) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`) || pathname.startsWith(`${to}-`));

const Sidebar = () => {
    const { pathname } = useLocation();
    return (
        <div id="sidebar-collapse" className="col-sm-3 col-lg-2 sidebar">
            <ul className="nav menu">
                {ITEMS.map((item) => (
                    <li key={item.to} className={isActive(pathname, item.to) ? "active" : ""}>
                        <Link to={item.to} aria-current={isActive(pathname, item.to) ? "page" : undefined}>
                            <svg className={`glyph stroked ${item.icon}`}>
                                <use xlinkHref={`#stroked-${item.icon}`} />
                            </svg>{" "}
                            {item.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Sidebar;
