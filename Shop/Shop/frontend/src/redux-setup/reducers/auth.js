// Frontend/src/redux-setup/reducers/auth.js
// Phiên đăng nhập lưu trong localStorage (đồ án). Token hết hạn bị bỏ ngay khi tải trang.
import { LOGIN_SUCCESS, LOGOUT, UPDATE_USER } from "../../shared/constants/action-type";
import { loadStoredSession, clearStoredSession, TOKEN_KEY, USER_KEY } from "../../shared/ultils/authToken";

const stored = loadStoredSession();
const initState = {
    user: stored.user,
    token: stored.token,
    isLoggedIn: Boolean(stored.token),
};

const save = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (_) {
        /* bộ nhớ trình duyệt bị chặn: vẫn giữ phiên trong bộ nhớ */
    }
};

export default (state = initState, action) => {
    switch (action.type) {
        case LOGIN_SUCCESS:
            save(TOKEN_KEY, action.payload.token);
            save(USER_KEY, JSON.stringify(action.payload.user));
            return {
                ...state,
                user: action.payload.user,
                token: action.payload.token,
                isLoggedIn: true,
            };
        case UPDATE_USER: {
            if (!state.isLoggedIn) return state;
            const user = action.payload.user || state.user;
            const token = action.payload.token || state.token;
            save(USER_KEY, JSON.stringify(user));
            if (action.payload.token) save(TOKEN_KEY, token);
            return { ...state, user, token };
        }
        case LOGOUT:
            clearStoredSession();
            return {
                ...state,
                user: null,
                token: null,
                isLoggedIn: false,
            };
        default:
            return state;
    }
};
