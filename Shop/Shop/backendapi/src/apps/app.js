const express= require("express");
const app = express();
const path = require("path");
const config = require("config");
const { apiNotFound, errorHandler } = require("./middlewares/error");
const { createCorsMiddleware } = require("../libs/cors-policy");

const prefix = config.get("app.prefixApiVersion");
// CORS chỉ cho các origin cấu hình (mặc định Shop :3000 và Admin :3001 trên localhost); xem libs/cors-policy.js.
app.use(prefix, createCorsMiddleware().middleware);
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));
app.set("views", config.get("app.viewsFolder"));
app.set("view engine", config.get("app.viewEngine"));
app.use(prefix, require(`${__dirname}/../routers/web`));
// API không tồn tại -> 404 JSON (không rơi xuống trang tĩnh).
app.use(prefix, apiNotFound);
// đường dẫn tới thư mục public:
app.use(express.static(path.join(__dirname, "../public")));
// Lỗi của mọi route (kể cả handler async đã bọc asyncHandler) -> JSON, không stack trace, không làm sập Node.
app.use(errorHandler);

module.exports = app;
