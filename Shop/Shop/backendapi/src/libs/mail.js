// Gửi email qua SMTP (nodemailer). Cấu hình lấy từ config/mail.js (chỉ đọc biến môi trường).
// Transporter được tạo khi cần lần đầu; nếu chưa cấu hình MAIL_USER/MAIL_PASS thì báo lỗi rõ ràng
// thay vì dùng tài khoản mặc định. Hiện chưa có route nào gửi email (code gửi mail trong order.js đang comment).
const nodemailer = require("nodemailer");
const { EnvError } = require("../../config/env");

let cached = null;

function getMailTransporter(mailConfig = require("../../config/mail")) {
    if (!mailConfig.enabled) {
        throw new EnvError(["Email chưa được cấu hình: cần MAIL_USER và MAIL_PASS trong .env (MAIL_HOST, MAIL_PORT tùy chọn)."]);
    }
    if (!cached || cached.config !== mailConfig) {
        cached = {
            config: mailConfig,
            transporter: nodemailer.createTransport({
                host: mailConfig.host,
                port: mailConfig.port,
                secure: mailConfig.port === 465,
                auth: { user: mailConfig.user, pass: mailConfig.pass },
            }),
        };
    }
    return cached.transporter;
}

module.exports = { getMailTransporter };
