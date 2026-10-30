// Kiểm thử M1 theo mục 7.2.1: hệ phân cấp, uniform/reduced/group support, luật tầm thường, luật dư thừa.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createHierarchy,
    hierarchyFromCatalog,
    extendTransactions,
    generalizeTransactions,
    containsAncestorPair,
    categoryNode,
    productNode,
} = require("../../research/multilevel/hierarchy");
const { mineMultilevel, mineLevelByLevel, findRedundantRules, resolveThresholds } = require("../../research/multilevel/mining");
const { MiningBudgetError } = require("../../research/evaluation/budget");
const { mine } = require("../../src/apps/services/mining");
const { createRandom } = require("../../src/apps/services/mining/synthetic");
const { FIGURE_7_2, TABLE_7_1, FIGURE_7_3_HIERARCHY, FIGURE_7_3_TRANSACTIONS, EXAMPLE_7_2_HIERARCHY, example72Transactions, repeat } = require("./textbook");

const frequentIds = (result, level) => result.itemsets.filter((s) => s.items.length === 1 && (level === undefined || s.levels[0] === level)).map((s) => s.items[0]).sort();

test("Hình 7.2: cấp 0 là gốc all, cấp 1–4 đúng như giáo trình", () => {
    const h = createHierarchy(FIGURE_7_2);
    assert.equal(h.depth, 4);
    assert.equal(h.levelOf("computer"), 1);
    assert.equal(h.levelOf("laptop computer"), 2);
    assert.equal(h.levelOf("Dell laptop computer"), 3);
    assert.equal(h.levelOf("Dell Studio XPS 16 Notebook"), 4);
    assert.deepEqual(h.ancestorsOf("Dell Studio XPS 16 Notebook"), ["Dell laptop computer", "laptop computer", "computer"]);
    assert.equal(h.has("all"), false, "gốc all không phải item");
    assert.ok(h.isAncestor("computer", "Dell Studio XPS 16 Notebook"));
    assert.ok(!h.isAncestor("software", "Dell Studio XPS 16 Notebook"));
    assert.deepEqual(h.childrenOf("computer"), ["desktop computer", "laptop computer"]);
});

test("Bảng 7.1: khái quát hóa item thô lên các cấp cao hơn (T400 → Dell notebook, camera; computer, printer and camera)", () => {
    const h = createHierarchy(FIGURE_7_2);
    const [t400] = [TABLE_7_1[3]];
    assert.deepEqual(generalizeTransactions([t400], h, 3)[0], ["Canon digital camera", "Dell laptop computer"]);
    assert.deepEqual(generalizeTransactions([t400], h, 1)[0], ["computer", "printer and camera"]);
    const extended = extendTransactions(TABLE_7_1, h);
    assert.deepEqual(extended[0], [
        "Apple 17\" MacBook Pro Notebook", "Apple laptop computer", "HP Photosmart Pro b9180", "HP printer", "computer", "laptop computer", "printer", "printer and camera",
    ].sort());
    // Ở cấp item thô không có gì phổ biến (mỗi item 1/5); ở cấp 1 "computer" có trong 3/5 giao dịch.
    const r = mineMultilevel(TABLE_7_1, h, { strategy: "uniform", minSupport: 0.4 });
    assert.deepEqual(frequentIds(r, 4), []);
    assert.ok(frequentIds(r, 1).includes("computer"));
    assert.equal(r.nodeCounts.get("computer"), 3);
    assert.equal(r.nodeCounts.get("laptop computer"), 3);
});

test("Hệ phân cấp: định danh trùng, nút cha thiếu, chu trình và item lạ đều bị từ chối", () => {
    assert.throws(() => createHierarchy([{ id: "a" }, { id: "a" }]), /trùng định danh/);
    assert.throws(() => createHierarchy([{ id: "a", parent: "x" }]), /không tồn tại/);
    assert.throws(() => createHierarchy([{ id: "a", parent: "b" }, { id: "b", parent: "a" }]), /chu trình/);
    assert.throws(() => createHierarchy([{ id: "all" }]), /gốc/);
    assert.throws(() => extendTransactions([["lạ"]], createHierarchy([{ id: "a" }])), /không có trong hệ phân cấp/);
});

test("TrungShop: danh mục và sản phẩm là các nút riêng, có tiền tố, kể cả khi trùng _id", () => {
    const products = [
        { _id: "x1", category_id: "x1", category: "Danh mục trùng id", name: "SP trùng id danh mục" },
        { _id: "p2", category_id: "x1", name: "SP 2" },
        { _id: "p3", category_id: "c2", name: "SP 3" },
    ];
    const { hierarchy, toNode, categoryNodes, productNodes } = hierarchyFromCatalog(products);
    assert.equal(hierarchy.depth, 2, "chỉ hai cấp như dữ liệu");
    assert.deepEqual(categoryNodes, ["C:c2", "C:x1"]);
    assert.deepEqual(productNodes, ["P:p2", "P:p3", "P:x1"]);
    assert.notEqual(categoryNode("x1"), productNode("x1"));
    assert.equal(hierarchy.parentOf(toNode("x1")), "C:x1");
    assert.equal(hierarchy.levelOf("C:x1"), 1);
    assert.equal(hierarchy.levelOf("P:x1"), 2);
    assert.deepEqual(extendTransactions([["x1", "p2"]], hierarchy, toNode)[0], ["C:x1", "P:p2", "P:x1"]);
    assert.throws(() => hierarchyFromCatalog([{ _id: "a" }]), /category_id/);
    assert.throws(() => hierarchyFromCatalog([{ _id: "a", category_id: "c" }, { _id: "a", category_id: "c" }]), /trùng/);
});

test("Hình 7.3 — uniform support 5%: computer và laptop phổ biến, desktop thì không", () => {
    const h = createHierarchy(FIGURE_7_3_HIERARCHY);
    for (const algorithm of ["apriori", "fpgrowth"]) {
        const r = mineMultilevel(FIGURE_7_3_TRANSACTIONS, h, { algorithm, strategy: "uniform", minSupport: 0.05 });
        assert.deepEqual(frequentIds(r, 1), ["computer", "printer and camera"]);
        assert.deepEqual(frequentIds(r, 2), ["laptop computer", "printer"]);
        assert.equal(r.nodeCounts.get("computer"), 10);
        assert.equal(r.nodeCounts.get("desktop computer"), 4);
    }
});

test("Hình 7.4 — reduced support (cấp 1: 5%, cấp 2: 3%): computer, laptop và desktop đều phổ biến", () => {
    const h = createHierarchy(FIGURE_7_3_HIERARCHY);
    for (const algorithm of ["apriori", "fpgrowth"]) {
        const r = mineMultilevel(FIGURE_7_3_TRANSACTIONS, h, { algorithm, strategy: "reduced", levelMinSupport: { 1: 0.05, 2: 0.03 } });
        assert.deepEqual(frequentIds(r, 2), ["desktop computer", "laptop computer", "printer"]);
        assert.equal(r.thresholds.lowest, 0.03);
    }
    // "Cấp càng sâu ngưỡng càng nhỏ": ngưỡng cấp 2 lớn hơn cấp 1 bị từ chối.
    assert.throws(() => resolveThresholds(h, { strategy: "reduced", levelMinSupport: { 1: 0.03, 2: 0.05 } }), /không được lớn hơn/);
    assert.throws(() => resolveThresholds(h, { strategy: "reduced", levelMinSupport: { 1: 0.05 } }), /levelMinSupport\[2\]/);
});

test("Ngưỡng tập trộn cấp = ngưỡng thấp nhất của các cấp tham gia; tập thuần một cấp giữ ngưỡng của cấp đó", () => {
    const h = createHierarchy([{ id: "A" }, { id: "a1", parent: "A" }, { id: "a2", parent: "A" }, { id: "B" }, { id: "b1", parent: "B" }, { id: "b2", parent: "B" }]);
    // 100 giao dịch: {a1,b1} 10, {a2,b2} 10, a2 30, b2 30, a1 20.
    const T = [...repeat(10, ["a1", "b1"]), ...repeat(10, ["a2", "b2"]), ...repeat(30, ["a2"]), ...repeat(30, ["b2"]), ...repeat(20, ["a1"])];
    const r = mineMultilevel(T, h, { strategy: "reduced", levelMinSupport: { 1: 0.3, 2: 0.1 } });
    const has = (...items) => r.itemsets.some((s) => s.items.join() === [...items].sort().join());
    assert.ok(!has("A", "B"), "{A,B} support 20% < ngưỡng cấp 1 (30%)");
    assert.ok(has("A", "b1"), "{A,b1} support 10% ≥ min(30%, 10%)");
    assert.ok(has("a1", "b1"), "{a1,b1} support 10% ≥ ngưỡng cấp 2");
    assert.ok(has("A") && has("B"), "A 70%, B 80%");
    assert.equal(r.itemsets.find((s) => s.items.join() === "A,b1").type, "mixed");
    // Luật từ tập không đạt ngưỡng riêng không được sinh.
    assert.ok(!r.rules.some((x) => [...x.antecedent, ...x.consequent].sort().join() === "A,B"));
});

test("Group-based support: nhóm được ưu tiên có ngưỡng riêng thấp hơn", () => {
    const h = createHierarchy(FIGURE_7_3_HIERARCHY);
    const uniform = mineMultilevel(FIGURE_7_3_TRANSACTIONS, h, { strategy: "uniform", minSupport: 0.05 });
    assert.ok(!frequentIds(uniform).includes("desktop computer"));
    const group = mineMultilevel(FIGURE_7_3_TRANSACTIONS, h, {
        strategy: "group",
        levelMinSupport: { 1: 0.05, 2: 0.05 },
        groups: [{ name: "desktop", items: ["desktop computer"], minSupport: 0.02 }],
    });
    assert.ok(frequentIds(group).includes("desktop computer"));
    assert.throws(() => resolveThresholds(h, { strategy: "uniform", minSupport: 0.05, groups: [{ items: ["computer"], minSupport: 0.01 }] }), /chỉ dùng với strategy 'group'/);
});

test("Không sinh luật tầm thường: không tập/luật nào chứa đồng thời item và tổ tiên (vd. sản phẩm ⇒ danh mục cha)", () => {
    const h = createHierarchy(FIGURE_7_2);
    const random = createRandom(7);
    const leaves = FIGURE_7_2.filter((n) => h.isLeaf(n.id)).map((n) => n.id);
    const T = Array.from({ length: 400 }, () => Array.from({ length: 1 + Math.floor(random() * 3) }, () => leaves[Math.floor(random() * leaves.length)]));
    const r = mineMultilevel(T, h, { strategy: "uniform", minSupport: 0.02 });
    assert.ok(r.stats.trivialRemoved > 0, "dữ liệu có tập tầm thường để loại");
    for (const s of r.itemsets) assert.ok(!containsAncestorPair(s.items, h), `tập tầm thường ${s.items}`);
    for (const rule of r.rules) {
        const all = [...rule.antecedent, ...rule.consequent];
        assert.ok(!containsAncestorPair(all, h), `luật tầm thường ${rule.antecedent} ⇒ ${rule.consequent}`);
    }
    // Đặc biệt: không có luật item ⇒ cha(item) dù confidence của nó luôn bằng 100%.
    assert.ok(!r.rules.some((x) => x.antecedent.length === 1 && x.consequent.length === 1 && h.parentOf(x.antecedent[0]) === x.consequent[0]));
});

test("Đối chiếu cách 'từng cấp, từ trên xuống' của giáo trình: phần thuần một cấp trùng khớp (Apriori và FP-Growth)", () => {
    const h = createHierarchy(FIGURE_7_2);
    const random = createRandom(2026);
    const leaves = FIGURE_7_2.filter((n) => h.isLeaf(n.id)).map((n) => n.id);
    const T = Array.from({ length: 600 }, () => Array.from({ length: 1 + Math.floor(random() * 4) }, () => leaves[Math.floor(random() * leaves.length)]));
    const configs = [
        { strategy: "uniform", minSupport: 0.03 },
        { strategy: "reduced", levelMinSupport: { 1: 0.1, 2: 0.05, 3: 0.03, 4: 0.02 } },
    ];
    for (const cfg of configs) {
        for (const algorithm of ["apriori", "fpgrowth"]) {
            const combined = mineMultilevel(T, h, { ...cfg, algorithm });
            const levels = mineLevelByLevel(T, h, { ...cfg, algorithm });
            for (const { level, itemsets } of levels) {
                const fromCombined = combined.itemsets.filter((s) => s.type === `level-${level}`).map((s) => `${s.items}:${s.support}`).sort();
                assert.deepEqual(fromCombined, itemsets.map((s) => `${s.items}:${s.support}`).sort(), `${cfg.strategy}/${algorithm}/cấp ${level}`);
            }
        }
    }
    const uniformLevels = mineLevelByLevel(T, h, { strategy: "uniform", minSupport: 0.3 });
    assert.ok(uniformLevels.some((l) => l.prunedByAncestor > 0), "uniform: item có tổ tiên không phổ biến bị bỏ trước khi khai phá cấp dưới");
    assert.equal(uniformLevels.length, 3, "dừng khi một cấp không còn tập phổ biến");
    assert.equal(uniformLevels[2].itemsets.length, 0);
});

test("Apriori và FP-Growth cho cùng tập và luật đa mức; phần một cấp sản phẩm trùng với khai phá hiện tại", () => {
    const products = [];
    for (let c = 0; c < 4; c++) for (let p = 0; p < 5; p++) products.push({ _id: `p${c}${p}`, category_id: `c${c}` });
    const random = createRandom(99);
    const T = Array.from({ length: 800 }, () => {
        const base = Math.floor(random() * 5);
        return [`p0${base}`, ...(random() < 0.6 ? [`p1${base}`] : []), ...(random() < 0.3 ? [`p${2 + Math.floor(random() * 2)}${Math.floor(random() * 5)}`] : [])];
    });
    const { hierarchy, toNode } = hierarchyFromCatalog(products);
    const opts = { strategy: "reduced", levelMinSupport: { 1: 0.05, 2: 0.01 }, toNode, minConfidence: 0.1 };
    const a = mineMultilevel(T, hierarchy, { ...opts, algorithm: "apriori" });
    const f = mineMultilevel(T, hierarchy, { ...opts, algorithm: "fpgrowth" });
    const key = (r) => r.rules.map((x) => `${x.antecedent}=>${x.consequent}:${x.supportCount}`).sort();
    assert.deepEqual(a.itemsets, f.itemsets);
    assert.deepEqual(key(a), key(f));
    // Luật thuần cấp sản phẩm của M1 = luật của hệ thống hiện tại ở cùng ngưỡng.
    const flat = mine(T, { minSupport: 0.01, minConfidence: 0.1 });
    const flatKeys = flat.rules.map((x) => `${x.antecedent.map(toNode)}=>${x.consequent.map(toNode)}:${x.supportCount}`).sort();
    assert.deepEqual(key(f).filter((k) => !k.includes("C:")), flatKeys);
    assert.ok(f.rules.some((x) => x.type === "mixed") && f.rules.some((x) => x.type === "level-1"));
});

test("Ví dụ 7.2: Dell laptop ⇒ HP printer [2,1%, 70%] dư thừa so với laptop ⇒ HP printer [8,4%, 70%]", () => {
    const h = createHierarchy(EXAMPLE_7_2_HIERARCHY);
    const r = mineMultilevel(example72Transactions(21), h, { strategy: "uniform", minSupport: 0.01 });
    const find = (a, c) => r.rules.find((x) => x.antecedent.join() === a && x.consequent.join() === c);
    const ancestor = find("laptop computer", "HP printer");
    const specific = find("Dell laptop computer", "HP printer");
    assert.ok(Math.abs(ancestor.support - 0.084) < 1e-12 && Math.abs(ancestor.confidence - 0.7) < 1e-12);
    assert.ok(Math.abs(specific.support - 0.021) < 1e-12 && Math.abs(specific.confidence - 0.7) < 1e-12);
    const [hit] = findRedundantRules([ancestor, specific], h, r.supportCount);
    assert.equal(hit.rule, specific);
    assert.equal(hit.ancestor, ancestor);
    assert.ok(Math.abs(hit.expectedSupport - 0.021) < 1e-12, "8,4% × 1/4");
    assert.ok(Math.abs(hit.expectedConfidence - 0.7) < 1e-12);

    // Khi Dell laptop thực sự khác (confidence 93%), luật không còn dư thừa.
    const r2 = mineMultilevel(example72Transactions(28), h, { strategy: "uniform", minSupport: 0.01 });
    const find2 = (a, c) => r2.rules.find((x) => x.antecedent.join() === a && x.consequent.join() === c);
    assert.deepEqual(findRedundantRules([find2("laptop computer", "HP printer"), find2("Dell laptop computer", "HP printer")], h, r2.supportCount), []);
});

test("Ví dụ 7.2 (vế phải được thay): kỳ vọng confidence nhân thêm tỷ lệ của item cụ thể trong tổ tiên", () => {
    const h = createHierarchy(EXAMPLE_7_2_HIERARCHY);
    const r = mineMultilevel(example72Transactions(21), h, { strategy: "uniform", minSupport: 0.01 });
    const find = (a, c) => r.rules.find((x) => x.antecedent.join() === a && x.consequent.join() === c);
    const general = find("laptop computer", "printer");
    const specific = find("laptop computer", "HP printer");
    const share = r.supportCount(["HP printer"]) / r.supportCount(["printer"]);
    const out = findRedundantRules([general, specific], h, r.supportCount, { tolerance: 1 });
    assert.equal(out.length, 1);
    assert.ok(Math.abs(out[0].expectedConfidence - general.confidence * share) < 1e-12);
    assert.ok(Math.abs(out[0].expectedSupport - general.support * share) < 1e-12);
});

test("Ngân sách: giao dịch đa mức quá dài bị dừng trước khi khai phá", () => {
    const products = Array.from({ length: 30 }, (_, i) => ({ _id: `p${i}`, category_id: `c${i}` }));
    const { hierarchy, toNode } = hierarchyFromCatalog(products);
    const T = repeat(50, products.map((p) => p._id)); // 30 sản phẩm + 30 danh mục = 60 nút / giao dịch
    assert.throws(() => mineMultilevel(T, hierarchy, { strategy: "uniform", minSupport: 0.5, toNode }), MiningBudgetError);
});
