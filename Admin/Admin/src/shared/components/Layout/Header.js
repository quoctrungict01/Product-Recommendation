import React from "react";
import { useNavigate } from "react-router-dom";
import { clearAdminSession, loadAdminSession } from "../../auth/session";

const Header = () => {
    const navigate = useNavigate();
    const session = loadAdminSession();
    const name = session ? session.user.full_name || session.user.email : "Admin";
    const onLogout = (e) => {
        e.preventDefault();
        clearAdminSession();
        navigate("/login", { replace: true });
    };
    return (
        <>

                <nav className="navbar navbar-inverse navbar-fixed-top" role="navigation">
                    <div className="container-fluid">
                        <div className="navbar-header">
                            <button type="button" className="navbar-toggle collapsed" data-toggle="collapse" data-target="#sidebar-collapse">
                                <span className="sr-only">Toggle navigation</span>
                                <span className="icon-bar" />
                                <span className="icon-bar" />
                                <span className="icon-bar" />
                            </button>
                            <a className="navbar-brand" href="/"><span>Trung</span>Shop</a>
                            <ul className="user-menu">
                                <li className="pull-right" style={{ listStyle: "none" }}>
                                    <span style={{ color: "#fff", marginRight: 12 }}>
                                        <svg className="glyph stroked male-user"><use xlinkHref="#stroked-male-user" /></svg> {name}
                                    </span>
                                    <a href="/login" onClick={onLogout} style={{ color: "#fff" }}>
                                        <svg className="glyph stroked cancel"><use xlinkHref="#stroked-cancel" /></svg> Đăng xuất
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>{/* /.container-fluid */}
                </nav>

        </>
    )
}
export default Header;
