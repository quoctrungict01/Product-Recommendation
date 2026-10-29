// import { ADD_TO_CART, UPDATE_CART, DELETE_ITEM_CART } from "../../shared/constants/action-type";

// const initState = {
//     items:[],
// }
// export default (state=initState, action)=>{
//     switch(action.type){
//         case ADD_TO_CART: return addItem(state, action.payload);
//         case UPDATE_CART: return updateCart(state, action.payload);
//         case DELETE_ITEM_CART: return deleteIemCart(state, action.payload)
//         default: return state;
//     }
// }
// const deleteIemCart=(state, payload)=>{
//     const newItems = state.items.filter((item)=>{
//         return item._id != payload._id;
//     });
//     return {...state, items: newItems}
// }
// const updateCart = (state, payload) =>{
//     const items = state.items;
//     const newItems = items.map((item)=>{
//         if(item._id === payload._id){
//             item.qty = payload.qty;
//         }
//         return item;
//     });
//     return {...state, items: newItems}
// }
// const addItem = (state, payload)=>{
//     const items = state.items;
//     let isProductExists = false;
//     items.map((item)=>{
//         if(item._id === payload._id){
//             item.qty += payload.qty;
//             isProductExists = true;
//         }
//         return item;
//     });
//     const newItems = isProductExists? items: [...items, payload];
//     // localStorage.setItem("cart_items", JSON.stringify(newItems));
//     return {...state, items: newItems}
// }

// Frontend/src/redux-setup/reducers/cart.js
import { ADD_TO_CART, UPDATE_CART, DELETE_ITEM_CART, LOGIN_SUCCESS, LOGOUT } from "../../shared/constants/action-type";

// Lấy giỏ hàng từ localStorage theo userId
const loadCartFromStorage = (userId) => {
    if (!userId) return [];
    try {
        const saved = localStorage.getItem(`cart_${userId}`);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

// Lưu giỏ hàng vào localStorage theo userId
const saveCartToStorage = (userId, items) => {
    if (!userId) return;
    localStorage.setItem(`cart_${userId}`, JSON.stringify(items));
};

// Khi app khởi động, thử load giỏ hàng của user đang đăng nhập (nếu có)
const currentUser = JSON.parse(localStorage.getItem("user"));
const initState = {
    items: loadCartFromStorage(currentUser?._id),
    userId: currentUser?._id || null,
};

export default (state = initState, action) => {
    switch (action.type) {
        case LOGIN_SUCCESS: {
            // Khi đăng nhập: load giỏ hàng của user đó
            const userId = action.payload.user._id;
            const items = loadCartFromStorage(userId);
            return { ...state, items, userId };
        }
        case LOGOUT: {
            // Khi đăng xuất: xóa giỏ hàng khỏi state (không xóa localStorage)
            return { ...state, items: [], userId: null };
        }
        case ADD_TO_CART: {
            const newState = addItem(state, action.payload);
            saveCartToStorage(newState.userId, newState.items);
            return newState;
        }
        case UPDATE_CART: {
            const newState = updateCart(state, action.payload);
            saveCartToStorage(newState.userId, newState.items);
            return newState;
        }
        case DELETE_ITEM_CART: {
            const newState = deleteItemCart(state, action.payload);
            saveCartToStorage(newState.userId, newState.items);
            return newState;
        }
        default:
            return state;
    }
};

const deleteItemCart = (state, payload) => {
    const newItems = state.items.filter((item) => item._id !== payload._id);
    return { ...state, items: newItems };
};

const updateCart = (state, payload) => {
    const newItems = state.items.map((item) => {
        if (item._id === payload._id) {
            return { ...item, qty: payload.qty };
        }
        return item;
    });
    return { ...state, items: newItems };
};

const addItem = (state, payload) => {
    const items = state.items;
    let isProductExists = false;
    const newItems = items.map((item) => {
        if (item._id === payload._id) {
            isProductExists = true;
            return { ...item, qty: item.qty + payload.qty };
        }
        return item;
    });
    return { ...state, items: isProductExists ? newItems : [...items, payload] };
};