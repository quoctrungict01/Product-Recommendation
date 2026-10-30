// Khai phá luật kết hợp đa mức (multilevel association rules) — mục 7.2.1.
//
// Tái sử dụng NGUYÊN Apriori / FP-Growth / generateRules của Chương 6 (src/apps/services/mining), không viết lại.
// Các bước:
//  1. Mở rộng giao dịch bằng tổ tiên trong hệ phân cấp (hierarchy.extendTransactions): đếm support ở mọi cấp.
//  2. Ngưỡng support theo cấp — ba chiến lược của giáo trình:
//       uniform : một ngưỡng cho mọi cấp (Hình 7.3);
//       reduced : mỗi cấp một ngưỡng, cấp càng sâu ngưỡng càng nhỏ (Hình 7.4);
//       group   : ngưỡng riêng cho một nhóm item (ghi đè ngưỡng theo cấp).
//     Tập trộn nhiều cấp/nhóm dùng NGƯỠNG THẤP NHẤT trong các nhóm tham gia ("the lowest support threshold
//     among all the participating groups is taken"), còn tập thuần một cấp/nhóm giữ ngưỡng riêng của nó.
//     Vì ngưỡng của mỗi tập ≥ ngưỡng thấp nhất toàn cục, ta khai phá MỘT lần ở ngưỡng thấp nhất (đầy đủ,
//     không bỏ sót) rồi lọc theo ngưỡng của từng tập. Không dựa vào tính chất Apriori giữa các cấp, vì
//     giáo trình lưu ý tính chất này có thể không đúng dưới reduced/group support.
//  3. Bỏ tập "tầm thường" chứa đồng thời item và tổ tiên của nó (vd. {iPhone 15, danh mục iPhone}):
//     support({x, cha(x)}) = support({x}), nên luật x ⇒ cha(x) luôn có confidence 100% và không mang thông tin.
//     Mọi tập con của một tập không tầm thường cũng không tầm thường, nên danh sách vẫn đóng theo tập con
//     và dùng được generateRules() gốc.
//  4. Luật dư thừa theo luật tổ tiên (Ví dụ 7.2): findRedundantRules().

const { performance } = require("perf_hooks");
const { apriori, fpGrowth, generateRules } = require("../../src/apps/services/mining");
const { resolveMinSupportCount } = require("../../src/apps/services/mining/transactions");
const { itemsetKey } = require("../../src/apps/services/mining/itemset");
const { assertMiningBudget } = require("../evaluation/budget");
const { extendTransactions, generalizeTransactions, containsAncestorPair } = require("./hierarchy");
const { CONSTRAINED, postFilter } = require("../constraints/miners");
const { noConflictingPair } = require("../constraints/constraints");

const ALGORITHMS = { apriori, fpgrowth: fpGrowth };
const STRATEGIES = ["uniform", "reduced", "group"];

function checkSupport(value, name) {
    if (typeof value !== "number" || !(value > 0 && value < 1)) throw new RangeError(`${name} phải là tỷ lệ trong (0, 1).`);
}

/**
 * Chuẩn hóa ngưỡng support.
 * @param {object} hierarchy
 * @param {{strategy: string, minSupport?: number, levelMinSupport?: Record<number, number>,
 *          groups?: {name?: string, items: string[], minSupport: number}[]}} options
 * @returns {{strategy: string, byLevel: Record<number, number>, groups: object[], thresholdOf: (node: string) => number, lowest: number}}
 */
function resolveThresholds(hierarchy, options) {
    const { strategy = "uniform", minSupport, levelMinSupport, groups = [] } = options;
    if (!STRATEGIES.includes(strategy)) throw new RangeError(`Chiến lược ngưỡng không hỗ trợ: ${strategy} (chọn ${STRATEGIES.join(", ")})`);
    const byLevel = {};
    if (strategy === "uniform") {
        checkSupport(minSupport, "minSupport");
        if (levelMinSupport) throw new Error("uniform support chỉ dùng một ngưỡng minSupport cho mọi cấp.");
        for (let l = 1; l <= hierarchy.depth; l++) byLevel[l] = minSupport;
    } else {
        if (!levelMinSupport) throw new Error(`${strategy} support cần levelMinSupport cho từng cấp 1..${hierarchy.depth}.`);
        for (let l = 1; l <= hierarchy.depth; l++) {
            checkSupport(levelMinSupport[l], `levelMinSupport[${l}]`);
            byLevel[l] = levelMinSupport[l];
        }
        if (strategy === "reduced") {
            for (let l = 2; l <= hierarchy.depth; l++) {
                if (byLevel[l] > byLevel[l - 1]) throw new RangeError(`reduced support: ngưỡng cấp ${l} (${byLevel[l]}) không được lớn hơn cấp ${l - 1} (${byLevel[l - 1]}) — cấp càng sâu ngưỡng càng nhỏ.`);
            }
        }
    }
    if (groups.length && strategy !== "group") throw new Error("Ngưỡng theo nhóm (groups) chỉ dùng với strategy 'group'.");
    if (strategy === "group" && !groups.length) throw new Error("group support cần ít nhất một nhóm.");
    const override = new Map();
    for (const g of groups) {
        checkSupport(g.minSupport, `minSupport của nhóm ${g.name || ""}`);
        for (const node of g.items) {
            if (!hierarchy.has(node)) throw new Error(`Nhóm ${g.name || ""} chứa item không có trong hệ phân cấp: ${node}`);
            if (override.has(node)) throw new Error(`Item ${node} thuộc nhiều nhóm.`);
            override.set(node, g.minSupport);
        }
    }
    const thresholdOf = (node) => (override.has(node) ? override.get(node) : byLevel[hierarchy.levelOf(node)]);
    const lowest = Math.min(...Object.values(byLevel), ...override.values());
    return { strategy, byLevel, groups: groups.map((g) => ({ name: g.name || null, items: [...g.items].sort(), minSupport: g.minSupport })), thresholdOf, lowest };
}

/** Ngưỡng của một tập = ngưỡng thấp nhất của các item tham gia (tập thuần một cấp: đúng ngưỡng cấp đó). */
function itemsetThreshold(items, thresholds) {
    return Math.min(...items.map(thresholds.thresholdOf));
}

const levelsOf = (items, hierarchy) => [...new Set(items.map(hierarchy.levelOf))].sort((a, b) => a - b);

/** "level-1", "level-2", ... cho tập/luật thuần một cấp; "mixed" nếu trộn nhiều cấp. */
function typeOfLevels(levels) {
    return levels.length === 1 ? `level-${levels[0]}` : "mixed";
}

function countBy(list, key) {
    const out = {};
    for (const x of list) out[key(x)] = (out[key(x)] || 0) + 1;
    return out;
}

/**
 * Khai phá luật kết hợp đa mức.
 * @param {string[][]} transactions giao dịch ở cấp thấp nhất (mã sản phẩm hoặc nút lá)
 * @param {object} hierarchy createHierarchy() / hierarchyFromCatalog().hierarchy
 * @param {object} options
 * @param {"apriori"|"fpgrowth"} [options.algorithm]
 * @param {string} options.strategy uniform | reduced | group (xem resolveThresholds)
 * @param {number} [options.minConfidence]
 * @param {(item: string) => string} [options.toNode] ánh xạ item thô -> nút (mặc định: chính nó)
 * @param {number} [options.maxRuleItemsetSize] chỉ sinh luật từ tập có ≤ số item này (2 = chỉ luật 1 ⇒ 1)
 * @param {object} [options.limits] giới hạn ngân sách khai phá (research/evaluation/budget.js)
 */
function mineMultilevel(transactions, hierarchy, options = {}) {
    const { algorithm = "fpgrowth", minConfidence = 0, toNode = (x) => x, maxRuleItemsetSize = Infinity, limits, constraints = null, constraintMode = "push" } = options;
    const run = ALGORITHMS[String(algorithm).toLowerCase()];
    if (!run) throw new RangeError(`Thuật toán không hỗ trợ: ${algorithm}`);
    const thresholds = resolveThresholds(hierarchy, options);

    const t0 = performance.now();
    const extended = extendTransactions(transactions, hierarchy, toNode);
    const n = extended.length;
    const nodeCounts = new Map();
    let extendedLength = 0;
    let maxExtendedLength = 0;
    for (const t of extended) {
        extendedLength += t.length;
        maxExtendedLength = Math.max(maxExtendedLength, t.length);
        for (const x of t) nodeCounts.set(x, (nodeCounts.get(x) || 0) + 1);
    }
    const extendMs = performance.now() - t0;

    // Giao dịch mở rộng dài hơn -> kiểm tra ngân sách trước khi khai phá.
    const budget = assertMiningBudget(extended, thresholds.lowest, limits);

    // M2 (tùy chọn): ràng buộc tập mục. "push" = cắt tỉa trong khai phá (chỉ anti-monotone), "post" = hậu lọc
    // kết quả của thuật toán gốc. Kèm ràng buộc "không có item cùng tổ tiên của nó" (cũng anti-monotone).
    // Không truyền constraints -> dùng đúng apriori()/fpGrowth() gốc như trước.
    const t1 = performance.now();
    let mined;
    let constraintStats = null;
    if (constraints && constraints.length) {
        const all = [...constraints, noConflictingPair((a, b) => hierarchy.isAncestor(a, b) || hierarchy.isAncestor(b, a), "không có item cùng tổ tiên của nó")];
        if (constraintMode === "push") {
            mined = CONSTRAINED[String(algorithm).toLowerCase()](extended, { minSupport: thresholds.lowest, constraints: all });
        } else if (constraintMode === "post") {
            const raw = run(extended, { minSupport: thresholds.lowest });
            mined = { itemsets: postFilter(raw.itemsets, all), stats: raw.stats };
            constraintStats = { postFilteredOut: raw.itemsets.length - mined.itemsets.length };
        } else throw new RangeError(`constraintMode phải là "push" hoặc "post": ${constraintMode}`);
        constraintStats = { mode: constraintMode, constraints: all.map((c) => c.name), ...constraintStats };
    } else {
        mined = run(extended, { minSupport: thresholds.lowest });
    }
    const miningMs = performance.now() - t1;

    const t2 = performance.now();
    const nonTrivial = mined.itemsets.filter((s) => !containsAncestorPair(s.items, hierarchy));
    const supportMap = new Map(nonTrivial.map((s) => [itemsetKey(s.items), s.support]));
    const frequent = [];
    let belowThreshold = 0;
    for (const s of nonTrivial) {
        const required = resolveMinSupportCount(itemsetThreshold(s.items, thresholds), n);
        if (s.support < required) {
            belowThreshold++;
            continue;
        }
        const levels = levelsOf(s.items, hierarchy);
        frequent.push({ items: s.items, support: s.support, levels, type: typeOfLevels(levels) });
    }
    const frequentKeys = new Set(frequent.map((s) => itemsetKey(s.items)));

    // Luật: sinh bằng generateRules() gốc trên danh sách đóng theo tập con, rồi giữ luật có A ∪ B đạt ngưỡng của chính nó.
    const ruleSource = Number.isFinite(maxRuleItemsetSize) ? nonTrivial.filter((s) => s.items.length <= maxRuleItemsetSize) : nonTrivial;
    const rules = generateRules(ruleSource, { transactionCount: n, minConfidence })
        .filter((r) => frequentKeys.has(itemsetKey([...r.antecedent, ...r.consequent].sort())))
        .map((r) => {
            const levels = levelsOf([...r.antecedent, ...r.consequent], hierarchy);
            return { ...r, antecedentLevels: levelsOf(r.antecedent, hierarchy), consequentLevels: levelsOf(r.consequent, hierarchy), type: typeOfLevels(levels) };
        });
    const postMs = performance.now() - t2;

    const flatLength = transactions.reduce((s, t) => s + new Set(t).size, 0);
    return {
        algorithm: String(algorithm).toLowerCase(),
        thresholds: { strategy: thresholds.strategy, byLevel: thresholds.byLevel, groups: thresholds.groups, lowest: thresholds.lowest },
        transactionCount: n,
        itemsets: frequent,
        rules,
        nodeCounts,
        /** Support count của một tập bất kỳ đã khai phá ở ngưỡng thấp nhất (không tầm thường); undefined nếu không phổ biến. */
        supportCount(items) {
            if (items.length === 1) return nodeCounts.get(items[0]);
            return supportMap.get(itemsetKey([...items].sort()));
        },
        stats: {
            transactions: n,
            avgFlatLength: n ? flatLength / n : 0,
            avgExtendedLength: n ? extendedLength / n : 0,
            maxExtendedLength,
            budget,
            minedAtLowest: mined.itemsets.length,
            trivialRemoved: mined.itemsets.length - nonTrivial.length,
            belowOwnThreshold: belowThreshold,
            frequent: frequent.length,
            frequentByType: countBy(frequent, (s) => s.type),
            rules: rules.length,
            rulesByType: countBy(rules, (r) => r.type),
            algorithmStats: mined.stats,
            constraints: constraintStats,
            extendMs,
            miningMs,
            postProcessMs: postMs,
        },
    };
}

/**
 * Cách tiếp cận "từ trên xuống, từng cấp" của giáo trình: khái quát hóa giao dịch lên cấp ℓ = 1, 2, ...
 * rồi khai phá mỗi cấp bằng Apriori/FP-Growth với ngưỡng của cấp đó; dừng khi một cấp không còn tập phổ biến.
 * Với uniform support, item có tổ tiên không phổ biến bị bỏ trước khi khai phá cấp dưới (tối ưu kiểu Apriori:
 * "the search avoids examining itemsets containing any item of which the ancestors do not have minimum support").
 * Chỉ trả về tập thuần một cấp; dùng để đối chiếu với mineMultilevel() (phải trùng khớp phần thuần một cấp).
 */
function mineLevelByLevel(transactions, hierarchy, options = {}) {
    const { algorithm = "fpgrowth", toNode = (x) => x } = options;
    const run = ALGORITHMS[String(algorithm).toLowerCase()];
    const thresholds = resolveThresholds(hierarchy, options);
    if (thresholds.strategy === "group") throw new Error("mineLevelByLevel chỉ hỗ trợ uniform/reduced.");
    const levels = [];
    let frequentAbove = null; // các nút phổ biến ở cấp ngay trên
    for (let level = 1; level <= hierarchy.depth; level++) {
        let generalized = generalizeTransactions(transactions, hierarchy, level, toNode);
        let pruned = 0;
        if (thresholds.strategy === "uniform" && frequentAbove) {
            generalized = generalized.map((t) => {
                const kept = t.filter((x) => hierarchy.levelOf(x) < level || frequentAbove.has(hierarchy.parentOf(x)));
                pruned += t.length - kept.length;
                return kept;
            });
        }
        const { itemsets, stats } = run(generalized, { minSupport: thresholds.byLevel[level] });
        const own = itemsets.filter((s) => s.items.every((x) => hierarchy.levelOf(x) === level));
        levels.push({ level, minSupport: thresholds.byLevel[level], itemsets: own, prunedByAncestor: pruned, stats });
        if (own.length === 0) break; // "until no more frequent itemsets can be found"
        frequentAbove = new Set(own.filter((s) => s.items.length === 1).map((s) => s.items[0]));
    }
    return levels;
}

/**
 * Luật dư thừa theo luật tổ tiên (mục 7.2.1, Ví dụ 7.2).
 * R1 là tổ tiên của R2 nếu thay một số item của R2 bằng tổ tiên của chúng thì được R1.
 * Giá trị kỳ vọng của R2 dựa trên R1, với ẑ là item cụ thể trong R2 và z là tổ tiên tương ứng trong R1:
 *     E[sup(R2)]  = sup(R1)  × Π_{mọi item được thay}       sup(ẑ)/sup(z)
 *     E[conf(R2)] = conf(R1) × Π_{item được thay ở vế phải}  sup(ẑ)/sup(z)
 * (Ví dụ 7.2: chỉ thay vế trái, "Dell laptop" chiếm 1/4 "laptop" -> E[sup] = 8% × 1/4 = 2%, E[conf] = 70%.)
 * R2 dư thừa nếu support VÀ confidence đều gần giá trị kỳ vọng: |x − E[x]| ≤ tolerance × E[x].
 *
 * @param {object[]} rules luật (antecedent, consequent, support, confidence)
 * @param {object} hierarchy
 * @param {(items: string[]) => number|undefined} supportCount support count của tập 1 item
 * @param {{tolerance?: number, maxAncestorCombos?: number}} [options]
 * @returns {{rule: object, ancestor: object, expectedSupport: number, expectedConfidence: number}[]}
 */
function findRedundantRules(rules, hierarchy, supportCount, options = {}) {
    const { tolerance = 0.1, maxAncestorCombos = 4096 } = options;
    const keyOf = (a, c) => `${itemsetKey([...a].sort())}=>${itemsetKey([...c].sort())}`;
    const byKey = new Map(rules.map((r) => [keyOf(r.antecedent, r.consequent), r]));
    const close = (x, e) => Math.abs(x - e) <= tolerance * e + 1e-12;
    const redundant = [];

    for (const rule of rules) {
        const items = [...rule.antecedent.map((x) => ({ x, side: "a" })), ...rule.consequent.map((x) => ({ x, side: "c" }))];
        const options_ = items.map(({ x }) => [x, ...hierarchy.ancestorsOf(x)]);
        const combos = options_.reduce((p, o) => p * o.length, 1);
        if (combos <= 1 || combos > maxAncestorCombos) continue;
        let best = null;
        const choice = new Array(items.length).fill(0);
        for (let c = 1; c < combos; c++) {
            // đếm theo cơ số hỗn hợp: choice[i] = chỉ số tổ tiên chọn cho item i (0 = giữ nguyên)
            let carry = c;
            for (let i = 0; i < items.length; i++) {
                choice[i] = carry % options_[i].length;
                carry = Math.floor(carry / options_[i].length);
            }
            const a = [];
            const cons = [];
            let factorAll = 1;
            let factorCons = 1;
            let valid = true;
            for (let i = 0; i < items.length && valid; i++) {
                const z = options_[i][choice[i]];
                (items[i].side === "a" ? a : cons).push(z);
                if (choice[i] > 0) {
                    const specific = supportCount([items[i].x]);
                    const general = supportCount([z]);
                    if (!specific || !general) valid = false;
                    else {
                        factorAll *= specific / general;
                        if (items[i].side === "c") factorCons *= specific / general;
                    }
                }
            }
            if (!valid) continue;
            const all = [...a, ...cons];
            if (new Set(all).size !== all.length || containsAncestorPair(all, hierarchy)) continue;
            const ancestor = byKey.get(keyOf(a, cons));
            if (!ancestor) continue;
            const expectedSupport = ancestor.support * factorAll;
            const expectedConfidence = ancestor.confidence * factorCons;
            if (close(rule.support, expectedSupport) && close(rule.confidence, expectedConfidence)) {
                // Giữ luật tổ tiên tổng quát nhất (nhiều item được thay nhất) để giải thích.
                const replaced = choice.filter((x) => x > 0).length;
                if (!best || replaced > best.replaced) best = { rule, ancestor, expectedSupport, expectedConfidence, replaced };
            }
        }
        if (best) redundant.push(best);
    }
    return redundant;
}

module.exports = {
    STRATEGIES,
    resolveThresholds,
    itemsetThreshold,
    mineMultilevel,
    mineLevelByLevel,
    findRedundantRules,
};
