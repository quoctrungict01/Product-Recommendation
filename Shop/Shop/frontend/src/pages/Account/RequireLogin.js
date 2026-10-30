// Chỉ cho vào khi đã đăng nhập (lớp giao diện — backend vẫn tự kiểm tra token ở mọi API).
import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import { isTokenExpired } from "../../shared/ultils/authToken";
import { LOGOUT } from "../../shared/constants/action-type";

const RequireLogin = ({ children }) => {
    const { isLoggedIn, token } = useSelector(({ Auth }) => Auth);
    const dispatch = useDispatch();
    const location = useLocation();
    const expired = isLoggedIn && isTokenExpired(token);
    React.useEffect(() => {
        if (expired) dispatch({ type: LOGOUT });
    }, [expired, dispatch]);
    if (!isLoggedIn || expired) {
        const next = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/login?next=${next}`} replace />;
    }
    return children;
};

export default RequireLogin;
