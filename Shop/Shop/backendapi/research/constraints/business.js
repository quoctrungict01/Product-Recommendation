// Ràng buộc nghiệp vụ TrungShop cho M2 (chỉ dùng trong nghiên cứu offline).
//
// Tri thức nghiệp vụ được KHAI BÁO (giáo trình: ràng buộc do người dùng/chuyên gia đặt), không suy từ bộ sinh dữ liệu:
//  - Danh mục điện thoại: iPhone, Samsung, Xiaomi, OPPO, Vivo, Nokia (theo tên danh mục); còn lại là phụ kiện.
//  - Ốp lưng và kính cường lực gắn với DÒNG MÁY ghi trong tên ("Ốp lưng silicon iPhone 15" -> "iPhone 15");
//    chỉ hợp với điện thoại có tên chứa dòng máy đó. Sạc, cáp, tai nghe, pin dự phòng dùng chuẩn chung
//    (USB-C, 3.5 mm, Bluetooth) nên được coi là hợp với mọi máy.
//
// Ràng buộc luật (M2-A, áp dụng cho cặp "sản phẩm đang xem p ⇒ sản phẩm gợi ý q"):
//   A1 metarule: luật dạng {p} ⇒ {q} (một sản phẩm ⇒ một sản phẩm)
//   A2 nếu p là điện thoại thì q là phụ kiện  (metarule điện thoại(X) ⇒ phụ kiện(Y))
//   A3 p và q tương thích (ốp/kính đúng dòng máy)
//   A4 q còn hàng
// Ràng buộc tập mục suy ra (M2-B, anti-monotone nên cắt tỉa được khi khai phá):
//   B1 count(S) ≤ 2                 — từ A1 (luật 1 ⇒ 1 chỉ cần tập ≤ 2 item)
//   B2 count(S ∩ điện thoại) ≤ 1     — từ A2 (cặp hai điện thoại chỉ sinh luật điện thoại ⇒ điện thoại)
//   B3 không có cặp không tương thích — từ A3
// A4 KHÔNG được đẩy thành "S ⊆ còn hàng": sản phẩm đang xem có thể hết hàng mà vẫn cần luật của nó,
// nên A4 chỉ là điều kiện của vế phải, áp dụng khi xếp hạng.

const { countAtMost, countWhereAtMost, noConflictingPair } = require("./constraints");

const PHONE_CATEGORY_NAMES = Object.freeze(["iPhone", "Samsung", "Xiaomi", "OPPO", "Vivo", "Nokia"]);
const MODEL_SPECIFIC = /^(ốp lưng|kính cường lực)\s+(silicon\s+|trong suốt\s+)?/i;

/** Dòng máy của ốp/kính, hoặc null nếu là phụ kiện dùng chung. */
function modelOf(name) {
    const text = String(name || "").trim();
    if (!MODEL_SPECIFIC.test(text)) return null;
    return text.replace(MODEL_SPECIFIC, "").replace(/\s+series$/i, "").trim().toLowerCase();
}

/**
 * @param {{_id: string, name: string, category_id: string, category?: string, is_stock?: boolean}[]} products
 * @param {{phoneCategoryNames?: string[]}} [options]
 */
function buildBusinessRules(products, { phoneCategoryNames = PHONE_CATEGORY_NAMES } = {}) {
    const phoneNames = new Set(phoneCategoryNames.map((x) => x.toLowerCase()));
    const info = new Map();
    for (const p of products) {
        const kind = phoneNames.has(String(p.category || "").toLowerCase()) ? "phone" : "accessory";
        info.set(String(p._id), { id: String(p._id), name: p.name, kind, category_id: String(p.category_id), model: kind === "accessory" ? modelOf(p.name) : null, inStock: p.is_stock !== false });
    }
    const phones = [...info.values()].filter((x) => x.kind === "phone");
    const phoneCategories = new Set(phones.map((x) => x.category_id));
    const get = (id) => {
        const x = info.get(String(id));
        if (!x) throw new Error(`Sản phẩm không có trong danh mục: ${id}`);
        return x;
    };
    const fits = (phone, acc) => acc.model === null || phone.name.toLowerCase().includes(acc.model);

    /** Hai sản phẩm có tương thích không (A3). */
    function compatible(a, b) {
        const x = get(a);
        const y = get(b);
        if (x.kind === "phone" && y.kind === "phone") return true; // do A2/B2 xử lý
        if (x.kind === "phone") return fits(x, y);
        if (y.kind === "phone") return fits(y, x);
        if (x.model === null || y.model === null) return true;
        return phones.some((ph) => fits(ph, x) && fits(ph, y)); // hai ốp/kính cùng hợp ít nhất một máy
    }

    /** Luật p ⇒ q có thỏa A2–A4 không (A1 do cách dùng luật 1 ⇒ 1 đảm bảo). */
    function ruleAllowed(p, q) {
        if (String(p) === String(q)) return false;
        const x = get(p);
        const y = get(q);
        if (!y.inStock) return false; // A4
        if (x.kind === "phone" && y.kind === "phone") return false; // A2
        return compatible(p, q); // A3
    }

    /** Lý do vi phạm (để phân tích mức hợp lý nghiệp vụ của các phương pháp khác). */
    function violation(p, q) {
        const x = get(p);
        const y = get(q);
        if (!y.inStock) return "A4-hết-hàng";
        if (x.kind === "phone" && y.kind === "phone") return "A2-điện-thoại⇒điện-thoại";
        if (!compatible(p, q)) return "A3-không-tương-thích";
        return null;
    }

    /**
     * Ràng buộc tập mục B1–B3 trên các nút khai phá.
     * @param {(node: string) => ({type: "product"|"category", id: string})} resolve ánh xạ nút -> sản phẩm/danh mục
     */
    function itemsetConstraints(resolve = (node) => ({ type: "product", id: node }), { maxSize = 2 } = {}) {
        const isPhoneNode = (node) => {
            const r = resolve(node);
            return r.type === "product" ? get(r.id).kind === "phone" : phoneCategories.has(r.id);
        };
        const conflict = (a, b) => {
            const ra = resolve(a);
            const rb = resolve(b);
            if (ra.type === "product" && rb.type === "product") return !compatible(ra.id, rb.id);
            // ốp/kính với một danh mục điện thoại: xung đột nếu không máy nào trong danh mục hợp với nó
            const [prod, cat] = ra.type === "product" ? [ra, rb] : rb.type === "product" ? [rb, ra] : [null, null];
            if (!prod || !phoneCategories.has(cat.id)) return false;
            const acc = get(prod.id);
            if (acc.kind !== "accessory" || acc.model === null) return false;
            return !phones.some((ph) => ph.category_id === cat.id && fits(ph, acc));
        };
        return [
            countAtMost(maxSize, `B1 count(S) ≤ ${maxSize}`),
            countWhereAtMost(isPhoneNode, 1, "B2 count(S ∩ điện thoại) ≤ 1"),
            noConflictingPair(conflict, "B3 không có cặp không tương thích"),
        ];
    }

    return { info, get, compatible, ruleAllowed, violation, itemsetConstraints, phoneCategories };
}

const RULE_CONSTRAINTS = Object.freeze([
    { id: "A1", text: "metarule {p} ⇒ {q}: một sản phẩm ⇒ một sản phẩm", kind: "ràng buộc cú pháp (metarule)" },
    { id: "A2", text: "điện thoại(p) ⇒ phụ kiện(q): không gợi ý điện thoại khi đang xem điện thoại", kind: "ràng buộc luật" },
    { id: "A3", text: "p, q tương thích: ốp lưng/kính cường lực đúng dòng máy", kind: "ràng buộc luật" },
    { id: "A4", text: "q còn hàng", kind: "ràng buộc dữ liệu (chỉ vế phải)" },
]);

module.exports = { PHONE_CATEGORY_NAMES, RULE_CONSTRAINTS, modelOf, buildBusinessRules };
