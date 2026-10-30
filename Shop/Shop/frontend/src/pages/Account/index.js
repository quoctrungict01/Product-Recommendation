// Tài khoản của tôi: Hồ sơ | Địa chỉ | Đơn hàng của tôi.
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import RequireLogin from "./RequireLogin";
import "./account.css";

const TABS = [
    { to: "/account/profile", label: "Hồ sơ & mật khẩu" },
    { to: "/account/address", label: "Địa chỉ giao hàng" },
    { to: "/account/orders", label: "Đơn hàng của tôi" },
];

const Account = () => (
    <RequireLogin>
        <div className="account-box">
            <h2>Tài khoản của tôi</h2>
            <nav aria-label="Tài khoản">
                <ul className="account-tabs">
                    {TABS.map((t) => (
                        <li key={t.to}>
                            <NavLink to={t.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
                                {t.label}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>
            <Outlet />
        </div>
    </RequireLogin>
);

export default Account;
