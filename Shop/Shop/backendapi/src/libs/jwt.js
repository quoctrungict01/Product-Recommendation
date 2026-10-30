// Ký JWT bằng khóa lấy từ biến môi trường JWT_SECRET. Không có khóa mặc định:
// thiếu hoặc khóa yếu thì ném EnvError (backend cũng kiểm tra điều này khi khởi động, xem src/bin/www.js).
const jwt = require("jsonwebtoken");
const { EnvError, jwtSecretProblem } = require("../../config/env");

const TOKEN_TTL = "7d";

function getJwtSecret(env = process.env) {
    const problem = jwtSecretProblem(env.JWT_SECRET);
    if (problem) throw new EnvError([problem]);
    return env.JWT_SECRET;
}

function signAuthToken(user, env = process.env) {
    return jwt.sign({ _id: String(user._id), email: user.email, role: user.role }, getJwtSecret(env), { expiresIn: TOKEN_TTL, algorithm: "HS256" });
}

/**
 * Xác minh token: đúng chữ ký HS256 với JWT_SECRET hiện tại và chưa hết hạn.
 * Ném lỗi của jsonwebtoken (TokenExpiredError / JsonWebTokenError) nếu không hợp lệ.
 * Lưu ý: role trong token chỉ để tham khảo — middleware luôn tra lại user trong DB.
 */
function verifyAuthToken(token, env = process.env) {
    return jwt.verify(token, getJwtSecret(env), { algorithms: ["HS256"] });
}

module.exports = { TOKEN_TTL, getJwtSecret, signAuthToken, verifyAuthToken };
