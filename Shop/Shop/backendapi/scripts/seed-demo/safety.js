// Kiểm tra an toàn trước khi seed: chỉ cho phép MongoDB chạy trên máy này
// và đúng database demo đã khai báo. Không bao giờ in ra username/password.

const crypto = require("crypto");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_DEMO_DB = "GR2";
const SEED_BATCH = "trungshop-demo-v1";

class SeedSafetyError extends Error {
    constructor(reasons) {
        super(`Từ chối seed:\n - ${reasons.join("\n - ")}`);
        this.name = "SeedSafetyError";
        this.reasons = reasons;
    }
}

/**
 * Tách chuỗi kết nối MongoDB, hỗ trợ cả dạng nhiều host (replica set).
 * Trả về { scheme, hosts: [{host, port}], dbName, hasCredentials }.
 */
function parseMongoUri(uri) {
    if (typeof uri !== "string" || uri.trim() === "") {
        throw new SeedSafetyError(["DB_URI trống hoặc không phải chuỗi."]);
    }
    const match = uri.trim().match(/^(mongodb(?:\+srv)?):\/\/(?:([^@/]*)@)?([^/?#]+)(?:\/([^?#]*))?(?:\?([^#]*))?$/i);
    if (!match) throw new SeedSafetyError(["DB_URI không đúng định dạng mongodb://host:port/database."]);

    const [, scheme, credentials, hostList, path = ""] = match;
    const hosts = hostList.split(",").map((entry) => {
        const ipv6 = entry.match(/^\[([^\]]+)\](?::(\d+))?$/);
        if (ipv6) return { host: ipv6[1].toLowerCase(), port: ipv6[2] ? Number(ipv6[2]) : 27017 };
        const [host, port] = entry.split(":");
        return { host: host.toLowerCase(), port: port ? Number(port) : 27017 };
    });

    return {
        scheme: scheme.toLowerCase(),
        hosts,
        dbName: decodeURIComponent(path.split("/")[0] || ""),
        hasCredentials: Boolean(credentials),
    };
}

/**
 * Ném SeedSafetyError nếu đích ghi không phải database demo trên localhost.
 * @param {string} uri chuỗi kết nối (lấy từ cùng cấu hình mà backend dùng)
 * @param {{expectedDb?: string, nodeEnv?: string}} options
 */
function assertSafeDemoTarget(uri, options = {}) {
    const { expectedDb = DEFAULT_DEMO_DB, nodeEnv = process.env.NODE_ENV } = options;
    const parsed = parseMongoUri(uri);
    const reasons = [];

    if (parsed.scheme === "mongodb+srv") {
        reasons.push("mongodb+srv luôn trỏ tới cụm từ xa (ví dụ Atlas), không phải localhost.");
    }
    const remote = parsed.hosts.filter(({ host }) => !LOCAL_HOSTS.has(host));
    if (remote.length > 0) {
        reasons.push(`Host không phải localhost: ${remote.map((h) => h.host).join(", ")}.`);
    }
    if (!parsed.dbName) {
        reasons.push("DB_URI không ghi tên database (MongoDB sẽ dùng 'test').");
    } else if (parsed.dbName !== expectedDb) {
        reasons.push(`Database '${parsed.dbName}' khác database demo được phép '${expectedDb}'.`);
    }
    if (nodeEnv === "production") {
        reasons.push("NODE_ENV=production.");
    }

    if (reasons.length > 0) throw new SeedSafetyError(reasons);
    return parsed;
}

/** Mô tả đích kết nối mà không lộ thông tin đăng nhập. */
function describeTarget(parsed) {
    const hosts = parsed.hosts.map(({ host, port }) => `${host}:${port}`).join(",");
    return `${parsed.scheme}://${parsed.hasCredentials ? "***@" : ""}${hosts}/${parsed.dbName}`;
}

/**
 * ObjectId cố định sinh từ khóa: chạy lại script luôn ra cùng _id,
 * nhờ đó upsert theo _id không bao giờ tạo bản ghi trùng.
 */
function demoObjectIdHex(kind, key) {
    return crypto.createHash("sha1").update(`${SEED_BATCH}:${kind}:${key}`).digest("hex").slice(0, 24);
}

module.exports = {
    LOCAL_HOSTS,
    DEFAULT_DEMO_DB,
    SEED_BATCH,
    SeedSafetyError,
    parseMongoUri,
    assertSafeDemoTarget,
    describeTarget,
    demoObjectIdHex,
};
