// Địa chỉ giao hàng có cấu trúc, dùng chung cho User.address và Order.shipping_address.
// Theo địa giới 2 cấp (tỉnh/thành – phường/xã). district chỉ là tùy chọn để giữ địa chỉ cũ còn quận/huyện.
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
    {
        province: { type: String, required: true, trim: true, maxlength: 100 },
        province_code: { type: Number, default: null },
        district: { type: String, default: null, trim: true, maxlength: 100 },
        ward: { type: String, required: true, trim: true, maxlength: 100 },
        ward_code: { type: Number, default: null },
        detail: { type: String, required: true, trim: true, maxlength: 200 },
    },
    { _id: false }
);

module.exports = addressSchema;
