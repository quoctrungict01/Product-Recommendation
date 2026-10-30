// Ràng buộc mẫu (pattern constraints) — mục 7.3.2, Bảng 7.2.
//
// Mỗi ràng buộc khai báo rõ tính chất toán học của nó:
//   anti-monotone : S vi phạm  => mọi tập cha của S vi phạm   -> CẮT TỈA được trong lúc khai phá
//   monotone      : S thỏa     => mọi tập cha của S thỏa       -> không cắt tỉa được không gian mẫu
//   convertible   : chỉ (anti)monotone khi sắp xếp item theo một thứ tự riêng (vd. avg)
//   inconvertible : không thuộc loại nào ở trên
// và cờ succinct: liệt kê được chính xác các tập thỏa mãn trước khi đếm support
// (với dạng S ⊆ V: chỉ cần bỏ item ngoài V khỏi dữ liệu — "precounting prunable").
//
// Chỉ ràng buộc anti-monotone được đẩy vào bên trong Apriori/FP-Growth (miners.js).
// Mọi loại khác chỉ được áp dụng SAU khi khai phá và được gọi đúng tên là "hậu lọc".

const KINDS = ["anti-monotone", "monotone", "convertible", "inconvertible"];

function makeConstraint({ name, kind, succinct = false, test, allowedItem = null, describe = name }) {
    if (!KINDS.includes(kind)) throw new RangeError(`Loại ràng buộc không hợp lệ: ${kind}`);
    if (typeof test !== "function") throw new TypeError("Ràng buộc cần hàm test(items).");
    if (allowedItem && !(kind === "anti-monotone" && succinct)) throw new Error("allowedItem chỉ dành cho ràng buộc succinct anti-monotone dạng S ⊆ V.");
    return Object.freeze({ name, kind, succinct, test, allowedItem, describe, pushable: kind === "anti-monotone" });
}

const valuesOf = (items, attr) => items.map((x) => attr(x));
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

// ---------------------------------------------------------------- các dạng trong Bảng 7.2

/** S ⊆ V — anti-monotone, succinct. */
function subsetOf(allowed, name = "S ⊆ V") {
    const set = new Set(allowed);
    return makeConstraint({ name, kind: "anti-monotone", succinct: true, test: (items) => items.every((x) => set.has(x)), allowedItem: (x) => set.has(x) });
}
/** S ∩ V ≠ ∅ (chứa ít nhất một item của V) — monotone, succinct. */
function intersects(values, name = "S ∩ V ≠ ∅") {
    const set = new Set(values);
    return makeConstraint({ name, kind: "monotone", succinct: true, test: (items) => items.some((x) => set.has(x)) });
}
/** count(S) ≤ v — anti-monotone, weakly succinct. */
function countAtMost(v, name = `count(S) ≤ ${v}`) {
    return makeConstraint({ name, kind: "anti-monotone", succinct: false, test: (items) => items.length <= v });
}
/** count(S) ≥ v — monotone. */
function countAtLeast(v, name = `count(S) ≥ ${v}`) {
    return makeConstraint({ name, kind: "monotone", test: (items) => items.length >= v });
}
/** count({x ∈ S | pred(x)}) ≤ v — anti-monotone (thêm item không làm số đếm giảm). */
function countWhereAtMost(pred, v, name) {
    return makeConstraint({ name: name || `count(S ∩ P) ≤ ${v}`, kind: "anti-monotone", test: (items) => items.filter(pred).length <= v });
}
/** sum(S.attr) ≤ v với attr ≥ 0 — anti-monotone (Ví dụ 7.8). */
function sumAtMost(attr, v, name = `sum(S) ≤ ${v}`) {
    return makeConstraint({
        name,
        kind: "anti-monotone",
        test: (items) => {
            const xs = valuesOf(items, attr);
            if (xs.some((x) => x < 0)) throw new RangeError(`${name}: chỉ anti-monotone khi mọi giá trị ≥ 0.`);
            return sum(xs) <= v;
        },
    });
}
/** sum(S.attr) ≥ v với attr ≥ 0 — monotone. */
function sumAtLeast(attr, v, name = `sum(S) ≥ ${v}`) {
    return makeConstraint({ name, kind: "monotone", test: (items) => sum(valuesOf(items, attr)) >= v });
}
/** min(S.attr) ≥ v — anti-monotone, succinct (S ⊆ {x | attr(x) ≥ v}). */
function minAtLeast(attr, v, universe, name = `min(S) ≥ ${v}`) {
    const allowed = universe.filter((x) => attr(x) >= v);
    return { ...subsetOf(allowed, name), describe: name };
}
/** min(S.attr) ≤ v — monotone, succinct. */
function minAtMost(attr, v, universe, name = `min(S) ≤ ${v}`) {
    return { ...intersects(universe.filter((x) => attr(x) <= v), name), describe: name };
}
/** max(S.attr) ≤ v — anti-monotone, succinct. */
function maxAtMost(attr, v, universe, name = `max(S) ≤ ${v}`) {
    return { ...subsetOf(universe.filter((x) => attr(x) <= v), name), describe: name };
}
/** avg(S.attr) ≤ v — convertible (không cắt tỉa trực tiếp được). */
function avgAtMost(attr, v, name = `avg(S) ≤ ${v}`) {
    return makeConstraint({ name, kind: "convertible", test: (items) => items.length > 0 && sum(valuesOf(items, attr)) / items.length <= v });
}
/** sum(S.attr) ≤ v khi attr có thể âm — inconvertible. */
function sumAtMostSigned(attr, v, name = `sum(S) ≤ ${v} (giá trị có thể âm)`) {
    return makeConstraint({ name, kind: "inconvertible", test: (items) => sum(valuesOf(items, attr)) <= v });
}
/**
 * Không có cặp item "xung đột" nào trong S — anti-monotone: một cặp xung đột trong S vẫn nằm trong mọi tập cha.
 * @param {(a: string, b: string) => boolean} conflict đối xứng
 */
function noConflictingPair(conflict, name = "không có cặp xung đột") {
    return makeConstraint({
        name,
        kind: "anti-monotone",
        test: (items) => {
            for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (conflict(items[i], items[j])) return false;
            return true;
        },
    });
}

// ---------------------------------------------------------------- tiện ích

const satisfiesAll = (constraints, items) => constraints.every((c) => c.test(items));
const pushableOf = (constraints) => constraints.filter((c) => c.pushable);
const postOnlyOf = (constraints) => constraints.filter((c) => !c.pushable);

/** Bảng tóm tắt (để ghi vào báo cáo). */
function describeConstraints(constraints) {
    return constraints.map((c) => ({ name: c.name, kind: c.kind, succinct: c.succinct, appliedAs: c.pushable ? (c.allowedItem ? "cắt tỉa dữ liệu trước khi đếm + cắt tỉa mẫu" : "cắt tỉa mẫu trong khai phá") : "hậu lọc" }));
}

module.exports = {
    KINDS,
    makeConstraint,
    subsetOf,
    intersects,
    countAtMost,
    countAtLeast,
    countWhereAtMost,
    sumAtMost,
    sumAtLeast,
    minAtLeast,
    minAtMost,
    maxAtMost,
    avgAtMost,
    sumAtMostSigned,
    noConflictingPair,
    satisfiesAll,
    pushableOf,
    postOnlyOf,
    describeConstraints,
};
