// Xử lý lỗi tập trung cho API: luôn trả JSON { status: "error", code, message }.
// Không bao giờ trả stack trace, câu lệnh truy vấn hay giá trị cấu hình/secret cho client;
// chi tiết lỗi 500 chỉ ghi ở log server (tên lỗi + thông điệp).

const { HttpError } = require("../../libs/http-error");

// MongoDB chưa bật / mất kết nối: truy vấn chờ quá hạn hoặc không chọn được server.
const DB_DOWN_NAMES = new Set(["MongooseServerSelectionError", "MongoServerSelectionError", "MongoNetworkError", "MongoNetworkTimeoutError", "MongoNotConnectedError", "MongoTopologyClosedError"]);
const isDbUnavailable = (err) => Boolean(err) && (DB_DOWN_NAMES.has(err.name) || (err.name === "MongooseError" && /buffering timed out|before initial connection|Client must be connected/i.test(String(err.message))));

function apiNotFound(req, res) {
    res.status(404).json({ status: "error", code: "NOT_FOUND", message: "API không tồn tại." });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    let status = 500;
    let body = { status: "error", code: "SERVER_ERROR", message: "Lỗi server." };

    if (err instanceof HttpError) {
        status = err.status;
        body = { status: "error", code: err.code, message: err.message };
        if (err.details) body.details = err.details;
    } else if (err && err.type === "entity.parse.failed") {
        status = 400;
        body = { status: "error", code: "BAD_JSON", message: "Dữ liệu gửi lên không phải JSON hợp lệ." };
    } else if (err && err.type === "entity.too.large") {
        status = 413;
        body = { status: "error", code: "TOO_LARGE", message: "Dữ liệu gửi lên quá lớn." };
    } else if (err && (err.name === "CastError" || err.name === "BSONTypeError" || err.name === "BSONError")) {
        status = 400;
        body = { status: "error", code: "BAD_REQUEST", message: "Mã định danh hoặc dữ liệu không hợp lệ." };
    } else if (err && err.name === "ValidationError") {
        status = 400;
        body = { status: "error", code: "VALIDATION_ERROR", message: "Dữ liệu không hợp lệ.", details: Object.keys(err.errors || {}) };
    } else if (isDbUnavailable(err)) {
        status = 503;
        body = { status: "error", code: "DB_UNAVAILABLE", message: "Hệ thống tạm thời không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau." };
    } else if (err && err.code === 11000) {
        status = 409;
        body = { status: "error", code: "CONFLICT", message: "Dữ liệu bị trùng." };
    }

    if (status >= 500) console.error(`[API] ${req.method} ${req.originalUrl}: ${err && err.name}: ${err && err.message}`);
    res.status(status).json(body);
}

module.exports = { apiNotFound, errorHandler, isDbUnavailable };
