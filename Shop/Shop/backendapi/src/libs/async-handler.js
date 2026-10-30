// Express 4 không bắt lỗi của handler async: promise bị reject sẽ thành "unhandled rejection" và
// Node.js (>= 15) THOÁT tiến trình. Bọc mọi handler async bằng asyncHandler để lỗi được chuyển cho
// middleware xử lý lỗi thay vì làm sập server.

function asyncHandler(fn) {
    if (typeof fn !== "function") throw new TypeError("asyncHandler cần một hàm.");
    return function wrapped(req, res, next) {
        try {
            return Promise.resolve(fn(req, res, next)).catch(next);
        } catch (err) {
            return next(err);
        }
    };
}

module.exports = { asyncHandler };
