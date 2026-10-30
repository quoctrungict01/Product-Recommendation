// Xuất báo cáo Markdown từ kết quả runEvaluation().

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const ci = (c) => `${pct(c.mean)} [${pct(c.low)}; ${pct(c.high)}]`;
const signedPp = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;
const date = (t) => new Date(t).toISOString().slice(0, 10);

function toMarkdown(report, meta = {}) {
    const { dataset, settings, split, tuning, results, comparisons, algorithmCheck } = report;
    const L = [];
    L.push("# Giai đoạn 4 – Bước 1: Đánh giá offline hệ thống gợi ý và baseline", "");
    if (meta.generatedAt) L.push(`Tạo lúc: ${meta.generatedAt} · Node ${meta.node} · lệnh: \`${meta.command}\``, "");

    L.push("> **Dữ liệu giả lập.** Bộ dữ liệu được sinh bởi `scripts/seed-demo` với các luật mua kèm cài sẵn.", "> Kết quả dưới đây đo khả năng *tìm lại các mẫu đã cài*, không phản ánh hành vi khách hàng thật.", "");

    L.push("## 1. Dữ liệu", "");
    L.push(`- Bộ dữ liệu: **${dataset.name}** — nguồn: ${dataset.source}`);
    L.push(`- Seed: ${dataset.seed} · ${dataset.orderCount} đơn · ${dataset.productCount} sản phẩm · checksum đơn hàng (SHA-1): \`${dataset.checksum}\``);
    L.push("- Tái tạo offline trong bộ nhớ; không kết nối, không ghi MongoDB GR2.", "");

    L.push("## 2. Chia dữ liệu theo thời gian và giao thức", "");
    L.push("| Tập | Đơn | Đơn có ≥ 2 sản phẩm | Truy vấn (lượt thử) | Khoảng thời gian |", "|---|---:|---:|---:|---|");
    for (const name of ["train", "validation", "test"]) {
        const s = split[name];
        L.push(`| ${name} | ${s.orders} | ${s.ordersWithAtLeast2Items} | ${name === "train" ? "–" : s.queries} | ${date(s.range.from)} → ${date(s.range.to)} |`);
    }
    L.push("");
    L.push(`Tỷ lệ ${settings.ratios.train} / ${settings.ratios.validation} / ${settings.ratios.test}. Đơn cùng thời điểm không bị tách qua ranh giới.`, "");
    L.push("**Giao thức (che giấu từng sản phẩm):** với mỗi đơn đánh giá có ≥ 2 sản phẩm khác nhau, lần lượt lấy một sản phẩm q làm “sản phẩm đang xem”; các sản phẩm còn lại của đơn là đáp án. Mỗi phương pháp gợi ý Top-" + settings.k + " không chứa q. Đơn chỉ có 1 sản phẩm không tạo truy vấn.", "");
    L.push("**Chống rò rỉ dữ liệu:**");
    for (const c of split.leakageChecks) L.push(`- ${c}`);
    L.push("- Khi chọn tham số: mọi phương pháp chỉ học từ **train**. Khi chấm test: học từ **train ∪ validation** (đều xảy ra trước test).");
    L.push("- Số lượng bán (Most Popular, Category-Based, fallback) và luật đều tính từ lịch sử được phép; không dùng cache của website.", "");

    L.push("## 3. Định nghĩa chỉ số", "");
    L.push(`- **Precision@${settings.k}** = số gợi ý trúng / ${settings.k} (danh sách ngắn hơn ${settings.k} vẫn chia cho ${settings.k}).`);
    L.push(`- **Recall@${settings.k}** = số gợi ý trúng / số đáp án của truy vấn.`);
    L.push(`- **Hit Rate@${settings.k}** = tỷ lệ truy vấn có ít nhất một gợi ý trúng.`);
    L.push(`- **Coverage** = số sản phẩm khác nhau từng được gợi ý trên tập test / ${dataset.productCount} sản phẩm.`);
    L.push("- **Truy vấn có gợi ý từ luật** = tỷ lệ truy vấn có ít nhất một gợi ý `source = association-rule`.");
    L.push("- **Độ dài TB** = số gợi ý trung bình mỗi truy vấn.");
    L.push(`- Khoảng tin cậy ${pct(0.95, 0)}: bootstrap ${settings.bootstrap} lần theo cụm đơn hàng (seed ${settings.bootstrapSeed}), vì các truy vấn từ cùng một đơn không độc lập.`, "");

    L.push("## 4. Chọn tham số trên validation", "");
    L.push(`- Lưới: minSupport ∈ {${settings.grid.minSupport.join(", ")}} × minConfidence ∈ {${settings.grid.minConfidence.join(", ")}} (${tuning.rows.length} bộ).`);
    L.push(`- Mục tiêu: ${tuning.objective}.`);
    L.push(`- **Chọn: minSupport = ${tuning.selected.minSupport}, minConfidence = ${tuning.selected.minConfidence}.**` + (tuning.selectedOnGridEdge.length ? ` ⚠️ ${tuning.selectedOnGridEdge.join("; ")}.` : " Không nằm ở biên lưới."));
    L.push(`- Validation chỉ có ${split.validation.queries} truy vấn từ ${split.validation.ordersWithAtLeast2Items} đơn, nên việc chọn tham số còn nhiễu. 5 bộ tốt nhất:`, "");
    L.push("| minSupport | minConfidence | Recall@5 | Hit Rate@5 | Precision@5 |", "|---:|---:|---:|---:|---:|");
    for (const r of tuning.top5) L.push(`| ${r.minSupport} | ${r.minConfidence} | ${pct(r.recall)} | ${pct(r.hitRate)} | ${pct(r.precision)} |`);
    L.push("", `Tham số mặc định của website (minSupport ${settings.websiteDefaults.minSupport}, minConfidence ${settings.websiteDefaults.minConfidence}) được đánh giá **nguyên trạng**, không chỉnh theo test.`, "");

    L.push(`## 5. Kết quả trên tập test (${split.test.queries} truy vấn từ ${split.test.ordersWithAtLeast2Items} đơn)`, "");
    L.push(`| Phương pháp | Precision@${settings.k} | Recall@${settings.k} | Hit Rate@${settings.k} | Coverage | Truy vấn có gợi ý từ luật | Độ dài TB |`, "|---|---:|---:|---:|---:|---:|---:|");
    for (const r of results) {
        const s = r.summary;
        L.push(`| ${r.label} | ${ci(r.ci.precision)} | ${ci(r.ci.recall)} | ${ci(r.ci.hit)} | ${pct(s.coverage)} (${s.recommendedProducts}) | ${pct(s.ruleQueryRate)} | ${s.avgListLength.toFixed(2)} |`);
    }
    L.push("", "Số trong ngoặc vuông là khoảng tin cậy 95%. Coverage kèm số sản phẩm khác nhau được gợi ý.", "");
    L.push("**“Chỉ luật” và “luật + fallback”:** dòng “chỉ luật” chỉ giữ gợi ý `association-rule` (danh sách có thể ngắn hơn 5); dòng “+ fallback” bổ sung cùng danh mục rồi bán chạy, đúng như website hiển thị.", "");

    L.push("### So sánh cặp trên cùng truy vấn (chênh lệch điểm phần trăm, KTC 95%)", "");
    L.push("| A | B | Δ Recall@5 | Δ Hit Rate@5 |", "|---|---|---:|---:|");
    for (const c of comparisons) {
        const fmt = (d) => `${signedPp(d.mean)} [${signedPp(d.low)}; ${signedPp(d.high)}]` + (d.low > 0 || d.high < 0 ? "" : " (chưa phân biệt được)");
        L.push(`| ${c.a} | ${c.b} | ${fmt(c.recall)} | ${fmt(c.hit)} |`);
    }
    L.push("", "Nếu khoảng tin cậy không chứa 0 thì chênh lệch phân biệt được trên *bộ dữ liệu giả lập này*; đây không phải kết luận cho dữ liệu thật.", "");

    L.push("## 6. Apriori và FP-Growth", "");
    L.push("| Tham số | Truy vấn so sánh | Gợi ý giống hệt | Số luật | Thời gian khai phá + dựng chỉ mục, trung vị (Apriori / FP-Growth) |", "|---|---:|:---:|---:|---|");
    for (const a of algorithmCheck) {
        L.push(`| sup ${a.params.minSupport}, conf ${a.params.minConfidence} | ${a.queries} | ${a.identical ? "✔" : `✘ (${a.mismatches} khác)`} | ${a.timings.fpgrowth.ruleCount} | ${a.timings.apriori.medianFitMs.toFixed(2)} ms / ${a.timings.fpgrowth.medianFitMs.toFixed(2)} ms (${a.timingRuns} lần) |`);
    }
    L.push("", "Hai thuật toán là thuật toán chính xác nên cho cùng tập luật và cùng gợi ý; **chất lượng gợi ý chỉ cần báo cáo một lần**. Với 800 đơn, thời gian chỉ vài mili-giây và đo trong cùng tiến trình, nên không dùng để so hiệu năng. So sánh thời gian và bộ nhớ có kiểm soát nằm ở `research-results/benchmark-mining.md` (Giai đoạn 1).", "");

    L.push("## 7. Giới hạn", "");
    L.push("- **Dữ liệu giả lập có luật cài sẵn**, do cùng nhóm tác giả thiết kế. Phương pháp dựa trên luật được lợi vì dữ liệu được sinh đúng theo dạng “sản phẩm ⇒ phụ kiện”. Không được suy ra kết luận cho khách hàng thật.");
    L.push(`- **Cỡ mẫu nhỏ:** test chỉ có ${split.test.queries} truy vấn từ ${split.test.ordersWithAtLeast2Items} đơn; validation ${split.validation.queries} truy vấn. Khoảng tin cậy rộng, chỉ phân biệt được chênh lệch lớn.`);
    L.push("- Bộ sinh dữ liệu không thay đổi theo thời gian, nên chia theo thời gian gần với chia ngẫu nhiên; chưa thử được hiện tượng xu hướng mua thay đổi.");
    L.push(`- ${split.test.singleItemOrdersSkipped} đơn test chỉ có 1 sản phẩm không được chấm; giao thức chỉ đánh giá ngữ cảnh “đang xem một sản phẩm”.`);
    L.push("- Mọi sản phẩm đều còn hàng trong dữ liệu demo, nên bộ lọc hết hàng chưa được thử trong thí nghiệm này (đã có unit test riêng).");
    L.push("- Co-occurrence tái hiện logic của controller cũ (ngưỡng 1%/1%, không chỉnh); nó không có fallback.", "");

    L.push("## 8. Chạy lại", "");
    L.push("```", "cd Shop/Shop/backendapi", "node scripts/evaluate-recommenders.js            # ghi research-results/phase4-step1-evaluation.{md,json}", "node --test test/                                 # unit test (gồm test/evaluation)", "```");
    L.push("Cùng seed và cùng code sẽ cho cùng checksum dữ liệu và cùng bảng kết quả (trừ cột thời gian).");
    return L.join("\n") + "\n";
}

module.exports = { toMarkdown };
