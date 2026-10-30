// Báo cáo Markdown cho đánh giá nhiều bộ dữ liệu (Bước 2).

const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(d)}%`);
const pp = (x) => (x === null || Number.isNaN(x) ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`);
const msd = (d) => (d.mean === null ? "–" : `${pct(d.mean)} ± ${(d.sd * 100).toFixed(1)}`);
const ci = (d) => (d.mean === null ? "–" : `[${pct(d.ciLow)}; ${pct(d.ciHigh)}]`);

const PROFILE_TITLE = { r1: "R1 (giống dữ liệu demo)", r1b: "R1b (khó hơn: nhiễu + sản phẩm ít giao dịch)" };

function profileSection(L, profile, agg, settings) {
    L.push(`## ${PROFILE_TITLE[profile] || profile}`, "");
    L.push("| Seed | Checksum dữ liệu (SHA-1) | Đơn | Truy vấn validation | Truy vấn test (từ … đơn) | Tham số chọn (sup / conf) | SP ít giao dịch | Apriori = FP-Growth | Thời gian |", "|---:|---|---:|---:|---:|---|---:|:---:|---:|");
    for (const d of agg.datasets) {
        L.push(
            `| ${d.seed} | \`${d.checksum}\` | ${d.orders} | ${d.split.validationQueries} | ${d.split.testQueries} (${d.split.testOrdersWithAtLeast2Items}) | ${d.selected.minSupport} / ${d.selected.minConfidence}${d.selectedOnGridEdge.length ? " ⚠️ biên" : ""} | ${d.rareProducts} | ${d.algorithmsIdentical ? "✔" : "✘"} | ${d.seconds === null ? "–" : `${d.seconds.toFixed(1)} s`} |`
        );
    }
    L.push("");
    L.push(`### Kết quả trên tập test — trung bình ± độ lệch chuẩn qua ${agg.seeds.length} seed`, "");
    L.push(
        "| Phương pháp | Precision@5 | Recall@5 | KTC 95% Recall qua seed (t) | KTC 95% Recall theo đơn hàng (bootstrap, TB qua seed) | Hit Rate@5 | KTC 95% Hit theo đơn hàng | Coverage | Có gợi ý từ luật |",
        "|---|---:|---:|---|---|---:|---|---:|---:|"
    );
    const ob = (b) => `[${pct(b.low)}; ${pct(b.high)}]`;
    for (const m of agg.methods) {
        L.push(
            `| ${m.label} | ${msd(m.metrics.precision)} | ${msd(m.metrics.recall)} | ${ci(m.metrics.recall)} | ${ob(m.orderBootstrap.recall)} | ${msd(m.metrics.hitRate)} | ${ob(m.orderBootstrap.hitRate)} | ${msd(m.metrics.coverage)} | ${msd(m.metrics.ruleQueryRate)} |`
        );
    }
    L.push("", "KTC qua seed: độ bất định do quá trình sinh dữ liệu. KTC theo đơn hàng: bootstrap chọn lại **đơn** (mọi truy vấn của một đơn đi cùng nhau) trong từng seed, rồi lấy trung bình cận dưới/cận trên qua seed.", "");
    L.push(`### Chênh lệch cặp theo seed (A = luật + fallback, tham số chọn trên validation), điểm phần trăm`, "");
    L.push("| B | Δ Recall@5 (TB, KTC 95%) | Δ Hit Rate@5 (TB, KTC 95%) | Δ Precision@5 (TB) | Seed A > B (Recall) |", "|---|---|---|---:|---:|");
    const labelOf = new Map(agg.methods.map((m) => [m.key, m.label]));
    for (const p of agg.pairs) {
        L.push(
            `| ${labelOf.get(p.b)} | ${pp(p.recall.mean)} [${pp(p.recall.ciLow)}; ${pp(p.recall.ciHigh)}] | ${pp(p.hitRate.mean)} [${pp(p.hitRate.ciLow)}; ${pp(p.hitRate.ciHigh)}] | ${pp(p.precision.mean)} | ${p.recall.min > 0 ? `${agg.seeds.length}/${agg.seeds.length}` : `min ${pp(p.recall.min)}`} |`
        );
    }
    L.push("");
    const anyRare = agg.methods[0].rareQueries.queries.mean > 0;
    if (anyRare) {
        L.push(`### Truy vấn có sản phẩm đang xem ít giao dịch (< ${pct(settings.rareThreshold)} đơn lịch sử)`, "");
        L.push(`Trung bình ${agg.methods[0].rareQueries.queries.mean.toFixed(0)} truy vấn/seed — rất ít, chỉ để quan sát xu hướng.`, "");
        L.push("| Phương pháp | Recall@5 | Hit Rate@5 | Có gợi ý từ luật |", "|---|---:|---:|---:|");
        for (const m of agg.methods) L.push(`| ${m.label} | ${msd(m.rareQueries.recall)} | ${msd(m.rareQueries.hitRate)} | ${msd(m.rareQueries.ruleQueryRate)} |`);
        L.push("");
    } else {
        L.push(`Không có sản phẩm nào dưới ngưỡng ít giao dịch (< ${pct(settings.rareThreshold)} đơn lịch sử) trong hồ sơ này.`, "");
    }
}

function toMarkdownMulti(result, benchmark, meta) {
    const { settings, profiles, gr2Check } = result;
    const L = [];
    L.push("# Giai đoạn 4 – Bước 2: Bộ dữ liệu nghiên cứu R1 / R1b", "");
    L.push(`Tạo lúc: ${meta.generatedAt} · Node ${meta.node} · lệnh: \`${meta.command}\``, "");
    L.push("> **Dữ liệu giả lập.** R1/R1b được sinh offline bằng `research/datasets/generator.js`, dùng lại bộ sinh demo với các luật mua kèm cài sẵn.", "> Kết quả đo khả năng *tìm lại mẫu đã cài*, không phản ánh khách hàng thật. Không kết nối, không ghi MongoDB GR2.", "");

    L.push("## 1. Bộ dữ liệu", "");
    L.push(`- Bộ sinh: \`${settings.generatorVersion}\` (phiên bản nằm trong metadata và trong checksum).`);
    for (const [profile, info] of Object.entries(settings.profiles)) L.push(`- **${profile}**: ${info.description}`);
    L.push(`- ${settings.seeds.length} seed mỗi hồ sơ: ${settings.seeds.join(", ")} · ${settings.orders} đơn/bộ · khoảng thời gian ${settings.from} → ${settings.to}.`);
    L.push(`- Hồ sơ r1 với seed demo tái tạo y hệt bộ sinh GR2: ${gr2Check.r1ReproducesDemoGenerator ? "✔" : "✘"} · checksum dữ liệu demo 1.000 đơn không đổi (\`${gr2Check.demoChecksum.slice(0, 16)}…\`): ${gr2Check.demoChecksumUnchanged ? "✔" : "✘"}.`);
    L.push("- Dữ liệu sinh lại từ seed mỗi lần chạy; không lưu file dữ liệu vào repo. Metadata tái lập (phiên bản bộ sinh, seed, cấu hình, SHA-1 cấu hình, checksum, thống kê) trong `phase4-step2-datasets.json`.");
    if (result.failures && result.failures.length) L.push(`- ⚠️ ${result.failures.length} bộ lỗi, không có trong bảng: ${result.failures.map((f) => `${f.name} (${f.error})`).join("; ")}.`);
    L.push(`- Tổng thời gian: ${meta.seconds.toFixed(0)} s (đánh giá các bộ: ${meta.datasetSeconds.toFixed(0)} s).`, "");
    const R = settings.resourceLimits;
    if (R) {
        L.push("**Giới hạn tài nguyên:** " + (R.isolate ? `mỗi bộ chạy trong tiến trình con riêng, heap tối đa ${R.maxMemoryMb} MB, dừng sau ${R.timeoutSec} s.` : "chạy cùng tiến trình (--no-isolate)."));
        L.push(`Trước mỗi lần khai phá có kiểm tra ngân sách: ≤ ${R.miningBudget.maxFrequentItems} item phổ biến, ≤ ${R.miningBudget.maxCandidatePairs.toLocaleString("en")} ứng viên 2-itemset, giao dịch ≤ ${R.miningBudget.maxTransactionLength} item phổ biến, cận trên số tập phổ biến ≤ ${R.miningBudget.maxItemsetUpperBound.toLocaleString("en")}; vượt thì dừng với thông báo thay vì treo máy.`, "");
    }

    L.push("## 2. Giao thức (giống Bước 1)", "");
    L.push(`- Chia theo thời gian ${settings.ratios.train}/${settings.ratios.validation}/${settings.ratios.test}; đơn cùng thời điểm không bị tách; test kiểm tra rò rỉ dữ liệu ở mỗi bộ.`);
    L.push("- Che giấu từng sản phẩm trong đơn test có ≥ 2 sản phẩm; Top-5; Precision@5 chia cho 5.");
    L.push(`- Tham số luật chọn **riêng cho từng bộ** trên validation (lưới ${settings.grid.minSupport.length}×${settings.grid.minConfidence.length}, minSupport ≥ ${Math.min(...settings.grid.minSupport)} = giới hạn dưới của API website); test chỉ dùng một lần.`);
    L.push("- Thống kê qua seed: trung bình ± độ lệch chuẩn mẫu; KTC 95% theo phân phối t (bậc tự do = số seed − 1). Cột “± bootstrap” là nửa độ rộng KTC bootstrap trong một seed (trung bình qua seed).", "");

    for (const [profile, agg] of Object.entries(profiles)) profileSection(L, profile, agg, settings);

    L.push("## 3. Hiệu năng Apriori và FP-Growth (benchmark riêng, có kiểm soát)", "");
    if (benchmark) {
        L.push(`Khai phá trên train ∪ validation (${benchmark.settings.historyOrders} đơn) của từng bộ; mỗi lượt đo chạy trong tiến trình con riêng; thời gian là trung vị ${benchmark.settings.runs} lần sau 1 lần chạy đầu; RSS = mức tăng bộ nhớ đỉnh của lần chạy đầu. Không dùng thời gian API hay cache.`, "");
        L.push("| Hồ sơ | min_sup | Itemsets (TB) | Candidate Apriori (TB) | Apriori ms (TB ± SD) | FP-Growth ms (TB ± SD) | Tỷ lệ A/FP (TB) | RSS Apriori MB (TB) | RSS FP MB (TB) | Kết quả trùng |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|");
        for (const row of benchmark.summary) {
            L.push(
                `| ${row.profile} | ${row.minSupport} | ${row.itemsets.mean.toFixed(0)} | ${row.candidates.mean.toFixed(0)} | ${row.aprioriMs.mean.toFixed(1)} ± ${row.aprioriMs.sd.toFixed(1)} | ${row.fpMs.mean.toFixed(1)} ± ${row.fpMs.sd.toFixed(1)} | ×${row.ratio.mean.toFixed(2)} | ${row.aprioriRss.mean.toFixed(1)} | ${row.fpRss.mean.toFixed(1)} | ${row.allIdentical ? `✔ ${row.n}/${row.n}` : "✘"} |`
            );
        }
        L.push("", "Thời gian phụ thuộc máy; chỉ so sánh tương đối giữa hai thuật toán trên cùng máy, cùng dữ liệu. Chi tiết: `phase4-step2-benchmark.{md,json}`.", "");
    } else {
        L.push("Chưa chạy benchmark (xem `scripts/benchmark-research-datasets.js`).", "");
    }

    L.push("## 4. Giới hạn của dữ liệu giả lập", "");
    L.push("- Luật mua kèm do chính bộ sinh cài sẵn (“điện thoại ⇒ phụ kiện”), nên phương pháp dựa trên luật có lợi thế cấu trúc; không suy ra cho khách hàng thật.");
    L.push("- Hành vi không đổi theo thời gian (bộ sinh dừng), nên chia theo thời gian gần như chia ngẫu nhiên; chưa thử xu hướng thay đổi theo mùa hoặc sản phẩm mới ra mắt giữa kỳ.");
    L.push("- Không có thông tin khách hàng, giá thay đổi hay tồn kho; mọi sản phẩm còn hàng.");
    L.push("- 5 seed cùng một bộ sinh: độ lệch giữa seed chỉ phản ánh ngẫu nhiên khi sinh, không phản ánh khác biệt giữa các cửa hàng thật.");
    L.push("- Tham số chọn trên validation thường nằm ở biên dưới của lưới (giới hạn API minSupport 0,002): giá trị tốt hơn có thể nằm ngoài vùng website cho phép.");
    L.push("- Nhóm “sản phẩm ít giao dịch” của R1b chỉ có vài chục truy vấn mỗi seed.", "");

    L.push("## 5. Tái lập", "");
    L.push(
        "```",
        "cd Shop/Shop/backendapi",
        "node scripts/benchmark-research-datasets.js                          # ~40 s, ghi phase4-step2-benchmark.{md,json} (chạy trước)",
        "node scripts/evaluate-research-datasets.js                           # ~2 phút, ghi phase4-step2-r1-evaluation.{md,json} + phase4-step2-datasets.json",
        "node scripts/evaluate-research-datasets.js --profile r1b --seed 20261103   # chạy riêng một bộ (ghi file có hậu tố)",
        "node scripts/benchmark-research-datasets.js --profiles r1 --seeds 1        # benchmark riêng một bộ",
        "node scripts/evaluate-research-datasets.js --export-dir ../r1-data   # (tùy chọn) xuất dữ liệu + metadata JSON ra ngoài repo",
        "node --test test/",
        "```"
    );
    L.push("Cùng seed + cùng cấu hình cho cùng checksum và cùng bảng chất lượng; cột thời gian thay đổi theo máy.");
    return L.join("\n") + "\n";
}

module.exports = { toMarkdownMulti };
