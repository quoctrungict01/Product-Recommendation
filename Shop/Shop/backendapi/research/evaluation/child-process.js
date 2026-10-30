// Chạy một công việc trong tiến trình con riêng, có giới hạn heap và thời gian (dùng cho các script nghiên cứu).
// Tiến trình con nhận `job` qua IPC và gửi lại {type: "progress", msg} | {type: "result", ...} | {type: "error", message}.

const { fork } = require("child_process");

/**
 * @param {string} script đường dẫn script; script phải gọi serveChild(handler) khi có cờ --child
 * @param {object} job
 * @param {{timeoutSec: number, maxMemoryMb: number, execArgv?: string[]}} limits
 * @param {(msg: string) => void} [log]
 * @returns {Promise<object>} kết quả, hoặc {error}
 */
function runInChild(script, job, { timeoutSec, maxMemoryMb, execArgv = [] }, log = () => {}) {
    return new Promise((resolve) => {
        const child = fork(script, ["--child"], { execArgv: [...execArgv, `--max-old-space-size=${maxMemoryMb}`], stdio: ["ignore", "inherit", "inherit", "ipc"] });
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.kill();
            resolve(value);
        };
        const timer = setTimeout(() => done({ error: `quá thời gian ${timeoutSec} s (đã dừng tiến trình)` }), timeoutSec * 1000);
        child.on("message", (msg) => {
            if (msg.type === "progress") log(msg.msg);
            else if (msg.type === "result") done(msg);
            else if (msg.type === "error") done({ error: msg.message });
        });
        child.once("exit", (code, signal) => done({ error: `tiến trình con kết thúc bất thường (mã ${code}${signal ? `, ${signal}` : ""}) — có thể vượt giới hạn bộ nhớ ${maxMemoryMb} MB` }));
        child.send(job);
    });
}

/** Phía tiến trình con: nhận một job, chạy handler(job, progress), gửi kết quả. */
function serveChild(handler) {
    process.once("message", async (job) => {
        try {
            const result = await handler(job, (msg) => process.send({ type: "progress", msg }));
            process.send({ type: "result", ...result });
        } catch (err) {
            process.send({ type: "error", message: err.message || String(err) });
        }
    });
}

module.exports = { runInChild, serveChild };
