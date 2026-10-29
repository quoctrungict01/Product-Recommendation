// Frontend/src/redux-setup/reducers/auth.js
import { LOGIN_SUCCESS, LOGOUT } from "../../shared/constants/action-type";

const initState = {
    user: JSON.parse(localStorage.getItem("user")) || null,
    token: localStorage.getItem("token") || null,
    isLoggedIn: !!localStorage.getItem("token"),
};

export default (state = initState, action) => {
    switch (action.type) {
        case LOGIN_SUCCESS:
            localStorage.setItem("token", action.payload.token);
            localStorage.setItem("user", JSON.stringify(action.payload.user));
            return {
                ...state,
                user: action.payload.user,
                token: action.payload.token,
                isLoggedIn: true,
            };
        case LOGOUT:
            localStorage.removeItem("token");
            localStorage.removeItem("user");
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