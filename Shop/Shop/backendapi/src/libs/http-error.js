// Lỗi HTTP có mã trạng thái rõ ràng. Controller ném HttpError, middleware xử lý lỗi (middlewares/error.js)
// chuyển thành JSON { status: "error", code, message } — không bao giờ kèm stack trace.

class HttpError extends Error {
    constructor(status, message, code = undefined, details = undefined) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

const badRequest = (message, details) => new HttpError(400, message, "BAD_REQUEST", details);
const unauthorized = (message = "Bạn cần đăng nhập.", code = "UNAUTHENTICATED") => new HttpError(401, message, code);
const forbidden = (message = "Bạn không có quyền thực hiện thao tác này.") => new HttpError(403, message, "FORBIDDEN");
const notFound = (message = "Không tìm thấy dữ liệu.") => new HttpError(404, message, "NOT_FOUND");
const conflict = (message) => new HttpError(409, message, "CONFLICT");

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
