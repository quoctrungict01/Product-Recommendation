// Kiểm tra biến môi trường của backend. Thông báo lỗi chỉ nêu TÊN biến, không bao giờ in giá trị.
//
// Bắt buộc để khởi động:
//   DB_URI      chuỗi kết nối MongoDB
//   JWT_SECRET  khóa ký JWT, tối thiểu 32 ký tự, không phải giá trị mẫu trong .env.example
// Tùy chọn (chức năng email):
//   MAIL_USER + MAIL_PASS phải có đủ cả hai hoặc bỏ trống cả hai; MAIL_HOST, MAIL_PORT có mặc định.

const JWT_SECRET_MIN_LENGTH = 32;
// Giá trị mẫu trong .env.example: phải được thay trước khi chạy.
const PLACEHOLDER = /^(change[-_ ]?me|replace[-_ ]?with|your[-_ ]|<.*>$|xxx+$|example|placeholder)/i;

class EnvError extends Error {
    constructor(problems) {
        super(
            "Cấu hình môi trường không hợp lệ:\n" +
                problems.map((p) => ` - ${p}`).join("\n") +
                "\nXem Shop/Shop/backendapi/.env.example để biết các biến cần khai báo trong .env."
        );
        this.name = "EnvError";
        this.problems = problems;
    }
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

/** Lỗi của JWT_SECRET (nếu có), không chứa giá trị. */
function jwtSecretProblem(value) {
    if (isBlank(value)) return "Thiếu JWT_SECRET (khóa ký JWT).";
    if (PLACEHOLDER.test(String(value).trim())) return "JWT_SECRET vẫn là giá trị mẫu, hãy tạo khóa ngẫu nhiên.";
    if (String(value).length < JWT_SECRET_MIN_LENGTH) return `JWT_SECRET phải dài ít nhất ${JWT_SECRET_MIN_LENGTH} ký tự.`;
    return null;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{errors: string[], warnings: string[]}}
 */
function validateEnv(env = process.env) {
    const errors = [];
    const warnings = [];

    if (isBlank(env.DB_URI)) errors.push("Thiếu DB_URI (chuỗi kết nối MongoDB).");
    const jwt = jwtSecretProblem(env.JWT_SECRET);
    if (jwt) errors.push(jwt);

    const hasUser = !isBlank(env.MAIL_USER);
    const hasPass = !isBlank(env.MAIL_PASS);
    if (hasUser !== hasPass) {
        errors.push(`Cấu hình email chưa đủ: có ${hasUser ? "MAIL_USER" : "MAIL_PASS"} nhưng thiếu ${hasUser ? "MAIL_PASS" : "MAIL_USER"}.`);
    } else if (!hasUser) {
        warnings.push("MAIL_USER/MAIL_PASS trống: chức năng gửi email bị tắt.");
    }
    if (!isBlank(env.MAIL_PORT) && !(Number.isInteger(Number(env.MAIL_PORT)) && Number(env.MAIL_PORT) > 0)) {
        errors.push("MAIL_PORT phải là số nguyên dương.");
    }
    return { errors, warnings };
}

/** Ném EnvError nếu thiếu biến bắt buộc; trả về danh sách cảnh báo. */
function assertEnv(env = process.env) {
    const { errors, warnings } = validateEnv(env);
    if (errors.length) throw new EnvError(errors);
    return warnings;
}

/** Cấu hình email lấy hoàn toàn từ biến môi trường; không có tài khoản hay mật khẩu mặc định. */
function buildMailConfig(env = process.env) {
    const user = isBlank(env.MAIL_USER) ? null : env.MAIL_USER.trim();
    const pass = isBlank(env.MAIL_PASS) ? null : env.MAIL_PASS;
    return {
        host: isBlank(env.MAIL_HOST) ? "smtp.gmail.com" : env.MAIL_HOST.trim(),
        port: isBlank(env.MAIL_PORT) ? 587 : Number(env.MAIL_PORT),
        user,
        pass,
        enabled: Boolean(user && pass),
    };
}

module.exports = { JWT_SECRET_MIN_LENGTH, EnvError, jwtSecretProblem, validateEnv, assertEnv, buildMailConfig };
