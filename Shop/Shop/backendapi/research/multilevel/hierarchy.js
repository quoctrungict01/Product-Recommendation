// Hệ phân cấp khái niệm (concept hierarchy) cho luật kết hợp đa mức — mục 7.2.1, Hình 7.2.
//
// Cấp 0 là gốc "all" (mức tổng quát nhất). Gốc KHÔNG phải một item: mọi giao dịch đều chứa nó,
// nên mọi luật chứa nó đều vô nghĩa. Cấp 1, 2, ... là các nút cụ thể dần.
//
// TrungShop: dữ liệu chỉ có HAI cấp thật — Category {name} (không có danh mục cha) và Product {category_id}.
// Vì vậy hệ phân cấp dùng trong thí nghiệm là:   all → danh mục (cấp 1, 10 nút) → sản phẩm (cấp 2, 41/48 nút).
// Không thêm cấp "Điện thoại / Phụ kiện" vì cấp đó không có trong cơ sở dữ liệu.
//
// Mỗi nút có định danh riêng có tiền tố theo loại ("C:" danh mục, "P:" sản phẩm), nên một danh mục và
// một sản phẩm có cùng _id vẫn là hai nút khác nhau khi khai phá.

const ROOT_ID = "all";
const NODE_PREFIX = Object.freeze({ category: "C:", product: "P:" });

/**
 * Tạo hệ phân cấp tổng quát (độ sâu bất kỳ) từ danh sách nút.
 * @param {{id: string, parent?: string|null, label?: string, kind?: string}[]} entries  parent = null nghĩa là con của gốc
 */
function createHierarchy(entries) {
    if (!Array.isArray(entries) || entries.length === 0) throw new TypeError("Hệ phân cấp cần ít nhất một nút.");
    const nodes = new Map();
    for (const e of entries) {
        if (!e || typeof e.id !== "string" || e.id === "") throw new TypeError("Mỗi nút cần id là chuỗi khác rỗng.");
        if (e.id === ROOT_ID) throw new Error(`"${ROOT_ID}" là tên dành cho nút gốc (cấp 0).`);
        if (nodes.has(e.id)) throw new Error(`Hai nút trùng định danh: ${e.id}`);
        const parent = e.parent === undefined || e.parent === ROOT_ID ? null : e.parent;
        nodes.set(e.id, { id: e.id, parent, label: e.label ?? e.id, kind: e.kind ?? null, children: [] });
    }
    for (const n of nodes.values()) {
        if (n.parent === null) continue;
        const p = nodes.get(n.parent);
        if (!p) throw new Error(`Nút ${n.id} có nút cha không tồn tại: ${n.parent}`);
        p.children.push(n.id);
    }
    // Tổ tiên (gần nhất trước, không gồm gốc) và cấp; phát hiện chu trình.
    const ancestors = new Map();
    const resolve = (id, visiting) => {
        if (ancestors.has(id)) return ancestors.get(id);
        if (visiting.has(id)) throw new Error(`Hệ phân cấp có chu trình tại nút ${id}`);
        visiting.add(id);
        const { parent } = nodes.get(id);
        const list = parent === null ? [] : [parent, ...resolve(parent, visiting)];
        visiting.delete(id);
        ancestors.set(id, Object.freeze(list));
        return list;
    };
    for (const id of nodes.keys()) resolve(id, new Set());
    for (const n of nodes.values()) n.children.sort();

    const level = (id) => ancestors.get(id).length + 1;
    const assertNode = (id) => {
        if (!nodes.has(id)) throw new Error(`Item không có trong hệ phân cấp: ${id}`);
    };
    return Object.freeze({
        size: nodes.size,
        depth: Math.max(...[...nodes.keys()].map(level)),
        has: (id) => nodes.has(id),
        node: (id) => (assertNode(id), nodes.get(id)),
        ids: () => [...nodes.keys()].sort(),
        levelOf: (id) => (assertNode(id), level(id)),
        parentOf: (id) => (assertNode(id), nodes.get(id).parent),
        ancestorsOf: (id) => (assertNode(id), ancestors.get(id)),
        childrenOf: (id) => (assertNode(id), nodes.get(id).children),
        isLeaf: (id) => (assertNode(id), nodes.get(id).children.length === 0),
        /** a là tổ tiên (thực sự) của d? */
        isAncestor: (a, d) => (assertNode(d), ancestors.get(d).includes(a)),
        /** Các nút lá thuộc cây con của id. */
        leavesUnder(id) {
            assertNode(id);
            const out = [];
            const stack = [id];
            while (stack.length) {
                const x = stack.pop();
                const kids = nodes.get(x).children;
                if (kids.length === 0) out.push(x);
                else stack.push(...kids);
            }
            return out.sort();
        },
    });
}

const categoryNode = (categoryId) => `${NODE_PREFIX.category}${categoryId}`;
const productNode = (productId) => `${NODE_PREFIX.product}${productId}`;
const isProductNode = (id) => id.startsWith(NODE_PREFIX.product);
const isCategoryNode = (id) => id.startsWith(NODE_PREFIX.category);
const productIdOf = (node) => (isProductNode(node) ? node.slice(NODE_PREFIX.product.length) : null);

/**
 * Hệ phân cấp 2 cấp của TrungShop từ danh mục sản phẩm: all → Category → Product.
 * @param {{_id: string, category_id: string, category?: string, name?: string}[]} products
 */
function hierarchyFromCatalog(products) {
    const entries = [];
    const categories = new Map();
    const seenProducts = new Set();
    for (const p of products) {
        const id = String(p._id);
        if (seenProducts.has(id)) throw new Error(`Sản phẩm trùng _id: ${id}`);
        seenProducts.add(id);
        if (!p.category_id) throw new Error(`Sản phẩm ${id} không có category_id — không xác định được nút cha.`);
        const c = String(p.category_id);
        if (!categories.has(c)) categories.set(c, p.category || c);
    }
    for (const [c, name] of [...categories].sort()) entries.push({ id: categoryNode(c), parent: null, label: name, kind: "category" });
    for (const p of products) entries.push({ id: productNode(String(p._id)), parent: categoryNode(String(p.category_id)), label: p.name || String(p._id), kind: "product" });
    const hierarchy = createHierarchy(entries);
    return {
        hierarchy,
        toNode: (productId) => productNode(String(productId)),
        categoryNodes: [...categories.keys()].sort().map(categoryNode),
        productNodes: [...seenProducts].sort().map(productNode),
    };
}

/**
 * Giao dịch mở rộng: mỗi item được thêm toàn bộ tổ tiên (trừ gốc), mỗi nút xuất hiện một lần.
 * Đếm support trên giao dịch mở rộng = đếm support ở mọi cấp cùng lúc (cách tiếp cận của Srikant & Agrawal,
 * tương đương việc "tích lũy số đếm ở từng cấp khái niệm" trong mục 7.2.1).
 */
function extendTransactions(transactions, hierarchy, toNode = (x) => x) {
    return transactions.map((t) => {
        const out = new Set();
        for (const item of t) {
            const node = toNode(item);
            if (!hierarchy.has(node)) throw new Error(`Item không có trong hệ phân cấp: ${item}`);
            out.add(node);
            for (const a of hierarchy.ancestorsOf(node)) out.add(a);
        }
        return [...out].sort();
    });
}

/**
 * Khái quát hóa giao dịch lên một cấp: thay mỗi item bằng tổ tiên ở cấp `level` (giữ nguyên nếu item nông hơn).
 * Dùng cho cách tiếp cận "từng cấp, từ trên xuống" của giáo trình.
 */
function generalizeTransactions(transactions, hierarchy, level, toNode = (x) => x) {
    return transactions.map((t) => {
        const out = new Set();
        for (const item of t) {
            const node = toNode(item);
            const lv = hierarchy.levelOf(node);
            if (lv <= level) out.add(node);
            else out.add(hierarchy.ancestorsOf(node)[lv - level - 1]);
        }
        return [...out].sort();
    });
}

/** Itemset có chứa đồng thời một item và tổ tiên của nó không (vd. {iPhone 15, iPhone})? */
function containsAncestorPair(items, hierarchy) {
    const set = new Set(items);
    for (const x of items) for (const a of hierarchy.ancestorsOf(x)) if (set.has(a)) return true;
    return false;
}

module.exports = {
    ROOT_ID,
    NODE_PREFIX,
    createHierarchy,
    hierarchyFromCatalog,
    categoryNode,
    productNode,
    isProductNode,
    isCategoryNode,
    productIdOf,
    extendTransactions,
    generalizeTransactions,
    containsAncestorPair,
};
