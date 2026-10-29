import { combineReducers } from "redux";
import cartReducer from "./cart";
import authReducer from "./auth"; // THÊM
export default combineReducers({
    Cart: cartReducer,
    Auth: authReducer, // THÊM
});