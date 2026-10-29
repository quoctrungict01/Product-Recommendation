// Sinh dữ liệu giao dịch giả, tái lập được nhờ seed cố định.
// Chỉ tạo mảng trong bộ nhớ, không ghi vào cơ sở dữ liệu.
//
// Mô hình (giản lược từ bộ sinh IBM Quest thường dùng để đo Apriori/FP-Growth):
// - Danh mục có `itemCount` sản phẩm, độ phổ biến theo phân phối Zipf (vài sản phẩm bán rất chạy).
// - Có `patternCount` "combo" cài sẵn (ví dụ điện thoại + ốp lưng + cường lực),
//   mỗi giao dịch có xác suất `patternProbability` chứa một combo
//   (mỗi item của combo được giữ lại với xác suất `patternKeep`).
// - Kích thước giỏ còn lại theo phân phối Poisson với trung bình `avgBasketSize`.

/** PRNG mulberry32: nhanh, đủ tốt cho mô phỏng, cho kết quả giống nhau với cùng seed. */
function createRandom(seed) {
    let a = seed >>> 0;
    return function random() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function poisson(random, mean) {
    // Thuật toán Knuth, phù hợp với mean nhỏ (kích thước giỏ hàng).
    const limit = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
        k++;
        p *= random();
    } while (p > limit);
    return k - 1;
}

function itemName(index) {
    return `P${String(index).padStart(4, "0")}`;
}

/**
 * @returns {{transactions: string[][], patterns: string[][], config: object}}
 */
function generateTransactions(config = {}) {
    const {
        seed = 42,
        transactionCount = 1000,
        itemCount = 200,
        avgBasketSize = 4,
        zipfExponent = 1.0,
        patternCount = 10,
        patternSize = [2, 4],
        patternProbability = 0.3,
        patternKeep = 0.9,
    } = config;

    const random = createRandom(seed);

    // Bảng phân phối tích lũy Zipf để chọn sản phẩm theo độ phổ biến.
    const weights = [];
    let total = 0;
    for (let i = 1; i <= itemCount; i++) {
        total += 1 / Math.pow(i, zipfExponent);
        weights.push(total);
    }
    const pickItem = () => {
        const r = random() * total;
        let lo = 0;
        let hi = weights.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (weights[mid] < r) lo = mid + 1;
            else hi = mid;
        }
        return itemName(lo + 1);
    };

    const patterns = [];
    for (let p = 0; p < patternCount; p++) {
        const size = patternSize[0] + Math.floor(random() * (patternSize[1] - patternSize[0] + 1));
        const set = new Set();
        while (set.size < Math.min(size, itemCount)) set.add(pickItem());
        patterns.push([...set].sort());
    }

    const transactions = [];
    for (let t = 0; t < transactionCount; t++) {
        const basket = new Set();
        if (patterns.length > 0 && random() < patternProbability) {
            const pattern = patterns[Math.floor(random() * patterns.length)];
            for (const item of pattern) if (random() < patternKeep) basket.add(item);
        }
        const extra = Math.max(basket.size === 0 ? 1 : 0, poisson(random, avgBasketSize));
        for (let i = 0; i < extra; i++) basket.add(pickItem());
        transactions.push([...basket].sort());
    }

    return {
        transactions,
        patterns,
        config: {
            seed,
            transactionCount,
            itemCount,
            avgBasketSize,
            zipfExponent,
            patternCount,
            patternSize,
            patternProbability,
            patternKeep,
        },
    };
}

module.exports = {
    createRandom,
    generateTransactions,
};
