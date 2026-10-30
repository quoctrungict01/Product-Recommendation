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
export const getUsers = (config)=>{
    return Http.get("users", config);
}
export const addProduct = (data, config) => {
    return Http.post("products/create", data, config);
}
export const addCategory = (data, config) =>{
    return Http.post("categories/create", data, config);
}
export const getOrders = (config) => {
    return Http.get("order/getAll", config);
};
// Xác thực Admin
export const loginApi = (data) => Http.post("auth/login", data);
export const getMe = (config) => Http.get("auth/me", config);

// ---- Quản trị (Giai đoạn 5 – đợt 4). Backend kiểm tra quyền admin ở từng API; dữ liệu gửi dạng JSON.
export const updateProduct = (id, data) => Http.put(`products/${id}/update`, data);
export const deleteProduct = (id) => Http.delete(`products/${id}/delete`);
// multipart/form-data, trường "image" -> { data: { image: "<tên file>" } }
export const uploadProductImage = (file) => {
    const form = new FormData();
    form.append("image", file);
    return Http.post("products/upload-image", form);
};
export const updateCategory = (id, data) => Http.put(`categories/update/${id}`, data);
export const deleteCategory = (id) => Http.delete(`categories/delete/${id}`);
export const getAdminOrders = (config) => Http.get("order/admin", config);
export const getAdminOrder = (id) => Http.get(`order/admin/${id}`);
export const updateOrderStatus = (id, status) => Http.patch(`order/admin/${id}/status`, { status });

// ---- Mã giảm giá & thống kê (đợt 5) — chỉ admin.
export const getCoupons = (config) => Http.get("coupons/admin", config);
export const getCoupon = (id) => Http.get(`coupons/admin/${id}`);
export const createCoupon = (data) => Http.post("coupons/admin", data);
export const updateCoupon = (id, data) => Http.put(`coupons/admin/${id}`, data);
export const setCouponActive = (id, isActive) => Http.patch(`coupons/admin/${id}/status`, { is_active: isActive });
export const getStatsSummary = () => Http.get("stats/summary");
export const getStatsRevenue = (config) => Http.get("stats/revenue", config);
export const getTopProducts = (config) => Http.get("stats/top-products", config);

// ---- Bình luận & thành viên (đợt 6B) — chỉ admin.
export const getAdminComments = (config) => Http.get("comments/admin", config);
export const deleteAdminComment = (id) => Http.delete(`comments/admin/${id}`);
export const getUser = (id) => Http.get(`users/${id}`);
export const createUser = (data) => Http.post("users/create", data);
export const updateUser = (id, data) => Http.put(`users/update/${id}`, data);
export const deleteUser = (id) => Http.delete(`users/delete/${id}`);
