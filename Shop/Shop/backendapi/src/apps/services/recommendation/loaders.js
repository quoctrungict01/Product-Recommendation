// Hàm đọc dữ liệu cho service gợi ý, dựa trên model Mongoose. CHỈ ĐỌC.
// Truyền model vào (thay vì require ở đầu file) để test có thể dùng model trên kết nối riêng.

function createModelLoaders({ OrderModel, ProductModel }) {
    return {
        // Chỉ lấy prd_id của từng dòng, đủ cho khai phá; .lean() trả về object thuần.
        loadOrders: () => OrderModel.find({}, { "items.prd_id": 1 }).lean().exec(),

        // Dấu vân tay rẻ: số đơn + _id đơn mới nhất. Đổi khi có đơn mới hoặc đơn bị xóa.
        loadFingerprint: async () => {
            const [count, latest] = await Promise.all([
                OrderModel.countDocuments().exec(),
                OrderModel.findOne({}, { _id: 1 }).sort({ _id: -1 }).lean().exec(),
            ]);
            return `${count}:${latest ? String(latest._id) : "-"}`;
        },

        // Đọc mới mỗi request để tình trạng còn hàng luôn đúng (danh mục nhỏ).
        loadProducts: () =>
            ProductModel.find({}, { name: 1, image: 1, price: 1, category_id: 1, is_stock: 1 }).lean().exec(),
    };
}

module.exports = { createModelLoaders };
