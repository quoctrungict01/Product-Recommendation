// Báo cáo Markdown cho Giai đoạn 4 – Bước 4 (M2: khai phá mẫu phổ biến có ràng buộc).

const { RULE_CONSTRAINTS } = require("./business");

const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "–" : (x * 100).toFixed(d));
const pp = (x, d = 1) => (x === null || x === undefined ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}`);
const msd = (d, digits = 1) => (d && d.n ? `${pct(d.mean, digits)} ± ${pct(d.sd, digits)}` : "–");
const ci = (c) => (c && c.low !== null && c.low !== undefined ? `[${pct(c.low)}; ${pct(c.high)}]` : "–");
const num = (d, digits = 1) => (d && d.n ? d.mean.toFixed(digits) : "–");

const NAMES = { r1: "R1", r1b: "R1b" };
const PAIR_NAMES = {
    "m2-flat-with-fallback|tuned-with-fallback": "M2 một cấp − luật một cấp (cả hai + fallback, tham số validation)",
    "m2-m1-with-fallback|m1-with-fallback": "M2 + M1 − M1 (cả hai + fallback, tham số validation)",
    "m2-m1-with-fallback|tuned-with-fallback": "M2 + M1 − luật một cấp",
    "m2-flat-with-fallback|current-with-fallback": "M2 một cấp − hệ thống hiện tại",
};

function pairRows(L, pr, part, label) {
    const fields = [["recall", "ΔRecall@5"], ["precision", "ΔPrecision@5"], ["hit", "ΔHit@5"], ["plausible", "ΔTỷ lệ gợi ý hợp lý"]];
    const x = pr[part];
    if (!x.recall) return;
    L.push(`| ${label} | ${fields.map(([f]) => `${pp(x[f].diff.mean, 2)} ± ${pct(x[f].diff.sd, 2)}`).join(" | ")} | ${x.recall.seedsSignificantlyPositive}/${x.recall.seeds} KTC > 0 · ${x.recall.seedsSignificantlyNegative}/${x.recall.seeds} KTC < 0 |`);
}

function toMarkdownM2(result, benchmark) {
    const { meta, settings, datasetCheck, failures, profiles } = result;
    const L = [];
    L.push("# Giai đoạn 4 – Bước 4: M2 — Khai phá mẫu phổ biến có ràng buộc (mục 7.3)", "");
    L.push(`Tạo lúc: ${meta.generatedAt} · Node ${meta.node} · \`${meta.command}\` · tổng ${meta.seconds.toFixed(0)} s (đánh giá ${meta.datasetSeconds.toFixed(0)} s).`, "");
    L.push("OFFLINE: dữ liệu sinh lại từ seed, không đọc `.env`, không kết nối MongoDB, không gọi API. Code M2 nằm trong `research/constraints/`; Apriori/FP-Growth trong `src/` không bị sửa. API, UI và tham số website không đổi.", "");

    L.push("## 1. Phân loại ràng buộc (mục 7.3.2, Bảng 7.2) và cách áp dụng", "");
    L.push("| Ràng buộc | Mức | Tính chất | Áp dụng |", "|---|---|---|---|");
    for (const c of RULE_CONSTRAINTS) L.push(`| ${c.id}: ${c.text} | M2-A (luật) | ${c.kind} | lọc luật và fallback khi xếp hạng |`);
    L.push("| B1: count(S) ≤ 2 (suy từ A1) | M2-B (tập mục) | anti-monotone, weakly succinct | **cắt tỉa trong khai phá** |");
    L.push("| B2: count(S ∩ điện thoại) ≤ 1 (suy từ A2) | M2-B | anti-monotone | **cắt tỉa trong khai phá** |");
    L.push("| B3: không có cặp không tương thích (suy từ A3) | M2-B | anti-monotone (cặp xung đột còn trong mọi tập cha) | **cắt tỉa trong khai phá** (FP-Growth: cả cắt tỉa dữ liệu trong cơ sở mẫu điều kiện) |");
    L.push("| Không có item cùng tổ tiên (cấp đa mức) | M2-B | anti-monotone | **cắt tỉa trong khai phá** (thay bước bỏ tập tầm thường của M1) |");
    L.push("| A4 \"còn hàng\" dạng S ⊆ còn hàng | – | anti-monotone, succinct | **không đẩy**: sản phẩm đang xem có thể hết hàng mà vẫn cần luật; A4 chỉ áp cho vế phải |");
    L.push("| \"S chứa ít nhất một phụ kiện\" (S ∩ V ≠ ∅), sum ≥ v, avg ≤ v | – | monotone / convertible | không cắt tỉa trực tiếp được — chỉ có test minh họa, không dùng |", "");
    L.push("Ràng buộc A1–A3 là ràng buộc luật; B1–B3 là điều kiện cần của chúng trên tập mục. Vì B1–B3 anti-monotone, mọi tập con của tập thỏa ràng buộc cũng thỏa, nên support cần cho confidence luôn có sẵn và luật 1 ⇒ 1 thu được **không đổi** so với hậu lọc (có test và kiểm tra lúc chạy).", "");
    L.push("Tri thức nghiệp vụ được khai báo, không suy từ bộ sinh dữ liệu: danh mục điện thoại = iPhone, Samsung, Xiaomi, OPPO, Vivo, Nokia; ốp lưng/kính cường lực gắn với dòng máy trong tên (\"Ốp lưng silicon iPhone 15\" chỉ hợp \"iPhone 15 …\"); sạc, cáp, tai nghe, pin dùng chuẩn chung nên hợp với mọi máy.", "");
    L.push(`Giao thức như Bước 1–3: chia theo thời gian ${settings.ratios.train}/${settings.ratios.validation}/${settings.ratios.test}, Top-${settings.k}, tham số mọi phương pháp chọn trên validation (lưới như Bước 2–3), chấm test một lần, KTC 95% bootstrap theo **đơn hàng** (${settings.bootstrap} lần). **Mức hợp lý nghiệp vụ** = tỷ lệ sản phẩm gợi ý thỏa A2–A4 với sản phẩm đang xem. Chỉ số này dùng chính các ràng buộc của M2, nên M2 đạt 100% theo cách xây dựng; ý nghĩa của nó là cho thấy các phương pháp khác gợi ý bao nhiêu sản phẩm không hợp lý.`, "");

    L.push("## 2. Bộ dữ liệu", "");
    L.push(`Bộ sinh \`${settings.generatorVersion}\`; checksum ${datasetCheck.comparedWithStep2 ? (datasetCheck.allMatch ? "**trùng khớp** manifest Bước 2" : "**KHÔNG trùng** manifest Bước 2") : "chưa đối chiếu"}; dữ liệu demo GR2 ${datasetCheck.demoChecksumUnchanged ? "không đổi" : "ĐÃ ĐỔI"}.`, "");
    L.push("| Bộ | Checksum | Giây | Một cấp (sup, conf) | M2 một cấp (sup, conf) | M2 + M1 (sp/dm, conf, policy) | Cắt tỉa = hậu lọc (một cấp / đa mức) |", "|---|---|---:|---|---|---|:---:|");
    for (const agg of Object.values(profiles)) {
        for (const d of agg.datasets) {
            const t = d.tuning;
            L.push(`| ${d.name} | \`${d.checksum}\` | ${d.seconds === null ? "–" : d.seconds.toFixed(1)} | ${t.flat.selected.minSupport}, ${t.flat.selected.minConfidence} | ${t.m2Flat.selected.minSupport}, ${t.m2Flat.selected.minConfidence} | ${t.m2M1.selected.productMinSupport}/${t.m2M1.selected.categoryMinSupport}, ${t.m2M1.selected.minConfidence}, ${t.m2M1.selected.policy} | ${d.pushEqualsPost.flat ? "✔" : "✘"} / ${d.pushEqualsPost.multilevel ? "✔" : "✘"} |`);
        }
    }
    L.push("");

    for (const [p, agg] of Object.entries(profiles)) {
        const name = NAMES[p] || p;
        L.push(`## 3. ${name}: toàn bộ truy vấn test (${agg.seeds.length} seed, TB ± SD)`, "");
        L.push("| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Có gợi ý từ luật | Gợi ý hợp lý nghiệp vụ | Truy vấn có cả 5 gợi ý hợp lý |", "|---|---:|---:|---|---:|---:|---:|---:|---:|");
        for (const m of agg.methods) {
            L.push(`| ${m.label} | ${msd(m.metrics.precision)} | ${msd(m.metrics.recall)} | ${ci(m.orderBootstrap.recall)} | ${msd(m.metrics.hitRate)} | ${msd(m.metrics.coverage)} | ${msd(m.metrics.ruleQueryRate)} | ${msd(m.metrics.plausibleItemRate)} | ${msd(m.metrics.allPlausibleQueryRate)} |`);
        }
        L.push("", "Số gợi ý vi phạm (trung bình mỗi seed, trên toàn bộ danh sách test):", "");
        L.push("| Phương pháp | A2 điện thoại ⇒ điện thoại | A3 không tương thích |", "|---|---:|---:|");
        for (const m of agg.methods) L.push(`| ${m.label} | ${num(m.violations["A2-điện-thoại⇒điện-thoại"], 0)} | ${num(m.violations["A3-không-tương-thích"], 0)} |`);
        L.push("");

        L.push(`### ${name}: nhóm sản phẩm ít giao dịch`, "");
        const ref = agg.methods[0].rare;
        if (!ref.seedsWithQueries) L.push(`Không có sản phẩm nào dưới ngưỡng ${pct(settings.rareThreshold)}% số đơn lịch sử ở ${name}.`, "");
        else {
            L.push(`${ref.seedsWithQueries}/${agg.seeds.length} seed có truy vấn hiếm, trung bình ${ref.queries.mean.toFixed(0)} truy vấn/seed.`, "");
            L.push("| Phương pháp | Recall@5 | KTC theo đơn | Hit@5 | Coverage nhóm | Có gợi ý từ luật | Gợi ý hợp lý | SP hiếm được gợi ý | Recall gộp |", "|---|---:|---|---:|---:|---:|---:|---:|---:|");
            for (const m of agg.methods) {
                const r = m.rare;
                L.push(`| ${m.label} | ${msd(r.recall)} | ${ci(r.orderBootstrap && r.orderBootstrap.recall)} | ${msd(r.hitRate)} | ${msd(r.coverage)} | ${msd(r.ruleQueryRate)} | ${msd(r.plausibleItemRate)} | ${msd(r.rareProductsRecommended)} | ${pct(r.pooledRecall)} |`);
            }
            L.push("");
        }

        L.push(`### ${name}: so sánh cặp (cùng truy vấn; KTC bootstrap theo đơn trong từng seed)`, "");
        L.push("| So sánh | ΔRecall@5 | ΔPrecision@5 | ΔHit@5 | ΔTỷ lệ gợi ý hợp lý | Số seed có ý nghĩa (Recall) |", "|---|---:|---:|---:|---:|---|");
        for (const pr of agg.pairs) {
            const nm = PAIR_NAMES[`${pr.a}|${pr.b}`] || `${pr.a} − ${pr.b}`;
            pairRows(L, pr, "all", `${nm} — toàn bộ`);
            pairRows(L, pr, "rare", `${nm} — **nhóm hiếm**`);
        }
        L.push("", "Đơn vị: điểm phần trăm; TB ± SD qua seed.", "");

        const cc = agg.constraintCheck;
        L.push(`### ${name}: cắt tỉa ↔ hậu lọc trong lần chạy đánh giá (tham số M2 đã chọn, train ∪ validation)`, "");
        L.push(`Tập mục và danh sách gợi ý giống hệt ở ${cc.identicalFlat}/${cc.n} seed (một cấp) và ${cc.identicalMultilevel}/${cc.n} seed (đa mức), cho cả Apriori và FP-Growth. Thời gian dưới đây đo trong tiến trình đánh giá (5 lần, trung vị), chỉ để tham khảo; số đo có kiểm soát ở mục 4.`, "");
        L.push("| Cấp | Biến thể | Khai phá ms | Tập giữ | Candidate được đếm (Apriori) | Bị loại trước khi đếm | Cây điều kiện (FP) | Item bỏ khỏi cơ sở mẫu |", "|---|---|---:|---:|---:|---:|---:|---:|");
        for (const [part, variants] of Object.entries(cc.parts)) {
            for (const [v, x] of Object.entries(variants)) L.push(`| ${part === "flat" ? "một cấp" : "đa mức"} | ${v} | ${num(x.medianMiningMs)} | ${num(x.itemsets, 0)} | ${num(x.totalCandidates, 0)} | ${num(x.prunedByConstraint, 0)} | ${num(x.conditionalTrees, 0)} | ${num(x.prunedBaseItems, 0)} |`);
        }
        L.push("");
    }

    L.push("## 4. Chi phí khai phá có kiểm soát (benchmark riêng)", "");
    if (benchmark) {
        L.push(`\`${benchmark.meta.command}\` · ${benchmark.meta.cpu} · Node ${benchmark.meta.node} · ${benchmark.settings.runs} lần/lượt, mỗi lượt một tiến trình con, cùng ${benchmark.settings.historyOrders} đơn lịch sử. Chi tiết: \`phase4-step4-m2-benchmark.md\`.`, "");
        L.push("| Hồ sơ | min_sup | Cấp | Apriori: hậu lọc → cắt tỉa ms (candidate đếm) | FP-Growth: hậu lọc → cắt tỉa ms | Thời gian lọc (A / FP) ms | Phần bao không ràng buộc A / FP ms (gốc) | Trùng |", "|---|---:|---|---|---|---|---|:---:|");
        for (const s of benchmark.summary) {
            const a = s.apriori;
            const f = s.fpgrowth;
            L.push(`| ${s.profile} | ${s.minSupport} | ${s.level === "flat" ? "một cấp" : "đa mức"} | ${num(a.postMs)} → ${num(a.pushMs)} (${num(a.postCounted, 0)} → ${num(a.pushCounted, 0)}) | ${num(f.postMs)} → ${num(f.pushMs)} | ${num(a.postFilterMs, 2)} / ${num(f.postFilterMs, 2)} | ${num(a.wrapperNoConstraintMs)} (${num(a.postMineMs)}) / ${num(f.wrapperNoConstraintMs)} (${num(f.postMineMs)}) | ${s.allIdentical ? "✔" : "✘"} |`);
        }
        L.push("");
    } else L.push("Chưa có `phase4-step4-m2-benchmark.json` — chạy `node scripts/benchmark-constraints.js`.", "");

    L.push("## 5. Kết luận (sinh tự động từ số liệu)", "");
    for (const [p, agg] of Object.entries(profiles)) {
        const name = NAMES[p] || p;
        const get = (key) => agg.methods.find((m) => m.key === key);
        const pair = (a, b) => agg.pairs.find((x) => x.a === a && x.b === b);
        const f = pair("m2-flat-with-fallback", "tuned-with-fallback");
        const m = pair("m2-m1-with-fallback", "m1-with-fallback");
        L.push(`- **${name}**: gợi ý hợp lý nghiệp vụ tăng từ ${pct(get("tuned-with-fallback").metrics.plausibleItemRate.mean)}% (luật một cấp) / ${pct(get("m1-with-fallback").metrics.plausibleItemRate.mean)}% (M1) lên 100% (M2, theo cách xây dựng). ΔRecall@5 M2 một cấp − luật một cấp = ${pp(f.all.recall.diff.mean, 2)} điểm (${f.all.recall.seedsSignificantlyPositive}/${f.all.recall.seeds} seed KTC > 0, ${f.all.recall.seedsSignificantlyNegative}/${f.all.recall.seeds} KTC < 0); M2 + M1 − M1 = ${pp(m.all.recall.diff.mean, 2)} điểm (${m.all.recall.seedsSignificantlyPositive} > 0, ${m.all.recall.seedsSignificantlyNegative} < 0). Coverage: ${pct(get("tuned-with-fallback").metrics.coverage.mean)}% → ${pct(get("m2-flat-with-fallback").metrics.coverage.mean)}% (một cấp), ${pct(get("m1-with-fallback").metrics.coverage.mean)}% → ${pct(get("m2-m1-with-fallback").metrics.coverage.mean)}% (M1).`);
        if (f.rare.recall) L.push(`- **${name}, nhóm hiếm**: ΔRecall@5 M2 một cấp − luật một cấp = ${pp(f.rare.recall.diff.mean)} điểm (${f.rare.recall.seedsSignificantlyPositive}/${f.rare.recall.seeds} KTC > 0, ${f.rare.recall.seedsSignificantlyNegative} KTC < 0); M2 + M1 − M1 = ${pp(m.rare.recall.diff.mean)} điểm (${m.rare.recall.seedsSignificantlyPositive}/${m.rare.recall.seeds} KTC > 0, ${m.rare.recall.seedsSignificantlyNegative} KTC < 0).`);
    }
    L.push("");

    L.push("## 6. Hạn chế", "");
    L.push("- Mức hợp lý nghiệp vụ dùng đúng các ràng buộc của M2, nên M2 đạt 100% theo định nghĩa; đây không phải bằng chứng độc lập rằng gợi ý \"tốt hơn\" với khách hàng thật.");
    L.push("- Tương thích chỉ suy từ tên sản phẩm (dòng máy trong tên ốp/kính); danh mục không có thuộc tính tương thích. Sạc/cáp/pin được coi là hợp mọi máy — giả định nghiệp vụ, chưa kiểm chứng.");
    L.push("- Ground truth là đơn giả lập; nếu bộ sinh có cặp \"không hợp lý\" (vd. điện thoại mua kèm điện thoại trong đơn nhiễu), M2 sẽ bị tính trượt các cặp đó — đây là chi phí thật của ràng buộc và được giữ nguyên, không sửa dữ liệu.");
    L.push("- Mức tăng Recall ở nhóm hiếm của M2 một cấp đến từ **fallback có ràng buộc**, không phải từ luật: M2 một cấp chỉ dùng luật có Recall nhóm hiếm đúng bằng luật một cấp (cùng luật sản phẩm ⇒ sản phẩm). Khi xem điện thoại hiếm, fallback của website gợi ý điện thoại cùng hãng (không bao giờ trúng), còn fallback có ràng buộc gợi ý phụ kiện tương thích bán chạy.");
    L.push("- Cắt tỉa (M2-B) không làm thay đổi chất lượng gợi ý — theo lý thuyết và theo kiểm tra, nó cho đúng cùng kết quả với hậu lọc; khác biệt chỉ nằm ở chi phí khai phá.");
    L.push("- Tỷ lệ sản phẩm hiếm từng được gợi ý (khi là đáp án) giảm so với luật một cấp + fallback, và Coverage nhóm hiếm thấp.");
    L.push("- Fallback có ràng buộc thu hẹp tập ứng viên (không còn \"điện thoại cùng hãng\" khi xem điện thoại), nên Coverage giảm.");
    L.push("- Ràng buộc chỉ cắt tỉa được rất ít trên giao dịch một cấp ngắn (tập phổ biến đã nhỏ); lợi ích tốc độ chỉ rõ ở Apriori trên giao dịch đa mức. FP-Growth có cắt tỉa có thể chậm hơn hậu lọc vì phải kiểm tra ràng buộc cho từng item của cơ sở mẫu điều kiện.");
    L.push("- Tham số tốt nhất vẫn ở biên dưới lưới (0,002 — giới hạn API).");
    L.push("");
    if (failures.length) L.push(`⚠️ ${failures.length} bộ lỗi: ${failures.map((x) => `${x.name}: ${x.error}`).join("; ")}`, "");
    L.push("## 7. Tái lập", "", "```", "node scripts/benchmark-constraints.js", "node scripts/evaluate-constraints.js", "node scripts/evaluate-constraints.js --profile r1b --seed 20261103", "node --test test/", "```", "");
    return L.join("\n");
}

module.exports = { toMarkdownM2 };
