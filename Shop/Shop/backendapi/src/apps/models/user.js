// Gọi file kết nối tới MongoDB
const mongoose = require("../../common/database")();
const addressSchema = require("./address");

// Sử dụng Schema để mô tả collection user.
// phone, address, password_changed_at là trường TÙY CHỌN (Giai đoạn 5 – đợt 2): tài liệu cũ không có vẫn hợp lệ.
const userSchema = mongoose.Schema({
    full_name: {
        type: String,
        default: null
    },
    email: {
        type: String,
        unique: true
    },
    password: {
        type: String,
        default: null
    },
    role: {
        type: String,
        enum: ["member", "admin"],
        default: "member"
    },
    phone: {
        type: String,
        default: null
    },
    // Địa chỉ giao hàng mặc định.
    address: {
        type: addressSchema,
        default: null
    },
    // Thời điểm đổi mật khẩu gần nhất: token phát hành trước thời điểm này bị từ chối.
    password_changed_at: {
        type: Date,
        default: null
    }
}, {timestamps: true});
// Biến User Schema thành Model 
const UserModel = mongoose.model("Users", userSchema, "users");
module.exports = UserModel;
