// Báo cáo Markdown cho Giai đoạn 4 – Bước 5 (M3: xếp hạng luật và đa dạng hóa Top-K) + bảng tổng hợp M1/M2/M3.

const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "–" : (x * 100).toFixed(d));
const pp = (x, d = 2) => (x === null || x === undefined ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}`);
const msd = (d, digits = 1) => (d && d.n ? `${pct(d.mean, digits)} ± ${pct(d.sd, digits)}` : "–");
const ci = (c) => (c && c.low !== null && c.low !== undefined ? `[${pct(c.low)}; ${pct(c.high)}]` : "–");
const NAMES = { r1: "R1", r1b: "R1b" };
const BASE_NAMES = { flat: "Luật một cấp", "m2-flat": "M2 một cấp", m1: "M1", "m2-m1": "M2 + M1" };

function sig(x) {
    return x ? `${x.seedsSignificantlyPositive} > 0 · ${x.seedsSignificantlyNegative} < 0` : "–";
}

function toMarkdownM3(result) {
    const { meta, settings, datasetCheck, failures, profiles } = result;
    const L = [];
    L.push("# Giai đoạn 4 – Bước 5: M3 — Xếp hạng luật kết hợp và đa dạng hóa Top-K", "");
    L.push(`Tạo lúc: ${meta.generatedAt} · Node ${meta.node} · \`${meta.command}\` · tổng ${meta.seconds.toFixed(0)} s (đánh giá ${meta.datasetSeconds.toFixed(0)} s).`, "");
    L.push("OFFLINE: dữ liệu sinh lại từ seed, không đọc `.env`, không kết nối MongoDB, không gọi API. Code M3 nằm trong `research/ranking/`; website, API, UI không đổi và chưa tích hợp M3.", "");

    L.push("## 1. Phương pháp và nguồn trong giáo trình", "");
    L.push("| Chiến lược | Điểm xếp hạng | Nguồn |", "|---|---|---|");
    L.push("| native | thứ tự gốc của phương pháp nền (website: confidence → lift → support; M1: policy đã chọn) | Chương 6 / Bước 3 |");
    L.push("| confidence | conf(X ⇒ q), hòa: lift, số đơn chung | mục 6.2.2, 6.3.2 |");
    L.push("| kulc-ir | Kulc(X, q) × (1 − β·IR(X, q)), β ∈ {0; 0,5; 1} | Kulc (6.11) và IR (6.13), mục 6.3.3 — giáo trình khuyến nghị dùng **cùng nhau**; **công thức gộp là lựa chọn của đồ án** |");
    L.push("| popularity | conf × P(q)^−γ, γ ∈ {0,25; 0,5; 0,75; 1} (γ = 1 chính là lift) | **không có trong giáo trình**; nội suy giữa confidence và lift (6.8) |");
    L.push("| đa dạng hóa λ | chọn tham lam λ·rel − (1 − λ)·[danh mục đã có], rel = 1 − thứ hạng/m; áp cho phần luật rồi phần fallback; λ ∈ {1; 0,9; 0,75; 0,5; 0,25} | **chuyển thể** ý tưởng \"redundancy-aware top-k / marginal relevance\" của mục 7.5.2 (vốn để chọn mẫu, không phải danh sách gợi ý) |", "");
    L.push("- Mọi chiến lược chỉ sắp xếp lại **cùng một tập ứng viên** (luật lift > 1, đã qua ràng buộc M2 nếu có). Thứ tự native được kiểm tra cho đúng y hệt phương pháp nền.");
    L.push("- Gợi ý từ luật luôn đứng trước; fallback (website, hoặc fallback có ràng buộc khi có M2) chỉ lấp chỗ còn trống và mang `source = \"fallback\"`. Mỗi lần chấm đều kiểm tra: mục \"luật\" phải có luật nguồn và thuộc tập ứng viên, mục fallback không được thuộc tập ứng viên.");
    L.push("- Mỗi gợi ý từ luật giữ: luật nguồn (vế trái, vế phải, loại cấp), support, confidence, lift, Kulc, IR, độ phổ biến, điểm của chiến lược, thứ hạng gốc và việc có bị phạt đa dạng hay không.");
    L.push(`- Chọn tham số hai giai đoạn, chỉ trên validation: (1) tham số nền như Bước 2–4; (2) tham số xếp hạng. **M3-R** = Recall@5 validation cao nhất; **M3-C** = Coverage validation cao nhất trong các cấu hình có Recall@5 validation ≥ tốt nhất − ${pct(settings.recallTolerance)} điểm (ngưỡng khai báo trước). Hòa: ưu tiên native và λ lớn.`);
    L.push(`- Đa dạng danh mục = số danh mục khác nhau / độ dài danh sách. Sản phẩm hiếm: < ${pct(settings.rareThreshold)}% số đơn lịch sử. KTC 95% bootstrap theo đơn (${settings.bootstrap} lần).`, "");

    L.push("## 2. Bộ dữ liệu và tham số được chọn", "");
    L.push(`Bộ sinh \`${settings.generatorVersion}\`; checksum ${datasetCheck.comparedWithStep2 ? (datasetCheck.allMatch ? "**trùng khớp** manifest Bước 2" : "**KHÔNG trùng** manifest Bước 2") : "chưa đối chiếu"}; dữ liệu demo GR2 ${datasetCheck.demoChecksumUnchanged ? "không đổi" : "ĐÃ ĐỔI"}.`, "");
    L.push("| Bộ | Checksum | Giây | M3-R trên một cấp | M3-C trên một cấp | M3-R trên M1 | M3-R trên M2 + M1 | M3-C trên M2 + M1 |", "|---|---|---:|---|---|---|---|---|");
    for (const agg of Object.values(profiles)) for (const d of agg.datasets) L.push(`| ${d.name} | \`${d.checksum.slice(0, 12)}…\` | ${d.seconds === null ? "–" : d.seconds.toFixed(1)} | ${d.selected.flat.R} | ${d.selected.flat.C} | ${d.selected.m1.R} | ${d.selected["m2-m1"].R} | ${d.selected["m2-m1"].C} |`);
    L.push("", "Checksum đầy đủ trong file JSON.", "");

    for (const [p, agg] of Object.entries(profiles)) {
        const name = NAMES[p] || p;
        L.push(`## 3. ${name}: bảng so sánh M1, M2, M3 và kết hợp (${agg.seeds.length} seed, TB ± SD, test)`, "");
        L.push("| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Đa dạng danh mục | Ô có SP hiếm | Có gợi ý từ luật | Ô từ luật | Hợp lý nghiệp vụ | Nhãn fallback sai |", "|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|");
        for (const m of agg.methods) {
            const x = m.metrics;
            L.push(`| ${m.label} | ${msd(x.precision)} | ${msd(x.recall)} | ${ci(m.orderBootstrap.recall)} | ${msd(x.hitRate)} | ${msd(x.coverage)} | ${msd(x.categoryDiversity)} | ${msd(x.rareSlotShare, 2)} | ${msd(x.ruleQueryRate)} | ${msd(x.ruleSlotShare)} | ${msd(x.plausibleItemRate)} | ${m.mislabeled} |`);
        }
        L.push("");
        const withRare = agg.methods.filter((m) => m.rare.seeds > 0);
        if (withRare.length) {
            L.push(`### ${name}: nhóm sản phẩm ít giao dịch (khi sản phẩm đang xem là sản phẩm hiếm)`, "");
            L.push("| Phương pháp | Recall@5 | KTC theo đơn | Hit@5 | Có gợi ý từ luật | Coverage nhóm | SP hiếm từng được gợi ý (toàn bộ test) |", "|---|---:|---|---:|---:|---:|---:|");
            for (const m of withRare) L.push(`| ${m.label} | ${msd(m.rare.recall)} | ${ci(m.rare.ci)} | ${msd(m.rare.hitRate)} | ${msd(m.rare.ruleQueryRate)} | ${msd(m.rare.coverage)} | ${msd(m.metrics.rareProductsRecommended)} |`);
            L.push("");
        } else L.push(`${name} không có sản phẩm nào dưới ngưỡng hiếm.`, "");

        L.push(`### ${name}: so sánh cặp (cùng truy vấn; số seed có KTC theo đơn > 0 / < 0)`, "");
        L.push("| So sánh | ΔRecall@5 | seed | ΔPrecision@5 | ΔHit@5 | ΔĐa dạng | ΔCoverage | ΔRecall nhóm hiếm | seed |", "|---|---:|---|---:|---:|---:|---:|---:|---|");
        const lab = (key) => (agg.methods.find((m) => m.key === key) || { label: key }).label;
        for (const pr of agg.pairs) {
            const a = pr.all;
            const r = pr.rare;
            L.push(`| ${lab(pr.a)} − ${lab(pr.b)} | ${pp(a.recall.diff.mean)} ± ${pct(a.recall.diff.sd, 2)} | ${sig(a.recall)} | ${pp(a.precision.diff.mean)} | ${pp(a.hit.diff.mean)} | ${pp(a.categoryDiversity.diff.mean, 1)} | ${pp(pr.coverageDiff.mean, 1)} ± ${pct(pr.coverageDiff.sd)} | ${r.recall ? `${pp(r.recall.diff.mean, 1)} ± ${pct(r.recall.diff.sd)}` : "–"} | ${r.recall ? sig(r.recall) : "–"} |`);
        }
        L.push("", "Đơn vị: điểm phần trăm.", "");

        L.push(`### ${name}: đánh đổi Recall – Coverage theo λ (chiến lược của M3-R; mô tả, KHÔNG dùng để chọn tham số)`, "");
        for (const [base, rows] of Object.entries(agg.tradeoff)) {
            L.push(`Nền **${BASE_NAMES[base]}**:`, "");
            L.push("| λ | Recall validation | Coverage validation | Recall test | Coverage test | Đa dạng danh mục test |", "|---:|---:|---:|---:|---:|---:|");
            for (const r of rows) L.push(`| ${r.lambda} | ${msd(r.validationRecall)} | ${msd(r.validationCoverage)} | ${msd(r.testRecall)} | ${msd(r.testCoverage)} | ${msd(r.testDiversity)} |`);
            L.push("");
        }
    }

    L.push("## 4. Chi phí", "");
    L.push("Thời gian tạo một danh sách (xếp hạng lại + fallback, không cache), trung bình qua seed và hồ sơ:", "");
    L.push("| Phương pháp | ms / danh sách |", "|---|---:|");
    const first = Object.values(profiles)[0];
    for (const m of first.methods.filter((x) => x.base)) {
        const all = Object.values(profiles).map((a) => a.methods.find((x) => x.key === m.key).rankMsPerList).filter((d) => d && d.n);
        L.push(`| ${m.label} | ${all.length ? (all.reduce((s, d) => s + d.mean, 0) / all.length).toFixed(3) : "–"} |`);
    }
    L.push("", "Chi phí khai phá không đổi so với nền (M3 không khai phá lại); xem benchmark Bước 2–4.", "");

    L.push("## 5. Kết luận (sinh tự động từ số liệu)", "");
    for (const [p, agg] of Object.entries(profiles)) {
        const name = NAMES[p] || p;
        const pr = (a, b) => agg.pairs.find((x) => x.a === a && x.b === b);
        for (const [a, b, text] of [
            ["flat:kulc-ir", "flat:native", "Kulc × (1 − β·IR)"],
            ["flat:popularity", "flat:native", "phạt phổ biến"],
            ["flat:diversified", "flat:native", "đa dạng hóa danh mục"],
            ["flat:m3R", "flat:native", "M3-R trên luật một cấp"],
            ["flat:m3C", "flat:native", "M3-C trên luật một cấp"],
            ["m1:m3R", "m1:native", "M3-R trên M1"],
            ["m2-m1:m3R", "m2-m1:native", "M3-R trên M2 + M1"],
            ["m2-m1:m3C", "m2-m1:native", "M3-C trên M2 + M1"],
        ]) {
            const x = pr(a, b);
            if (!x) continue;
            L.push(`- **${name}, ${text}** so với xếp hạng gốc: ΔRecall@5 ${pp(x.all.recall.diff.mean)} (${sig(x.all.recall)}), ΔCoverage ${pp(x.coverageDiff.mean, 1)}, ΔĐa dạng ${pp(x.all.categoryDiversity.diff.mean, 1)}${x.rare.recall ? `, ΔRecall nhóm hiếm ${pp(x.rare.recall.diff.mean, 1)} (${sig(x.rare.recall)})` : ""}.`);
        }
    }
    L.push("");

    L.push("## 6. Hạn chế", "");
    L.push("- Mỗi sản phẩm chỉ có vài ứng viên từ luật (thường ≤ 10), nên xếp hạng lại hầu như chỉ đổi THỨ TỰ trong Top-5; Precision/Recall@5 ít nhạy với thứ tự. Đánh giá theo thứ hạng (vd. MRR, NDCG) chưa được dùng.");
    L.push("- Đa dạng hóa tăng số danh mục khác nhau trong mỗi danh sách nhưng có thể làm GIẢM Coverage toàn danh mục: fallback \"cùng danh mục\" (trải ra nhiều sản phẩm) bị thay bằng vài sản phẩm bán chạy ở danh mục khác. Đa dạng trong một danh sách và độ phủ toàn danh mục là hai đại lượng khác nhau.");
    L.push("- Kulc và IR của ứng viên từ luật danh mục (M1) dùng số đơn chung ƯỚC LƯỢNG (điểm M1 × sup(ngữ cảnh)), không phải số đếm thật của cặp sản phẩm.");
    L.push("- Tham số chọn hai giai đoạn (nền rồi xếp hạng) có thể bỏ lỡ tổ hợp tốt hơn khi chọn đồng thời.");
    L.push("- Đa dạng hóa chỉ theo danh mục (10 danh mục); chưa xét thương hiệu hay khoảng giá. Dữ liệu vẫn là giả lập.");
    L.push("");
    if (failures.length) L.push(`⚠️ ${failures.length} bộ lỗi: ${failures.map((x) => `${x.name}: ${x.error}`).join("; ")}`, "");
    L.push("## 7. Tái lập", "", "```", "node scripts/evaluate-ranking.js", "node scripts/evaluate-ranking.js --profile r1b --seed 20261103", "node --test test/", "```", "");
    return L.join("\n");
}

module.exports = { toMarkdownM3 };
