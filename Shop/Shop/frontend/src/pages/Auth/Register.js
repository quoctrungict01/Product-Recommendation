// import React, { useState } from "react";
// import { Link } from "react-router-dom";


// const Register = ({ onRegister }) => {
//     const [username, setUsername] = useState("");
//     const [email, setEmail] = useState("");
//     const [password, setPassword] = useState("");

//     const handleUsernameChange = (e) => {
//         setUsername(e.target.value);
//     };

//     const handleEmailChange = (e) => {
//         setEmail(e.target.value);
//     };

//     const handlePasswordChange = (e) => {
//         setPassword(e.target.value);
//     };

//     const handleSubmit = (e) => {
//         e.preventDefault();
//         // Thực hiện xác thực, ví dụ: gửi yêu cầu đăng ký đến server

//         // Sau khi xác thực thành công, gọi hàm onRegister và truyền thông tin đăng ký
//         onRegister({ username, email, password });

//         // Sau khi xử lý đăng ký, có thể xoá dữ liệu trong trường nhập để đảm bảo an toàn
//         setUsername("");
//         setEmail("");
//         setPassword("");
//     };

//     return (
//         <section>
//             <div className="form-box">
//                 <div className="form-value">
//                     <form onSubmit={handleSubmit}>
//                         <h2>Register</h2>
//                         <div className="inputbox">
//                             <ion-icon name="person-outline"></ion-icon>
//                             <input
//                                 type="text"
//                                 value={username}
//                                 onChange={handleUsernameChange}
//                                 required
//                             />
//                             <label>Username</label>
//                         </div>
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
//                         <button className="registerr" type="submit">Register</button>
//                         <div className="login">
//                             <p>
//                                 Already have an account? <Link to="/login">Log in</Link>
//                             </p>
//                         </div>
//                     </form>
//                 </div>
//             </div>
//         </section>
//     );
// };

// export default Register;

// Frontend/src/pages/Auth/Register.js
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { registerApi } from "../../services/Api";
import { LOGIN_SUCCESS } from "../../shared/constants/action-type";

const Register = () => {
    const [fullName, setFullName] = useState("");
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
            const { data } = await registerApi({ full_name: fullName, email, password });

            if (data.status === "success") {
                dispatch({
                    type: LOGIN_SUCCESS,
                    payload: data.data,
                });
                navigate("/");
            }
        } catch (err) {
            const msg = err.response?.data?.message || "Đăng ký thất bại. Vui lòng thử lại.";
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
                        <h2>Register</h2>

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
                            <ion-icon name="person-outline"></ion-icon>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                            />
                            <label>Họ và tên</label>
                        </div>

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
                                minLength={8}
                                maxLength={128}
                                title="Mật khẩu tối thiểu 8 ký tự, có cả chữ và số"
                            />
                            <label>Password (≥ 8 ký tự, có chữ và số)</label>
                        </div>

                        <button
                            className="registerr"
                            type="submit"
                            disabled={loading}
                            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
                        >
                            {loading ? "Đang đăng ký..." : "Register"}
                        </button>

                        <div className="register">
                            <p>
                                Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Register;