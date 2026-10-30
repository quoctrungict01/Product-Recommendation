// Danh mục địa giới hành chính Việt Nam (sau sắp xếp 2025: tỉnh/thành – phường/xã) lấy từ API công khai,
// KHÔNG cần API key và KHÔNG hardcode danh sách trong mã nguồn.
// Mặc định: https://provinces.open-api.vn/api/v2 — đổi bằng biến môi trường REACT_APP_ADDRESS_API khi build.
// Dùng fetch trực tiếp (không qua axios Http) để KHÔNG gửi token đăng nhập sang dịch vụ bên ngoài.
// API lỗi/chậm -> ném lỗi để giao diện chuyển sang nhập địa chỉ thủ công.

export const ADDRESS_API_BASE = (process.env.REACT_APP_ADDRESS_API || "https://provinces.open-api.vn/api/v2").replace(/\/+$/, "");
const TIMEOUT_MS = 8000;
const cache = new Map();

async function getJson(path, fetchImpl) {
    const url = `${ADDRESS_API_BASE}${path}`;
    if (cache.has(url)) return cache.get(url);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
        const res = await fetchImpl(url, { signal: controller ? controller.signal : undefined, credentials: "omit" });
        if (!res.ok) throw new Error(`Address API ${res.status}`);
        const data = await res.json();
        cache.set(url, data);
        return data;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

const toOptions = (list) =>
    (Array.isArray(list) ? list : [])
        .filter((x) => x && typeof x.name === "string" && Number.isInteger(Number(x.code)))
        .map((x) => ({ code: Number(x.code), name: x.name }));

export async function fetchProvinces(fetchImpl = fetch) {
    const options = toOptions(await getJson("/p/", fetchImpl));
    if (options.length === 0) throw new Error("Address API trả danh sách rỗng");
    return options;
}

export async function fetchWards(provinceCode, fetchImpl = fetch) {
    const code = Number(provinceCode);
    if (!Number.isInteger(code) || code <= 0) return [];
    const data = await getJson(`/p/${code}?depth=2`, fetchImpl);
    return toOptions(data && data.wards);
}

export const clearAddressCache = () => cache.clear();
