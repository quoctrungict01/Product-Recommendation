import Http from "./Http";
export const getProducts = (config)=>{
    return Http.get("products", config);
}
export const getCategories = (config)=>{
    return Http.get("categories", config);
}
export const getProductsCategory = (id, config)=>{
    return Http.get(`categories/${id}/products`, config);
}
export const getCategory = (id, config)=>{
    return Http.get(`categories/${id}`, config);
}
export const getProduct = (id, config)=>{
    return Http.get(`products/${id}`, config);
}
export const getCommentProduct = (id, config)=>{
    return Http.get(`products/${id}/comments`, config);
}
export const createCommentProduct = (id, data, config)=>{
    return Http.post(`products/${id}/comments`, data, config);
}
export const order = (data, config)=>{
    return Http.post("order", data, config);
}
export const getProductSuggestions = (id, config) => {
    return Http.get(`products/${id}/product-suggestions`, config);
};
// Giai đoạn 3: gợi ý mua kèm bằng Apriori / FP-Growth
// config.params: { algorithm: "apriori" | "fpgrowth", minSupport, minConfidence, limit }
export const getRecommendations = (id, config) => {
    return Http.get(`recommendations/products/${id}`, config);
};
// Auth — THÊM MỚI
export const loginApi = (data) => Http.post("auth/login", data);
export const registerApi = (data) => Http.post("auth/register", data);
// Tài khoản của tôi (Giai đoạn 5 – đợt 2). Backend luôn lấy người dùng từ token, không nhận id từ giao diện.
export const getMe = (config) => Http.get("auth/me", config);
export const updateMe = (data) => Http.put("auth/me", data);
export const changePasswordApi = (data) => Http.put("auth/me/password", data);
export const getMyOrders = (config) => Http.get("order/my", config);
// Mã giảm giá (đợt 5): chỉ xem trước, không trừ lượt. Body { code, items: [{ prd_id, qty }] }.
export const previewCoupon = (data) => Http.post("coupons/preview", data);
