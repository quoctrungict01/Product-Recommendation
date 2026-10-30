// Nạp .env và kiểm tra biến môi trường TRƯỚC khi nạp app (app nạp model và kết nối MongoDB ngay).
require("dotenv").config();
const { assertEnv, EnvError } = require("../../config/env");

try {
    for (const warning of assertEnv(process.env)) console.warn(`Cảnh báo: ${warning}`);
} catch (err) {
    if (err instanceof EnvError) {
        console.error(err.message);
        process.exit(1);
    }
    throw err;
}

const app = require("../apps/app");
const config = require("config");

const port = config.get("app.port");
app.listen(port, () => {
    console.log(`server running on port ${port}`);
    console.log(`CORS cho phép: ${require("../libs/cors-policy").parseAllowedOrigins(process.env.CORS_ORIGINS).join(", ")}`);
});
