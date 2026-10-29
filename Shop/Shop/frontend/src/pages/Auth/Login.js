// import React, { useState } from "react";
// import { Link } from "react-router-dom";


// const Login = ({ onLogin }) => {
//     const [email, setEmail] = useState("");
//     const [password, setPassword] = useState("");

//     const handleEmailChange = (e) => {
//         setEmail(e.target.value);
//     };

//     const handlePasswordChange = (e) => {
//         setPassword(e.target.value);
//     };

//     const handleSubmit = (e) => {
//         e.preventDefault();
//         // Thực hiện xác thực, ví dụ: gửi yêu cầu đăng nhập đến server

//         // Sau khi xác thực thành công, gọi hàm onLogin và truyền thông tin đăng nhập
//         onLogin({ email, password });

//         // Sau khi xử lý đăng nhập, có thể xoá dữ liệu trong trường nhập để đảm bảo an toàn
//         setEmail("");
//         setPassword("");
//     };

//     return (
//         <section>
//             <div className="form-box">
//                 <div className="form-value">
//                     <form onSubmit={handleSubmit}>
//                         <h2>Login</h2>
//                         <div className="inputbox">
//                             <ion-icon name="mail-outline"></ion-icon>
//                             <input
//                                 type="email"
//                                 value={email}
//                                 onChange={handleEmailChange}
//                                 required
//                             />
//                             <label>Email</label>
//                         </div>
//                         <div className="inputbox">
//                             <ion-icon name="lock-closed-outline"></ion-icon>
//                             <input
//                                 type="password"
//                                 value={password}
//                                 onChange={handlePasswordChange}
//                                 required
//                             />
//                             <label>Password</label>
//                         </div>
//                         <div className="forget">
//                             <label>
//                                 <input type="checkbox" />Remember Me
//                                 <a href="#">Forget Password</a>
//                             </label>
//                         </div>
//                         <button className="loginn" type="submit">Log in</button>
//                         <div className="register">
//                             <p>
//                                 Don't have a account{" "}
//                                 <Link to="/register">Register</Link>
//                             </p>
//                         </div>
//                     </form>
//                 </div>
//             </div>
//         </section>
//     );
// };

// export default Login;

// Frontend/src/pages/Auth/Login.js
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { loginApi } from "../../services/Api";
import { LOGIN_SUCCESS } from "../../shared/constants/action-type";

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const { data } = await loginApi({ email, password });

            if (data.status === "success") {
                dispatch({
                    type: LOGIN_SUCCESS,
                    payload: data.data, // { token, user }
                });
                navigate("/"); // Về trang chủ sau khi đăng nhập
            }
        } catch (err) {
            const msg = err.response?.data?.message || "Đăng nhập thất bại. Vui lòng thử lại.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section>
            <div className="form-box">
                <div className="form-value">
                    <form onSubmit={handleSubmit}>
                        <h2>Login</h2>

                        {error && (
                            <div style={{
                                color: "#ff4d4f",
                                background: "rgba(255,77,79,0.15)",
                                border: "1px solid rgba(255,77,79,0.4)",
                                borderRadius: "8px",
                                padding: "8px 12px",
                                marginBottom: "12px",
                                fontSize: "0.9em",
                                textAlign: "center"
                            }}>
                                {error}
                            </div>
                        )}

                        <div className="inputbox">
                            <ion-icon name="mail-outline"></ion-icon>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                            <label>Email</label>
                        </div>

                        <div className="inputbox">
                            <ion-icon name="lock-closed-outline"></ion-icon>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <label>Password</label>
                        </div>

                        <button
                            className="loginn"
                            type="submit"
                            disabled={loading}
                            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
                        >
                            {loading ? "Đang đăng nhập..." : "Log in"}
                        </button>

                        <div className="register">
                            <p>
                                Chưa có tài khoản?{" "}
                                <Link to="/register">Đăng ký</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Login;

