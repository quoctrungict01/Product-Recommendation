// Gọi file kết nối tới MongoDB
const mongoose = require("../../common/database")();

// Sử dụng Schema để mô tả collection user
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
    }
}, {timestamps: true});
// Biến User Schema thành Model 
const UserModel = mongoose.model("Users", userSchema, "users");
module.exports = UserModel;