// import React from "react";
// import { useSelector } from "react-redux";
// import {Link, useNavigate} from "react-router-dom"

// const Header = () => {
//     const [keyword, setKeyword] = React.useState("");
//     const navigate = useNavigate();

//     const totalCart = useSelector(({Cart})=>{
//         return Cart.items.reduce((total, item)=>total+item.qty, 0)
//     });

//     const onChangeInput = (e)=>{
//         setKeyword(e.target.value);
//     }
//     const onClickButton = (e)=>{
//         e.preventDefault();
//         return navigate(`/Search?keyword=${keyword}`)
//         // console.log(keyword);
//     }
//     return (
//         <>
//             {/*	Header	*/}
//             <div id="header">
//                 <div className="container">
//                     <div className="row">
//                         <div id="logo" className="col-lg-3 col-md-3 col-sm-12">
//                             <h1><Link to="/"><img className="img-fluid" src="images/nameshopp.png" alt="" /></Link></h1>
//                         </div>
//                         <div id="search" className="col-lg-6 col-md-6 col-sm-12">
//                             <form className="form-inline">
//                                 <input onChange={onChangeInput} className="form-control mt-3" type="search" placeholder="Tìm kiếm" aria-label="Search" />
//                                 <button onClick={onClickButton} className="btn btn-danger mt-3" type="submit">Tìm kiếm</button>
//                             </form>
//                         </div>
//                         <div id="cart" className="col-lg-3 col-md-3 col-sm-12">
//                             <Link className="mt-4 mr-2" to="/Login"></Link>
                            
//                             <Link className="mt-4 mr-2" to="/Cart">giỏ hàng</Link><span className="mt-3">{totalCart}</span>
//                         </div>
//                     </div>
//                 </div>
//                 {/* Toggler/collapsibe Button */}
//                 <button className="navbar-toggler navbar-light" type="button" data-toggle="collapse" data-target="#menu">
//                     <span className="navbar-toggler-icon" />
//                 </button>
//             </div>
//             {/*	End Header	*/}
//         </>
//     )
// }
// export default Header;


// Frontend/src/shared/components/Layout/Header.js
import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { LOGOUT } from "../../../shared/constants/action-type";

const getDisplayName = (user) => {
    if (!user) return "";
    if (user.full_name && user.full_name.trim() !== "") return user.full_name;
    return user.email ? user.email.split("@")[0] : "Tài khoản";
};

const Header = () => {
    const [keyword, setKeyword] = React.useState("");
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const totalCart = useSelector(({ Cart }) =>
        Cart.items.reduce((total, item) => total + item.qty, 0)
    );

    const { isLoggedIn, user } = useSelector(({ Auth }) => Auth);
    const displayName = getDisplayName(user);

    const onChangeInput = (e) => setKeyword(e.target.value);

    const onClickButton = (e) => {
        e.preventDefault();
        navigate(`/Search?keyword=${keyword}`);
    };

    const handleLogout = () => {
        dispatch({ type: LOGOUT });
        navigate("/");
    };

    return (
        <>
            <style>{`
                #header { background: #222; }

                .header-cart-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 6px;
                    padding: 5px 12px;
                    color: #fff;
                    text-decoration: none;
                    font-size: 13px;
                    transition: background 0.2s;
                    cursor: pointer;
                }
                .header-cart-btn:hover {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                    text-decoration: none;
                }
                .header-cart-badge {
                    background: #EB1F27;
                    color: #fff;
                    border-radius: 10px;
                    padding: 1px 7px;
                    font-size: 12px;
                    font-weight: bold;
                    min-width: 20px;
                    text-align: center;
                }

                .header-login-btn {
                    display: inline-block;
                    background: #EB1F27;
                    color: #fff !important;
                    border: none;
                    border-radius: 6px;
                    padding: 5px 16px;
                    font-size: 13px;
                    font-weight: bold;
                    text-decoration: none;
                    cursor: pointer;
                    transition: background 0.2s;
                    white-space: nowrap;
                }
                .header-login-btn:hover {
                    background: #c60a11;
                    text-decoration: none;
                    color: #fff;
                }

                .header-user-area {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .header-user-name {
                    color: #fff;
                    font-size: 13px;
                    max-width: 140px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .header-logout-btn {
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.4);
                    color: #fff;
                    border-radius: 6px;
                    padding: 4px 12px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 0.2s;
                    white-space: nowrap;
                }
                .header-logout-btn:hover {
                    background: rgba(255,255,255,0.15);
                }

                #header-right {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 10px;
                    height: 60px;
                }
            `}</style>

            <div id="header">
                <div className="container">
                    <div className="row">
                        {/* Logo */}
                        <div id="logo" className="col-lg-3 col-md-3 col-sm-12">
                            <h1>
                                <Link to="/">
                                    <img className="img-fluid" src="images/nameshopp.png" alt="TrungShop" />
                                </Link>
                            </h1>
                        </div>

                        {/* Search */}
                        <div id="search" className="col-lg-5 col-md-5 col-sm-12">
                            <form className="form-inline">
                                <input
                                    onChange={onChangeInput}
                                    className="form-control mt-3"
                                    type="search"
                                    placeholder="Tìm kiếm"
                                />
                                <button onClick={onClickButton} className="btn btn-danger mt-3" type="submit">
                                    Tìm kiếm
                                </button>
                            </form>
                        </div>

                        {/* Cart + Auth */}
                        <div className="col-lg-4 col-md-4 col-sm-12">
                            <div id="header-right">
                                {/* Giỏ hàng */}
                                <Link to="/Cart" className="header-cart-btn">
                                    🛒 Giỏ hàng
                                    {totalCart > 0 && (
                                        <span className="header-cart-badge">{totalCart}</span>
                                    )}
                                </Link>

                                {/* Auth */}
                                {isLoggedIn ? (
                                    <div className="header-user-area">
                                        <span className="header-user-name">
                                            👋 <b>{displayName}</b>
                                        </span>
                                        <button className="header-logout-btn" onClick={handleLogout}>
                                            Đăng xuất
                                        </button>
                                    </div>
                                ) : (
                                    <Link to="/login" className="header-login-btn">
                                        Đăng nhập
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <button className="navbar-toggler navbar-light" type="button" data-toggle="collapse" data-target="#menu">
                    <span className="navbar-toggler-icon" />
                </button>
            </div>
        </>
    );
};

export default Header;