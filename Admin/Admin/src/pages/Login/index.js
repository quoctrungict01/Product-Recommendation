import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { loginApi } from "../../services/Api";
import { saveAdminSession, loadAdminSession } from "../../shared/auth/session";

const REASONS = {
    expired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    forbidden: "Tài khoản không còn quyền quản trị.",
};

/**
 * Đăng nhập Admin: dùng API /auth/login chung, nhưng CHỈ lưu phiên khi tài khoản có role "admin".
 * (Chặn ở giao diện chỉ để cải thiện trải nghiệm — backend vẫn kiểm tra quyền ở mọi API quản trị.)
 */
const Login = ({ login = loginApi }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const reason = new URLSearchParams(location.search).get("reason");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [error, setError] = React.useState(REASONS[reason] || "");
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (loadAdminSession()) navigate("/", { replace: true });
    }, [navigate]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const { data } = await login({ email, password });
            const { token, user } = data.data || {};
            if (!user || user.role !== "admin") {
                setError("Tài khoản này không có quyền quản trị.");
                return;
            }
            saveAdminSession({ token, user });
            setPassword("");
            navigate("/", { replace: true });
        } catch (err) {
            setError((err.response && err.response.data && err.response.data.message) || "Không đăng nhập được. Vui lòng thử lại.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="row">
            <div className="col-xs-10 col-xs-offset-1 col-sm-8 col-sm-offset-2 col-md-4 col-md-offset-4" style={{ marginTop: 80 }}>
                <div className="login-panel panel panel-default">
                    <div className="panel-heading">Đăng nhập quản trị TrungShop</div>
                    <div className="panel-body">
                        <form onSubmit={onSubmit}>
                            {error ? (
                                <div className="alert alert-danger" role="alert">
                                    {error}
                                </div>
                            ) : null}
                            <fieldset>
                                <div className="form-group">
                                    <label htmlFor="admin-email">Email</label>
                                    <input id="admin-email" className="form-control" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="admin-password">Mật khẩu</label>
                                    <input id="admin-password" className="form-control" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                                </button>
                            </fieldset>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
