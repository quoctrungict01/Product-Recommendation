// Bảng 6.1 — "Transactional Data for an AllElectronics Branch" (tr.250),
// cùng các kết quả mong đợi lấy từ Hình 6.2, Ví dụ 6.3, Ví dụ 6.4, Hình 6.7 và Bảng 6.2.

const transactions = [
    ["I1", "I2", "I5"], // T100
    ["I2", "I4"], // T200
    ["I2", "I3"], // T300
    ["I1", "I2", "I4"], // T400
    ["I1", "I3"], // T500
    ["I2", "I3"], // T600
    ["I1", "I3"], // T700
    ["I1", "I2", "I3", "I5"], // T800
    ["I1", "I2", "I3"], // T900
];

const minSupportCount = 2;

// Hình 6.2: L1, L2, L3 với min_sup = 2. C4 = rỗng nên thuật toán dừng.
const expectedFrequentItemsets = [
    { items: ["I1"], support: 6 },
    { items: ["I2"], support: 7 },
    { items: ["I3"], support: 6 },
    { items: ["I4"], support: 2 },
    { items: ["I5"], support: 2 },
    { items: ["I1", "I2"], support: 4 },
    { items: ["I1", "I3"], support: 4 },
    { items: ["I1", "I5"], support: 2 },
    { items: ["I2", "I3"], support: 4 },
    { items: ["I2", "I4"], support: 2 },
    { items: ["I2", "I5"], support: 2 },
    { items: ["I1", "I2", "I3"], support: 2 },
    { items: ["I1", "I2", "I5"], support: 2 },
];

// Ví dụ 6.3: C2 gồm C(5,2) = 10 cặp. Join L2 ⋈ L2 cho 6 tập,
// sau khi prune còn C3 = {{I1,I2,I3}, {I1,I2,I5}}. Join L3 cho {I1,I2,I3,I5},
// bị prune vì {I2,I3,I5} không phổ biến, nên C4 = rỗng.
const expectedAprioriLevels = [
    { k: 1, joined: null, candidates: null, frequent: 5 },
    { k: 2, joined: 10, candidates: 10, frequent: 6 },
    { k: 3, joined: 6, candidates: 2, frequent: 2 },
    { k: 4, joined: 1, candidates: 0, frequent: 0 },
];

// Hình 6.7: thứ tự L trong header table.
const expectedHeaderOrder = [
    { item: "I2", support: 7 },
    { item: "I1", support: 6 },
    { item: "I3", support: 6 },
    { item: "I4", support: 2 },
    { item: "I5", support: 2 },
];

// Hình 6.7: FP-tree đầy đủ (item:count và các con).
const expectedTree = {
    "I2:7": {
        "I1:4": {
            "I5:1": {},
            "I4:1": {},
            "I3:2": { "I5:1": {} },
        },
        "I4:1": {},
        "I3:2": {},
    },
    "I1:2": {
        "I3:2": {},
    },
};

// Bảng 6.2: conditional pattern base của từng item.
const expectedConditionalPatternBases = {
    I5: [
        { items: ["I2", "I1"], count: 1 },
        { items: ["I2", "I1", "I3"], count: 1 },
    ],
    I4: [
        { items: ["I2", "I1"], count: 1 },
        { items: ["I2"], count: 1 },
    ],
    I3: [
        { items: ["I2", "I1"], count: 2 },
        { items: ["I2"], count: 2 },
        { items: ["I1"], count: 2 },
    ],
    I1: [{ items: ["I2"], count: 4 }],
};

// Ví dụ 6.4: các luật sinh từ X = {I1, I2, I5}.
const expectedRulesFromI1I2I5 = [
    { antecedent: ["I1", "I2"], consequent: ["I5"], confidence: 2 / 4 }, // 50%
    { antecedent: ["I1", "I5"], consequent: ["I2"], confidence: 2 / 2 }, // 100%
    { antecedent: ["I2", "I5"], consequent: ["I1"], confidence: 2 / 2 }, // 100%
    { antecedent: ["I1"], consequent: ["I2", "I5"], confidence: 2 / 6 }, // 33%
    { antecedent: ["I2"], consequent: ["I1", "I5"], confidence: 2 / 7 }, // 29%
    { antecedent: ["I5"], consequent: ["I1", "I2"], confidence: 2 / 2 }, // 100%
];

module.exports = {
    transactions,
    minSupportCount,
    expectedFrequentItemsets,
    expectedAprioriLevels,
    expectedHeaderOrder,
    expectedTree,
    expectedConditionalPatternBases,
    expectedRulesFromI1I2I5,
};
