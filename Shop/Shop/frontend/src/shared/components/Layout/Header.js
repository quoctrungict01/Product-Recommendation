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
import { publicAsset } from "../../ultils/publicAsset";
import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LOGOUT } from "../../../shared/constants/action-type";

const getDisplayName = (user) => {
    if (!user) return "";
    if (user.full_name && user.full_name.trim() !== "") return user.full_name;
    return user.email ? user.email.split("@")[0] : "Tài khoản";
};

// Gõ trên trang /Search: kết quả cập nhật sau khi ngừng gõ SEARCH_DEBOUNCE_MS (không gọi API mỗi phím).
// Ở trang khác: Enter hoặc nút "Tìm kiếm" mới chuyển sang trang kết quả.
export const SEARCH_DEBOUNCE_MS = 400;

/** URL trang kết quả: giữ bộ lọc đang chọn khi đã ở /Search, luôn về trang 1. */
const searchUrl = (keyword, location) => {
    const params = new URLSearchParams(location.pathname === "/Search" ? location.search : "");
    params.delete("page");
    params.delete("keyword");
    const q = keyword.trim().slice(0, 100);
    if (q) params.set("q", q);
    else params.delete("q");
    const qs = params.toString();
    return qs ? `/Search?${qs}` : "/Search";
};

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const urlKeyword = React.useMemo(() => {
        if (location.pathname !== "/Search") return null;
        const p = new URLSearchParams(location.search);
        return p.get("q") ?? p.get("keyword") ?? "";
    }, [location.pathname, location.search]);
    const [keyword, setKeyword] = React.useState(urlKeyword || "");
    const typed = React.useRef(false);

    // Đồng bộ ô tìm kiếm khi URL đổi (nút Back, bấm link) — không ghi đè lúc người dùng đang gõ.
    React.useEffect(() => {
        if (urlKeyword !== null && !typed.current) setKeyword((k) => (k.trim() === urlKeyword.trim() ? k : urlKeyword));
    }, [urlKeyword]);

    // Tìm kiếm tức thời (chỉ trên trang /Search), có debounce.
    React.useEffect(() => {
        if (!typed.current || location.pathname !== "/Search") return undefined;
        const timer = setTimeout(() => {
            typed.current = false;
            if (keyword.trim() !== (urlKeyword || "").trim()) navigate(searchUrl(keyword, location), { replace: true });
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyword]);
    const dispatch = useDispatch();

    const totalCart = useSelector(({ Cart }) =>
        Cart.items.reduce((total, item) => total + item.qty, 0)
    );

    const { isLoggedIn, user } = useSelector(({ Auth }) => Auth);
    const displayName = getDisplayName(user);

    const onChangeInput = (e) => {
        typed.current = true;
        setKeyword(e.target.value);
    };

    // Enter trong ô hoặc bấm nút: tìm ngay (encode từ khóa, không ghép chuỗi thô vào URL).
    const onSubmitSearch = (e) => {
        e.preventDefault();
        typed.current = false;
        navigate(searchUrl(keyword, location));
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
                    white-space: nowrap;
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
                .header-account-link {
                    color: #fff;
                    font-size: 13px;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 6px;
                    padding: 4px 10px;
                    white-space: nowrap;
                    text-decoration: none;
                }
                .header-account-link:hover {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                    text-decoration: none;
                }
                @media (max-width: 991px) {
                    #header-right { flex-wrap: wrap; height: auto; padding: 8px 0; justify-content: center; }
                    .header-user-area { flex-wrap: wrap; justify-content: center; }
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
                    /* min-height (không phải height): trên màn hình hẹp các nút xuống dòng mà vẫn nằm trong nền tối */
                    min-height: 60px;
                }
            `}</style>

            <div id="header">
                <div className="container">
                    <div className="row">
                        {/* Logo */}
                        <div id="logo" className="col-lg-3 col-md-3 col-sm-12">
                            <h1>
                                <Link to="/">
                                    <img className="img-fluid" src={publicAsset("images/nameshopp.png")} alt="TrungShop" />
                                </Link>
                            </h1>
                        </div>

                        {/* Search */}
                        <div id="search" className="col-lg-5 col-md-5 col-sm-12">
                            <form className="form-inline" role="search" onSubmit={onSubmitSearch}>
                                <input
                                    onChange={onChangeInput}
                                    value={keyword}
                                    className="form-control mt-3"
                                    type="search"
                                    maxLength={100}
                                    placeholder="Tìm kiếm sản phẩm"
                                    aria-label="Tìm kiếm sản phẩm"
                                />
                                <button className="btn btn-danger mt-3" type="submit">
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
                                        <Link to="/account/profile" className="header-account-link">
                                            Tài khoản của tôi
                                        </Link>
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