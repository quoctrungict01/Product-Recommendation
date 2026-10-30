import { decodeTokenPayload, isTokenExpired, loadStoredSession } from "./authToken";

const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = (payload) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.chu-ky`;

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => (data[k] = String(v)),
        removeItem: (k) => delete data[k],
    };
}

test("đọc payload và hạn dùng của token", () => {
    const now = Date.now();
    expect(decodeTokenPayload(token({ _id: "u1", exp: 10 }))._id).toBe("u1");
    expect(decodeTokenPayload("rác")).toBeNull();
    expect(isTokenExpired(token({ exp: Math.floor(now / 1000) + 3600 }), now)).toBe(false);
    expect(isTokenExpired(token({ exp: Math.floor(now / 1000) - 1 }), now)).toBe(true);
    expect(isTokenExpired(token({}), now)).toBe(true);
});

test("phiên hết hạn hoặc hỏng bị xóa khỏi bộ nhớ khi tải trang", () => {
    const now = Date.now();
    const valid = token({ _id: "u1", exp: Math.floor(now / 1000) + 3600 });
    const ok = memoryStorage({ token: valid, user: JSON.stringify({ email: "a@b.vn" }) });
    expect(loadStoredSession(ok, now)).toEqual({ token: valid, user: { email: "a@b.vn" } });

    const expired = memoryStorage({ token: token({ exp: Math.floor(now / 1000) - 5 }), user: JSON.stringify({ email: "a@b.vn" }) });
    expect(loadStoredSession(expired, now)).toEqual({ token: null, user: null });
    expect(expired.data).toEqual({});

    const broken = memoryStorage({ token: valid, user: "{hỏng" });
    expect(loadStoredSession(broken, now).token).toBeNull();
});
