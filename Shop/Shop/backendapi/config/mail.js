// Cấu hình email: lấy hoàn toàn từ biến môi trường (MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS).
// Không có tài khoản hay mật khẩu mặc định. Thiếu MAIL_USER/MAIL_PASS thì email bị tắt (enabled = false).
const { buildMailConfig } = require("./env");

module.exports = buildMailConfig(process.env);
