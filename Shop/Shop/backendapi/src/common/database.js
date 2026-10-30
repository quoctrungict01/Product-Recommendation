// Kết nối MongoDB dùng chung cho mọi model.
//
//  - Mỗi file model gọi require("../../common/database")() để lấy mongoose. Hàm này chỉ mở kết nối ở
//    LẦN GỌI ĐẦU; các lần sau dùng lại cùng một promise (trước đây mỗi model gọi mongoose.connect một lần).
//  - Lỗi kết nối được bắt: ghi log ngắn (không in chuỗi kết nối), rồi tự thử lại với thời gian chờ tăng dần
//    (5s, 10s, 20s, tối đa 30s). Backend không bị sập vì unhandled rejection khi MongoDB chưa bật;
//    trong lúc chưa kết nối, API cần dữ liệu trả 503 (xem middlewares/error.js).
//  - autoCreate tắt: khởi động backend không tự tạo collection rỗng trong DB (collection sẽ được tạo khi ghi
//    tài liệu đầu tiên). autoIndex giữ mặc định để index đã khai báo trong schema (vd. users.email) vẫn có.
//  - strictQuery = true: giữ đúng hành vi hiện tại của Mongoose 6 và tắt cảnh báo khi khởi động.
const mongoose = require("mongoose");
const config = require("config");

mongoose.set("strictQuery", true);
mongoose.set("autoCreate", false);

/** Bỏ thông tin đăng nhập nếu thông điệp lỗi lỡ chứa chuỗi kết nối. */
function safeMessage(err) {
    const text = String((err && err.message) || err || "lỗi không rõ");
    return text.replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, "mongodb://***").slice(0, 300);
}

// Lỗi cấu hình (chuỗi kết nối sai): thử lại cũng không khỏi.
const isConfigError = (err) => Boolean(err) && (err.name === "MongoParseError" || (err.name === "MongooseError" && /uri|connection string/i.test(String(err.message))));

/**
 * @param {object} deps tiêm được để test
 * @param {import("mongoose")} [deps.mongoose]
 * @param {() => string} [deps.getUri]
 * @param {(msg: string) => void} [deps.log]
 * @param {(msg: string) => void} [deps.logError]
 * @param {Function} [deps.schedule]  setTimeout
 * @param {number} [deps.baseDelayMs]
 * @param {number} [deps.maxDelayMs]
 */
function createConnector(deps = {}) {
    const m = deps.mongoose || mongoose;
    const getUri = deps.getUri || (() => config.get("db.mongodb.uri"));
    const log = deps.log || ((msg) => console.log(msg));
    const logError = deps.logError || ((msg) => console.error(msg));
    const schedule = deps.schedule || ((fn, ms) => setTimeout(fn, ms).unref());
    const baseDelayMs = deps.baseDelayMs ?? 5000;
    const maxDelayMs = deps.maxDelayMs ?? 30000;

    let started = false;
    let attempts = 0;
    let listening = false;
    const state = { connected: false, lastError: null, gaveUp: false };

    function listen() {
        if (listening || !m.connection || typeof m.connection.on !== "function") return;
        listening = true;
        // Không có listener "error", EventEmitter sẽ ném lỗi và làm sập tiến trình.
        m.connection.on("error", (err) => logError(`MongoDB lỗi: ${safeMessage(err)}`));
        m.connection.on("disconnected", () => {
            if (state.connected) logError("MongoDB đã ngắt kết nối (nếu không phải do tắt backend, driver sẽ tự kết nối lại).");
            state.connected = false;
        });
        m.connection.on("reconnected", () => {
            state.connected = true;
            log("Đã kết nối lại MongoDB.");
        });
    }

    function attempt() {
        attempts += 1;
        let p;
        try {
            p = Promise.resolve(m.connect(getUri()));
        } catch (err) {
            p = Promise.reject(err);
        }
        return p.then(
            () => {
                state.connected = true;
                state.lastError = null;
                log("Connected!");
                return m;
            },
            (err) => {
                state.connected = false;
                state.lastError = safeMessage(err);
                if (isConfigError(err)) {
                    state.gaveUp = true;
                    logError(`Không kết nối được MongoDB (cấu hình DB_URI không hợp lệ): ${state.lastError}`);
                    return null;
                }
                const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempts - 1));
                logError(`Không kết nối được MongoDB (lần ${attempts}): ${state.lastError}. Thử lại sau ${Math.round(delay / 1000)} giây.`);
                schedule(attempt, delay);
                return null;
            }
        );
    }

    /** Mở kết nối nếu chưa mở; trả về mongoose ngay (không chờ kết nối xong). */
    function database() {
        if (!started) {
            started = true;
            listen();
            attempt(); // promise đã có .then(onOk, onError): không bao giờ thành unhandled rejection
        }
        return m;
    }

    database.state = state;
    database.attempts = () => attempts;
    return database;
}

const database = createConnector();
module.exports = database;
module.exports.createConnector = createConnector;
module.exports.safeMessage = safeMessage;
