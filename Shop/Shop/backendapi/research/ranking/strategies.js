// M3 — xếp hạng lại ứng viên từ luật và đa dạng hóa Top-K (chỉ nghiên cứu offline).
//
// Nguồn trong giáo trình:
//  - Kulczynski (6.11) và Imbalance Ratio (6.13), mục 6.3.3: hai độ đo null-invariant, giáo trình KHUYẾN NGHỊ
//    dùng Kulc cùng IR để trình bày quan hệ giữa hai tập. Giáo trình KHÔNG định nghĩa công thức gộp hai độ đo;
//    điểm kulc × (1 − β·IR) dưới đây là lựa chọn của đồ án, β được chọn trên validation (β = 0 là Kulc thuần).
//  - Mục 7.5.2 (redundancy-aware top-k patterns) đặt bài toán chọn k mẫu vừa có ý nghĩa cao vừa ít dư thừa,
//    quy về "marginal significance/relevance" của truy hồi thông tin. Giáo trình áp dụng cho việc chọn MẪU;
//    việc đa dạng hóa DANH MỤC trong danh sách gợi ý dưới đây là phép chuyển thể của đồ án theo tinh thần đó
//    (chọn tham lam kiểu MMR), không phải thuật toán nguyên bản trong sách.
//  - Phạt độ phổ biến (conf × P(q)^−γ) không có trong giáo trình; với γ = 1 nó chính là lift (6.8), với γ = 0 là
//    confidence, nên γ nội suy giữa hai độ đo của Chương 6.
//
// Mọi chiến lược chỉ SẮP XẾP LẠI cùng một tập ứng viên (luật lift > 1, đã qua ràng buộc nếu có), nên khác biệt
// chỉ do thứ tự; fallback luôn được thêm SAU các gợi ý từ luật và được đánh dấu source = "fallback".

const { ruleMeasures } = require("../../src/apps/services/mining/rules");

const STRATEGIES = ["native", "confidence", "kulc-ir", "popularity"];
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Độ đo của cặp (ngữ cảnh X, sản phẩm q): J = số đơn (ước lượng) chứa cả X và q.
 * Với luật sản phẩm ⇒ sản phẩm, J là support count thật; với luật có danh mục (M1), J = điểm M1 × sup(X).
 */
function candidateMeasures(c, n) {
    const m = ruleMeasures(c.joint, c.supX, c.supQ, n);
    return { confidence: m.confidence, lift: m.lift, kulczynski: m.kulczynski, imbalanceRatio: m.imbalanceRatio, popularity: c.supQ / n, jointCount: c.joint };
}

/** Điểm của một ứng viên theo chiến lược. */
function scoreOf(strategy, m, { beta = 0, gamma = 0 } = {}) {
    if (strategy === "confidence") return m.confidence;
    if (strategy === "kulc-ir") return m.kulczynski * (1 - beta * m.imbalanceRatio);
    if (strategy === "popularity") return m.confidence * Math.pow(m.popularity, -gamma);
    throw new RangeError(`Chiến lược không hỗ trợ: ${strategy}`);
}

/** Sắp xếp ứng viên theo chiến lược. "native" giữ thứ tự của phương pháp gốc (website / M1 / M2). */
function rankCandidates(candidates, n, params) {
    const { strategy = "native" } = params;
    if (!STRATEGIES.includes(strategy)) throw new RangeError(`Chiến lược không hỗ trợ: ${strategy}`);
    const rows = candidates.map((c, i) => {
        const measures = candidateMeasures(c, n);
        return { ...c, nativeRank: i, measures, score: strategy === "native" ? null : scoreOf(strategy, measures, params) };
    });
    if (strategy === "native") return rows;
    return rows.sort(
        (a, b) =>
            (Math.abs(b.score - a.score) > 1e-12 ? b.score - a.score : 0) ||
            b.measures.lift - a.measures.lift ||
            b.measures.jointCount - a.measures.jointCount ||
            a.nativeRank - b.nativeRank ||
            byId(a.productId, b.productId)
    );
}

/**
 * Chọn Top-K có đa dạng hóa danh mục (tham lam, kiểu MMR):
 *   chọn ứng viên có  λ·rel(i) − (1 − λ)·[danh mục của i đã có trong danh sách]  lớn nhất,
 *   rel(i) = 1 − rank(i)/m  (m = số ứng viên) — dựa trên thứ hạng nên không phụ thuộc thang điểm của chiến lược.
 * λ = 1: không đa dạng hóa (giữ nguyên thứ tự). Hòa: thứ hạng tốt hơn.
 */
function diversifiedTopK(ranked, k, lambda, categoryOf) {
    if (!(lambda >= 0 && lambda <= 1)) throw new RangeError("λ phải trong [0, 1].");
    const m = ranked.length;
    if (lambda === 1 || m <= 1) return ranked.slice(0, k).map((x, i) => ({ ...x, finalRank: i, diversityPenalty: 0 }));
    const left = ranked.map((x, i) => ({ x, rank: i }));
    const chosen = [];
    const usedCategories = new Set();
    while (chosen.length < k && left.length) {
        let bestIdx = 0;
        let bestValue = -Infinity;
        for (let j = 0; j < left.length; j++) {
            const { x, rank } = left[j];
            const penalty = usedCategories.has(categoryOf(x.productId)) ? 1 : 0;
            const value = lambda * (1 - rank / m) - (1 - lambda) * penalty;
            if (value > bestValue + 1e-12) {
                bestValue = value;
                bestIdx = j;
            }
        }
        const [{ x, rank }] = left.splice(bestIdx, 1);
        const penalty = usedCategories.has(categoryOf(x.productId)) ? 1 : 0;
        chosen.push({ ...x, baseRank: rank, finalRank: chosen.length, diversityPenalty: penalty });
        usedCategories.add(categoryOf(x.productId));
    }
    return chosen;
}

module.exports = { STRATEGIES, candidateMeasures, scoreOf, rankCandidates, diversifiedTopK };
