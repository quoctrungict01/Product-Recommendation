// Báo cáo Markdown cho Giai đoạn 4 – Bước 3 (M1: luật kết hợp đa mức).

const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "–" : (x * 100).toFixed(d));
const pp = (x, d = 1) => (x === null || x === undefined ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}`);
const msd = (d, digits = 1) => (d && d.n ? `${pct(d.mean, digits)} ± ${pct(d.sd, digits)}` : "–");
const ci = (c) => (c && c.low !== null && c.low !== undefined ? `[${pct(c.low)}; ${pct(c.high)}]` : "–");

const PROFILE_NAMES = { r1: "R1", r1b: "R1b" };
const SHOWN = ["category-based", "current-with-fallback", "tuned-rules-only", "tuned-with-fallback", "m1-website-with-fallback", "m1-rules-only", "m1-with-fallback"];
const PAIR_NAMES = {
    "m1-with-fallback|current-with-fallback": "M1 + fallback (validation) − hệ thống hiện tại",
    "m1-with-fallback|tuned-with-fallback": "M1 + fallback − luật một cấp + fallback (cả hai chọn tham số trên validation)",
    "m1-website-with-fallback|current-with-fallback": "M1 + fallback (tham số website) − hệ thống hiện tại (cùng ngưỡng 0,01 / 0,2)",
    "m1-rules-only|tuned-rules-only": "M1 chỉ luật − luật một cấp chỉ luật (tham số validation)",
};

function paramsText(p) {
    const strategy = p.categoryMinSupport === p.productMinSupport ? "uniform" : "reduced";
    return `${strategy}: sp ${p.productMinSupport} / dm ${p.categoryMinSupport}, conf ${p.minConfidence}, ${p.policy}`;
}

function pairRow(name, part) {
    const r = part.recall;
    const h = part.hit;
    if (!r) return `| ${name} | – | – | – | – |`;
    return `| ${name} | ${pp(r.diff.mean, 2)} ± ${pct(r.diff.sd, 2)} | ${r.seedsPositive}/${r.seeds} dương · ${r.seedsSignificantlyPositive} có KTC > 0 · ${r.seedsSignificantlyNegative} có KTC < 0 | ${pp(h.diff.mean, 2)} ± ${pct(h.diff.sd, 2)} | ${r.perSeed.map((s) => `${pp(s.mean)} [${pp(s.low)}; ${pp(s.high)}]`).join("<br>")} |`;
}

function toMarkdownM1(result, benchmark) {
    const { meta, settings, datasetCheck, failures, profiles } = result;
    const L = [];
    L.push("# Giai đoạn 4 – Bước 3: M1 — Luật kết hợp đa mức (mục 7.2.1)", "");
    L.push(`Tạo lúc: ${meta.generatedAt} · Node ${meta.node} · lệnh \`${meta.command}\` · tổng ${meta.seconds.toFixed(0)} s (đánh giá ${meta.datasetSeconds.toFixed(0)} s).`, "");
    L.push("Toàn bộ chạy OFFLINE: dữ liệu sinh lại từ seed, không đọc `.env`, không kết nối MongoDB, không gọi API. M1 chỉ nằm trong `research/multilevel/` — API, tham số mặc định và giao diện website không đổi.", "");

    L.push("## 1. Thiết kế", "");
    L.push("- **Hệ phân cấp 2 cấp đúng như dữ liệu**: `all` (cấp 0, không phải item) → 10 danh mục (cấp 1, nút `C:<category_id>`) → sản phẩm (cấp 2, nút `P:<product_id>`; 41 ở R1, 48 ở R1b). Collection `categories` chỉ có trường `name`, không có danh mục cha, nên không thêm cấp \"Điện thoại/Phụ kiện\".");
    L.push("- **Khai phá**: mỗi giao dịch được thêm danh mục của các sản phẩm trong đó, rồi chạy **chính Apriori/FP-Growth của Chương 6** một lần ở ngưỡng thấp nhất; tập trộn cấp dùng ngưỡng thấp nhất của các cấp tham gia, tập thuần một cấp dùng ngưỡng của cấp đó (mục 7.2.1). Có test đối chiếu với cách \"từng cấp, từ trên xuống\" của giáo trình.");
    L.push("- **Ngưỡng**: uniform (cùng ngưỡng mọi cấp) hoặc reduced (ngưỡng danh mục ≥ ngưỡng sản phẩm); chọn trên validation cùng confidence và thứ tự xếp hạng.");
    L.push("- **Loại luật tầm thường**: bỏ mọi tập chứa đồng thời sản phẩm và danh mục cha của nó (vd. `iPhone 15 ⇒ danh mục iPhone`, confidence luôn 100%). Luật dư thừa theo luật tổ tiên (Ví dụ 7.2, sai lệch ≤ 10%) được đếm và báo cáo.");
    L.push("- **Ánh xạ về sản phẩm**: luật `X ⇒ danh mục D` cho điểm `conf(X ⇒ D) × sup(X ∪ {q}) / sup(X ∪ {D})` với q ∈ D, chỉ dùng tập phổ biến đã khai phá; nếu `X ∪ {q}` không phổ biến (sản phẩm ít giao dịch) thì lùi từ sản phẩm lên danh mục của nó, vẫn không có thì bỏ. Thiếu chỗ thì dùng đúng fallback của website.");
    L.push(`- **Giao thức** như Bước 1–2: chia theo thời gian ${settings.ratios.train}/${settings.ratios.validation}/${settings.ratios.test}, che từng sản phẩm trong đơn ≥ 2 sản phẩm, Top-${settings.k}; tham số chọn trên validation (học trên train), học lại trên train ∪ validation, chấm test một lần; KTC 95% bootstrap theo cụm **đơn hàng** (${settings.bootstrap} lần).`);
    L.push(`- **Sản phẩm ít giao dịch**: có trong < ${pct(settings.rareThreshold)}% số đơn lịch sử (train ∪ validation) — xác định không dùng test.`);
    L.push(`- Lưới M1: sup sản phẩm {${settings.m1Grid.productMinSupport.join(", ")}} × sup danh mục {= sup sản phẩm, ${settings.m1Grid.categoryMinSupport.filter((x) => x !== null).join(", ")}} × conf {${settings.m1Grid.minConfidence.join(", ")}} × thứ tự {${settings.m1Grid.policy.join(", ")}}. Lưới luật một cấp giữ nguyên Bước 2.`, "");

    L.push("## 2. Bộ dữ liệu và tham số được chọn", "");
    L.push(`Bộ sinh \`${settings.generatorVersion}\`. Checksum ${datasetCheck.comparedWithStep2 ? (datasetCheck.allMatch ? "**trùng khớp** manifest Bước 2 (`phase4-step2-datasets.json`)" : "**KHÔNG trùng** manifest Bước 2") : "chưa đối chiếu manifest Bước 2"}. Dữ liệu demo GR2: checksum ${datasetCheck.demoChecksumUnchanged ? "không đổi" : "ĐÃ ĐỔI"}.`, "");
    L.push("| Bộ | Checksum | Giây | SP hiếm | Luật một cấp (sup, conf) | M1 (validation) | Biên lưới M1 | Apriori = FP |", "|---|---|---:|---:|---|---|---|:---:|");
    for (const [p, agg] of Object.entries(profiles)) {
        for (const d of agg.datasets) {
            L.push(`| ${d.name} | \`${d.checksum}\` | ${d.seconds === null ? "–" : d.seconds.toFixed(1)} | ${d.rareProducts} | ${d.flatSelected.minSupport}, ${d.flatSelected.minConfidence} | ${paramsText(d.m1Selected)} | ${d.m1OnGridEdge.join("; ") || "–"} | ${d.algorithmsIdentical ? "✔" : "✘"} |`);
        }
    }
    L.push("");

    for (const [p, agg] of Object.entries(profiles)) {
        const name = PROFILE_NAMES[p] || p;
        const n = agg.seeds.length;
        L.push(`## 3. ${name}: toàn bộ truy vấn test (${n} seed)`, "");
        L.push("TB ± SD qua seed; KTC theo đơn = trung bình cận dưới/trên của KTC bootstrap theo đơn trong từng seed.", "");
        L.push("| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Có gợi ý từ luật | Có luật cấp danh mục/trộn cấp |", "|---|---:|---:|---|---:|---:|---:|---:|");
        for (const key of SHOWN) {
            const m = agg.methods.find((x) => x.key === key);
            if (!m) continue;
            L.push(`| ${m.label} | ${msd(m.metrics.precision)} | ${msd(m.metrics.recall)} | ${ci(m.orderBootstrap.recall)} | ${msd(m.metrics.hitRate)} | ${msd(m.metrics.coverage)} | ${msd(m.metrics.ruleQueryRate)} | ${key.startsWith("m1") ? msd(m.metrics.hierarchyRuleQueryRate) : "–"} |`);
        }
        L.push("");

        L.push(`### ${name}: nhóm sản phẩm ít giao dịch`, "");
        const ref = agg.methods[0].rare;
        if (!ref.seedsWithQueries) {
            L.push(`Không có sản phẩm nào dưới ngưỡng ${pct(settings.rareThreshold)}% số đơn lịch sử ở ${name} (sản phẩm ít nhất vẫn có hàng trăm đơn), nên không có nhóm hiếm để báo cáo.`, "");
        } else {
            L.push(`${ref.seedsWithQueries}/${n} seed có truy vấn hiếm; trung bình ${ref.queries.mean.toFixed(0)} truy vấn/seed (tổng ${ref.pooled ? ref.pooled.queries : 0}). Coverage nhóm = số sản phẩm khác nhau trong các danh sách của nhóm / số sản phẩm; \"SP hiếm được gợi ý\" = tỷ lệ sản phẩm hiếm xuất hiện trong ít nhất một danh sách test.`, "");
            L.push("| Phương pháp | Recall@5 | KTC theo đơn | Hit@5 | Coverage nhóm | Có gợi ý từ luật | Có luật cấp danh mục/trộn cấp | SP hiếm được gợi ý | Recall gộp mọi seed |", "|---|---:|---|---:|---:|---:|---:|---:|---:|");
            for (const key of SHOWN) {
                const m = agg.methods.find((x) => x.key === key);
                if (!m) continue;
                const r = m.rare;
                L.push(`| ${m.label} | ${msd(r.recall)} | ${ci(r.orderBootstrap && r.orderBootstrap.recall)} | ${msd(r.hitRate)} | ${msd(r.coverage)} | ${msd(r.ruleQueryRate)} | ${key.startsWith("m1") ? msd(r.hierarchyRuleQueryRate) : "–"} | ${msd(r.rareProductsRecommended)} | ${r.pooled ? pct(r.pooled.recall) : "–"} |`);
            }
            L.push("");
        }

        L.push(`### ${name}: so sánh cặp (cùng truy vấn, bootstrap theo đơn trong từng seed)`, "");
        L.push("| So sánh | ΔRecall@5 (điểm %, TB ± SD) | Số seed | ΔHit@5 | ΔRecall từng seed [KTC theo đơn] |", "|---|---:|---|---:|---|");
        for (const pr of agg.pairs) {
            const nm = PAIR_NAMES[`${pr.a}|${pr.b}`] || `${pr.a} − ${pr.b}`;
            L.push(pairRow(`${nm} — toàn bộ`, pr.all));
            if (pr.rare.recall) L.push(pairRow(`${nm} — **nhóm hiếm**`, pr.rare));
        }
        L.push("");

        const mi = agg.mining;
        const t = (d, digits = 0) => (d && d.n ? `${d.mean.toFixed(digits)} ± ${d.sd.toFixed(digits)}` : "–");
        L.push(`### ${name}: khai phá M1 (tham số đã chọn, học trên train ∪ validation)`, "");
        L.push(`- Độ dài giao dịch trung bình: ${t(mi.avgFlatLength, 2)} sản phẩm → ${t(mi.avgExtendedLength, 2)} nút sau khi thêm danh mục (dài nhất ${t(mi.maxExtendedLength)}).`);
        L.push(`- Tập khai phá ở ngưỡng thấp nhất: ${t(mi.minedAtLowest)}; bỏ tập tầm thường (item + tổ tiên): ${t(mi.trivialRemoved)}; dưới ngưỡng riêng của cấp: ${t(mi.belowOwnThreshold)}; giữ lại ${t(mi.frequent)} (${Object.entries(mi.frequentByType).map(([k, v]) => `${k} ${t(v)}`).join(", ")}).`);
        L.push(`- Luật 1 ⇒ 1 dùng được (lift > 1, ≥ conf): ${t(mi.usableRules)} (${Object.entries(mi.usableByType).map(([k, v]) => `${k} ${t(v)}`).join(", ")}); luật một cấp cùng tham số validation của luật một cấp: ${t(mi.flatRuleCount)} luật (mọi dạng).`);
        L.push(`- Luật dư thừa theo luật tổ tiên (Ví dụ 7.2, sai lệch support và confidence ≤ 10% so với kỳ vọng): ${t(mi.redundantRules)} — chỉ thống kê, không loại khỏi xếp hạng (gợi ý từ luật dư thừa gần như trùng điểm với luật tổ tiên).`, "");
    }

    L.push("## 4. Thời gian và bộ nhớ", "");
    if (benchmark) {
        L.push(`Benchmark riêng (\`${benchmark.meta.command}\`, ${benchmark.meta.cpu}, Node ${benchmark.meta.node}): mỗi lượt đo chạy trong tiến trình con riêng (--expose-gc), trung vị ${benchmark.settings.runs} lần sau 1 lần chạy lạnh, cùng giao dịch lịch sử (${benchmark.settings.historyOrders} đơn) và cùng ngưỡng cho mọi cấp. \"Một cấp\" = giao dịch sản phẩm; \"đa mức\" = giao dịch đã thêm danh mục. \"Toàn bộ\" = khai phá + lọc + sinh luật (mine() so với fitMultilevel()).`, "");
        L.push("| Hồ sơ | min_sup | Itemsets một cấp → đa mức | Apriori ms một cấp → đa mức | FP-Growth ms một cấp → đa mức | RSS đỉnh MB A / FP (đa mức) | Toàn bộ FP ms một cấp → M1 | Trùng A = FP |", "|---|---:|---|---|---|---|---|:---:|");
        for (const s of benchmark.summary) {
            const m = (d, digits = 1) => (d && d.n ? d.mean.toFixed(digits) : "–");
            L.push(`| ${s.profile} | ${s.minSupport} | ${m(s.flat.itemsets, 0)} → ${m(s.multilevel.itemsets, 0)} | ${m(s.flat.aprioriMs)} → ${m(s.multilevel.aprioriMs)} | ${m(s.flat.fpMs)} → ${m(s.multilevel.fpMs)} | ${m(s.multilevel.aprioriRss)} / ${m(s.multilevel.fpRss)} | ${m(s.full.flatMs)} → ${m(s.full.m1Ms)} | ${s.allIdentical ? `✔ ${s.n}/${s.n}` : "✘"} |`);
        }
        L.push("", "Thời gian/bộ nhớ phụ thuộc máy; chỉ dùng để so tương đối.", "");
    } else {
        L.push("Chưa có `phase4-step3-m1-benchmark.json` — chạy `node scripts/benchmark-multilevel.js`.", "");
    }

    L.push("## 5. Kết luận (sinh tự động từ số liệu)", "");
    for (const [p, agg] of Object.entries(profiles)) {
        const name = PROFILE_NAMES[p] || p;
        const vsTuned = agg.pairs.find((x) => x.a === "m1-with-fallback" && x.b === "tuned-with-fallback");
        const vsCurrent = agg.pairs.find((x) => x.a === "m1-with-fallback" && x.b === "current-with-fallback");
        const a = vsTuned.all.recall;
        L.push(`- **${name}, toàn bộ**: M1 − luật một cấp (cùng chọn tham số trên validation) = ${pp(a.diff.mean, 2)} điểm Recall@5 (SD ${pct(a.diff.sd, 2)}); ${a.seedsSignificantlyPositive}/${a.seeds} seed có KTC theo đơn nằm trên 0, ${a.seedsSignificantlyNegative}/${a.seeds} nằm dưới 0. So với hệ thống hiện tại: ${pp(vsCurrent.all.recall.diff.mean)} điểm (phần lớn đến từ việc chọn ngưỡng, xem dòng luật một cấp).`);
        const r = vsTuned.rare.recall;
        if (r) {
            L.push(`- **${name}, sản phẩm ít giao dịch**: M1 − luật một cấp = ${pp(r.diff.mean)} điểm Recall@5 (SD ${pct(r.diff.sd)}); ${r.seedsSignificantlyPositive}/${r.seeds} seed có KTC theo đơn nằm trên 0. So với hệ thống hiện tại: ${pp(vsCurrent.rare.recall.diff.mean)} điểm.`);
        }
    }
    L.push("");

    L.push("## 6. Hạn chế", "");
    L.push("- Dữ liệu giả lập với luật mua kèm cài sẵn. Sản phẩm hiếm của R1b có quan hệ mua kèm theo **thương hiệu** (vd. Galaxy S24 FE → củ sạc Samsung), đúng loại cấu trúc mà luật danh mục nắm bắt được; không suy ra được mức cải thiện trên dữ liệu thật.");
    L.push("- Nhóm hiếm nhỏ (vài chục truy vấn mỗi seed, 7 sản phẩm) nên KTC rộng; R1 không có sản phẩm hiếm theo định nghĩa này.");
    L.push("- Sản phẩm hiếm khi là **đáp án** (vd. ốp lưng Galaxy S24 FE) vẫn khó được gợi ý: ánh xạ danh mục → sản phẩm ưu tiên sản phẩm phổ biến trong danh mục, nên tỷ lệ sản phẩm hiếm từng được gợi ý của M1 + fallback THẤP hơn luật một cấp + fallback (cột \"SP hiếm được gợi ý\").");
    L.push("- Coverage toàn danh mục của M1 + fallback thấp hơn luật một cấp + fallback: luật danh mục lấp các chỗ trống mà trước đây fallback dùng, và chúng dồn về các sản phẩm phổ biến.");
    L.push("- M1 với tham số website (uniform 0,01) có nhiều gợi ý từ luật danh mục cho sản phẩm hiếm nhưng Recall nhóm hiếm vẫn 0%: ở ngưỡng này các luật danh mục chỉ trỏ tới phụ kiện phổ biến, không trúng phụ kiện của máy hiếm. Lợi ích ở nhóm hiếm chỉ xuất hiện khi ngưỡng sản phẩm thấp (0,002) để có các tập trộn cấp như {danh mục Samsung, củ sạc Samsung}.");
    L.push("- Mức cải thiện chung so với hệ thống hiện tại (+17,7 / +19,5 điểm) chủ yếu do chọn ngưỡng trên validation (luật một cấp đã đạt +17,5 / +19,0 ở Bước 2); phần riêng của M1 trên toàn bộ truy vấn chỉ +0,2 / +0,4 điểm.");
    L.push("- Hệ phân cấp chỉ có 2 cấp và danh mục là thương hiệu/loại phụ kiện; chưa thử cấp \"Điện thoại/Phụ kiện\" vì dữ liệu không có.");
    L.push("- Ngưỡng sản phẩm tốt nhất vẫn nằm ở biên dưới của lưới (0,002 — giới hạn của API), như Bước 2.");
    L.push("- Luật dư thừa chỉ được thống kê, chưa thử loại bỏ khi xếp hạng.");
    L.push("");
    if (failures.length) L.push(`⚠️ ${failures.length} bộ lỗi: ${failures.map((f) => `${f.name}: ${f.error}`).join("; ")}`, "");
    L.push("## 7. Tái lập", "");
    L.push("```", "node scripts/evaluate-multilevel.js                               # 2 hồ sơ × 5 seed", "node scripts/evaluate-multilevel.js --profile r1b --seed 20261103  # một bộ", "node scripts/benchmark-multilevel.js", "node --test test/", "```", "");
    return L.join("\n");
}

module.exports = { toMarkdownM1 };
