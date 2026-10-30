export const ADD_TO_CART = "ADD_TO_CART";
export const UPDATE_CART = "UPDATE_CART";
export const DELETE_ITEM_CART = "DELETE_ITEM_CART";
// Cập nhật giá bán/tình trạng hàng của các sản phẩm trong giỏ theo backend; payload: { items: [{ _id, price, is_stock, name?, image? }] }
export const REFRESH_CART_ITEMS = "REFRESH_CART_ITEMS";
// Xóa giỏ hàng — CHỈ dispatch sau khi backend xác nhận đã tạo đơn thành công.
export const CLEAR_CART = "CLEAR_CART";

// Auth actions — THÊM MỚI
export const LOGIN_SUCCESS = "LOGIN_SUCCESS";
export const LOGOUT = "LOGOUT";
// Cập nhật thông tin người dùng đang đăng nhập (sau khi sửa hồ sơ); payload: { user, token? }
export const UPDATE_USER = "UPDATE_USER";
