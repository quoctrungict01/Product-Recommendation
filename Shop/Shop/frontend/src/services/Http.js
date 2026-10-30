import axios from "axios";
import { BASE_API } from "../shared/constants/app";
import { TOKEN_KEY, isTokenExpired } from "../shared/ultils/authToken";
import { LOGOUT } from "../shared/constants/action-type";

const Http = axios.create({
    baseURL: BASE_API,
});

// Gửi kèm token (nếu còn hạn) trong header Authorization: Bearer <token>.
Http.interceptors.request.use((config) => {
    let token = null;
    try {
        token = localStorage.getItem(TOKEN_KEY);
    } catch (_) {
        token = null;
    }
    if (token && !isTokenExpired(token)) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Backend trả 401 khi token sai/hết hạn/tài khoản không còn -> đăng xuất phía giao diện.
// (403 = đã đăng nhập nhưng không đủ quyền: giữ phiên, để trang hiển thị thông báo.)
Http.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error && error.response && error.response.status === 401 && error.config && error.config.headers && error.config.headers.Authorization) {
            // nạp store lười để tránh phụ thuộc vòng khi khởi tạo
            const store = require("../redux-setup/store").default;
            store.dispatch({ type: LOGOUT });
        }
        return Promise.reject(error);
    }
);

export default Http;
