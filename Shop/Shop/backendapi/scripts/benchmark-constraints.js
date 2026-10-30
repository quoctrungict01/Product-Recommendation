#!/usr/bin/env node
// Benchmark M2-B (Giai đoạn 4 – Bước 4): hậu lọc vs cắt tỉa trong khai phá, CÙNG giao dịch, CÙNG ngưỡng, CÙNG ràng buộc.
// OFFLINE: không đọc .env, không kết nối MongoDB, không gọi API/cache.
//
//   node scripts/benchmark-constraints.js
//   node scripts/benchmark-constraints.js --runs 15 --min-support 0.01,0.005,0.002 --profile r1b --seed 20261101
//
// Mỗi lượt đo (hồ sơ × seed × min_sup × cấp × thuật toán × cách áp ràng buộc) chạy trong một tiến trình con riêng
// (--expose-gc, giới hạn heap/thời gian): 1 lần chạy lạnh (đo mức tăng RSS đỉnh) + `runs` lần lấy trung vị.
//   post : apriori()/fpGrowth() gốc rồi hậu lọc (ghi riêng thời gian khai phá gốc và thời gian lọc)
//   push : Apriori/FP-Growth có cắt tỉa (research/constraints/miners.js)
// Ở lượt "post" đo thêm (sau khi đã đo RSS) bản có cắt tỉa nhưng KHÔNG ràng buộc nào, để thấy chi phí của phần bao.
// Ràng buộc: B1 count ≤ 2, B2 ≤ 1 điện thoại, B3 không cặp không tương thích (+ không item cùng tổ tiên ở cấp đa mức).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const { runInChild, serveChild } = require(path.join(ROOT, "research/evaluation/child-process"));
const MIN_SUPPORT_FLOOR = 0.001;

function constraintsFor(level, products) {
    const { buildBusinessRules } = require(path.join(ROOT, "research/constraints/business"));
    const { noConflictingPair } = require(path.join(ROOT, "research/constraints/constraints"));
    const { hierarchyFromCatalog, isProductNode, productIdOf } = require(path.join(ROOT, "research/multilevel/hierarchy"));
    const business = buildBusinessRules(products);
    if (level === "flat") return business.itemsetConstraints();
    const { hierarchy } = hierarchyFromCatalog(products);
    const resolve = (node) => (isProductNode(node) ? { type: "product", id: productIdOf(node) } : { type: "category", id: node.slice(2) });
    return [...business.itemsetConstraints(resolve), noConflictingPair((a, b) => hierarchy.isAncestor(a, b) || hierarchy.isAncestor(b, a), "không có item cùng tổ tiên của nó")];
}

function measureInChild({ file, level, algorithm, mode, minSupport, runs }) {
    const { apriori } = require(path.join(ROOT, "src/apps/services/mining/apriori"));
    const { fpGrowth } = require(path.join(ROOT, "src/apps/services/mining/fpgrowth"));
    const { CONSTRAINED, postFilter } = require(path.join(ROOT, "research/constraints/miners"));
    const { assertMiningBudget } = require(path.join(ROOT, "research/evaluation/budget"));
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const T = data.transactions;
    assertMiningBudget(T, minSupport);
    const constraints = constraintsFor(level, data.products);
    const original = { apriori, fpgrowth: fpGrowth }[algorithm];
    const pushed = CONSTRAINED[algorithm];
    let mineMs = 0;
    let filterMs = 0;
    const task =
        mode === "push"
            ? () => pushed(T, { minSupport, constraints })
            : () => {
                  const a = process.hrtime.bigint();
                  const raw = original(T, { minSupport });
                  const b = process.hrtime.bigint();
                  const itemsets = postFilter(raw.itemsets, constraints);
                  mineMs = Number(b - a) / 1e6;
                  filterMs = Number(process.hrtime.bigint() - b) / 1e6;
                  return { itemsets, stats: { ...raw.stats, rawItemsets: raw.itemsets.length } };
              };
    const gc = global.gc || (() => {});
    gc();
    gc();
    const rssBefore = process.resourceUsage().maxRSS;
    let t0 = process.hrtime.bigint();
    let result = task();
    const coldMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const peakRssDeltaMB = Math.max(0, process.resourceUsage().maxRSS - rssBefore) / 1024;
    const times = [];
    const mineTimes = [];
    const filterTimes = [];
    for (let i = 0; i < runs; i++) {
        result = null;
        gc();
        t0 = process.hrtime.bigint();
        result = task();
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
        mineTimes.push(mineMs);
        filterTimes.push(filterMs);
    }
    const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const out = {
        itemsets: result.itemsets.length,
        checksum: crypto.createHash("sha1").update(JSON.stringify(result.itemsets)).digest("hex"),
        rawItemsets: result.stats.rawItemsets ?? null,
        countedCandidates: result.stats.totalCandidates ?? null,
        candidatesGenerated: result.stats.candidatesGenerated ?? null,
        prunedByConstraint: result.stats.prunedByConstraint ?? null,
        conditionalTrees: result.stats.conditionalTrees ?? null,
        prunedPatterns: result.stats.prunedPatterns ?? null,
        prunedBaseItems: result.stats.prunedBaseItems ?? null,
        coldMs,
        medianMs: med(times),
        medianMineMs: mode === "post" ? med(mineTimes) : null,
        medianFilterMs: mode === "post" ? med(filterTimes) : null,
        peakRssDeltaMB,
    };
    if (mode === "post") {
        // Chi phí phần bao: bản có cắt tỉa nhưng không có ràng buộc nào (phải cho đúng kết quả gốc).
        const wrapperTimes = [];
        let w;
        for (let i = 0; i < runs; i++) {
            gc();
            const a = process.hrtime.bigint();
            w = pushed(T, { minSupport, constraints: [] });
            wrapperTimes.push(Number(process.hrtime.bigint() - a) / 1e6);
        }
        const raw = original(T, { minSupport });
        out.wrapperNoConstraintMs = med(wrapperTimes);
        out.wrapperEqualsOriginal = JSON.stringify(w.itemsets) === JSON.stringify(raw.itemsets);
    }
    return out;
}

function parseArgs(argv) {
    const { RESEARCH_SEEDS, PROFILES } = require(path.join(ROOT, "research/datasets/generator"));
    const args = { runs: 15, minSupport: [0.01, 0.005, 0.002], profiles: ["r1", "r1b"], seeds: [...RESEARCH_SEEDS], orders: 20000, out: path.join(ROOT, "research-results"), timeoutSec: 300, maxMemoryMb: 2048 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            if (i + 1 >= argv.length) throw new Error(`Thiếu giá trị cho ${a}`);
            return argv[++i];
        };
        if (a === "--runs") args.runs = Number(next());
        else if (a === "--min-support") args.minSupport = next().split(",").map(Number);
        else if (a === "--profiles" || a === "--profile") args.profiles = next().split(",");
        else if (a === "--seeds") args.seeds = RESEARCH_SEEDS.slice(0, Number(next()));
        else if (a === "--seed") args.seeds = next().split(",").map(Number);
        else if (a === "--orders") args.orders = Number(next());
        else if (a === "--out") args.out = next();
        else if (a === "--timeout") args.timeoutSec = Number(next());
        else if (a === "--max-memory-mb") args.maxMemoryMb = Number(next());
        else throw new Error(`Tham số không hỗ trợ: ${a}`);
    }
    if (!Number.isInteger(args.runs) || args.runs < 1 || args.runs > 100) throw new Error("--runs phải là số nguyên 1..100");
    if (args.minSupport.some((x) => !(x >= MIN_SUPPORT_FLOOR && x < 1))) throw new Error(`--min-support phải trong [${MIN_SUPPORT_FLOOR}, 1)`);
    for (const p of args.profiles) if (!PROFILES[p]) throw new Error(`Hồ sơ không hỗ trợ: ${p}`);
    if (!args.seeds.length || args.seeds.some((s) => !Number.isInteger(s))) throw new Error("--seeds/--seed không hợp lệ");
    if (!Number.isInteger(args.orders) || args.orders < 100 || args.orders > 200000) throw new Error("--orders phải là số nguyên 100..200000");
    if (!(args.timeoutSec > 0) || !(args.maxMemoryMb >= 256)) throw new Error("--timeout phải > 0, --max-memory-mb ≥ 256");
    args.full = args.orders === 20000 && args.profiles.join() === "r1,r1b" && args.seeds.join() === RESEARCH_SEEDS.join() && args.minSupport.join() === "0.01,0.005,0.002" && args.runs === 15;
    return args;
}

async function main() {
    const { describe } = require(path.join(ROOT, "research/evaluation/aggregate"));
    const { generateResearchDataset, GENERATOR_VERSION } = require(path.join(ROOT, "research/datasets/generator"));
    const { temporalSplit } = require(path.join(ROOT, "research/evaluation/split"));
    const { hierarchyFromCatalog, extendTransactions } = require(path.join(ROOT, "research/multilevel/hierarchy"));
    const args = parseArgs(process.argv.slice(2));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-m2-bench-"));
    process.on("exit", () => fs.rmSync(tmpDir, { recursive: true, force: true }));
    const limits = { timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, execArgv: ["--expose-gc"] };
    console.log(`Node ${process.version} | ${process.platform} ${process.arch} | ${os.cpus()[0].model}`);
    const total = args.profiles.length * args.seeds.length * args.minSupport.length;
    console.log(`${total} cấu hình × 2 cấp × 2 thuật toán × 2 cách (hậu lọc, cắt tỉa) · mỗi lượt một tiến trình riêng, heap ≤ ${args.maxMemoryMb} MB, dừng sau ${args.timeoutSec} s`);
    const started = Date.now();
    const rows = [];
    let k = 0;
    for (const profile of args.profiles) {
        for (const seed of args.seeds) {
            const dataset = generateResearchDataset({ profile, seed, count: args.orders });
            const split = temporalSplit(dataset.orders);
            const flat = [...split.train, ...split.validation].map((o) => o.items);
            const catalog = hierarchyFromCatalog(dataset.products);
            const files = {
                flat: path.join(tmpDir, `${profile}-${seed}-flat.json`),
                multilevel: path.join(tmpDir, `${profile}-${seed}-ml.json`),
            };
            fs.writeFileSync(files.flat, JSON.stringify({ transactions: flat, products: dataset.products }));
            fs.writeFileSync(files.multilevel, JSON.stringify({ transactions: extendTransactions(flat, catalog.hierarchy, catalog.toNode), products: dataset.products }));
            for (const minSupport of args.minSupport) {
                k++;
                const row = { profile, seed, datasetChecksum: dataset.checksum, minSupport, historyOrders: flat.length };
                for (const level of ["flat", "multilevel"]) {
                    for (const algorithm of ["apriori", "fpgrowth"]) {
                        for (const mode of ["post", "push"]) {
                            row[`${level}-${algorithm}-${mode}`] = await runInChild(__filename, { file: files[level], level, algorithm, mode, minSupport, runs: args.runs }, limits);
                        }
                    }
                }
                const errors = Object.entries(row).filter(([, v]) => v && v.error).map(([key, v]) => `${key}: ${v.error}`);
                const sameSet = (level) => new Set(["apriori-post", "apriori-push", "fpgrowth-post", "fpgrowth-push"].map((x) => row[`${level}-${x}`].checksum)).size === 1;
                row.errors = errors;
                row.identical = !errors.length && sameSet("flat") && sameSet("multilevel");
                row.wrapperOk = !errors.length && ["flat", "multilevel"].every((l) => ["apriori", "fpgrowth"].every((a) => row[`${l}-${a}-post`].wrapperEqualsOriginal));
                rows.push(row);
                const g = (key) => row[key].medianMs.toFixed(1);
                console.log(
                    errors.length
                        ? `[${k}/${total}] ${profile} ${seed} sup ${minSupport}: LỖI ${errors.join("; ")}`
                        : `[${k}/${total}] ${profile} ${seed} sup ${minSupport} | một cấp A ${g("flat-apriori-post")}→${g("flat-apriori-push")} ms, FP ${g("flat-fpgrowth-post")}→${g("flat-fpgrowth-push")} ms | đa mức A ${g("multilevel-apriori-post")}→${g("multilevel-apriori-push")} ms (candidate ${row["multilevel-apriori-post"].countedCandidates ?? "?"}), FP ${g("multilevel-fpgrowth-post")}→${g("multilevel-fpgrowth-push")} ms | trùng: ${row.identical} | phần bao đúng: ${row.wrapperOk}`
                );
                if (!row.identical || !row.wrapperOk) process.exitCode = 1;
            }
        }
    }
    const seconds = (Date.now() - started) / 1000;
    const summary = [];
    for (const profile of args.profiles) {
        for (const minSupport of args.minSupport) {
            for (const level of ["flat", "multilevel"]) {
                const g = rows.filter((r) => r.profile === profile && r.minSupport === minSupport && !r.errors.length);
                const d = (f) => describe(g.map(f).filter((x) => x !== null && x !== undefined && !Number.isNaN(x)));
                const s = { profile, minSupport, level, n: g.length, allIdentical: g.length > 0 && g.every((r) => r.identical), wrapperOk: g.every((r) => r.wrapperOk) };
                for (const algorithm of ["apriori", "fpgrowth"]) {
                    const post = (r) => r[`${level}-${algorithm}-post`];
                    const push = (r) => r[`${level}-${algorithm}-push`];
                    s[algorithm] = {
                        rawItemsets: d((r) => post(r).rawItemsets),
                        keptItemsets: d((r) => post(r).itemsets),
                        postMs: d((r) => post(r).medianMs),
                        postMineMs: d((r) => post(r).medianMineMs),
                        postFilterMs: d((r) => post(r).medianFilterMs),
                        pushMs: d((r) => push(r).medianMs),
                        wrapperNoConstraintMs: d((r) => post(r).wrapperNoConstraintMs),
                        speedup: d((r) => post(r).medianMs / push(r).medianMs),
                        postCounted: d((r) => post(r).countedCandidates),
                        pushCounted: d((r) => push(r).countedCandidates),
                        pushPruned: d((r) => push(r).prunedByConstraint),
                        postTrees: d((r) => post(r).conditionalTrees),
                        pushTrees: d((r) => push(r).conditionalTrees),
                        pushPrunedBaseItems: d((r) => push(r).prunedBaseItems),
                        postRss: d((r) => (post(r).peakRssDeltaMB > 0 ? post(r).peakRssDeltaMB : null)),
                        pushRss: d((r) => (push(r).peakRssDeltaMB > 0 ? push(r).peakRssDeltaMB : null)),
                    };
                }
                summary.push(s);
            }
        }
    }
    const failures = rows.filter((r) => r.errors.length).map((r) => ({ profile: r.profile, seed: r.seed, minSupport: r.minSupport, errors: r.errors }));
    const result = {
        meta: { generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform} ${process.arch}`, cpu: os.cpus()[0].model, command: `node scripts/benchmark-constraints.js ${process.argv.slice(2).join(" ")}`.trim(), seconds },
        settings: { generatorVersion: GENERATOR_VERSION, runs: args.runs, minSupport: args.minSupport, profiles: args.profiles, seeds: args.seeds, orders: args.orders, historyOrders: rows[0] && rows[0].historyOrders, resourceLimits: { timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, minSupportFloor: MIN_SUPPORT_FLOOR } },
        failures,
        summary,
        rows,
    };

    const m = (x, digits = 1) => (x && x.n ? x.mean.toFixed(digits) : "–");
    const L = ["# Giai đoạn 4 – Bước 4: Benchmark M2-B — hậu lọc vs cắt tỉa trong khai phá", ""];
    L.push(`Tạo lúc: ${result.meta.generatedAt} · Node ${result.meta.node} · ${result.meta.platform} · ${result.meta.cpu} · tổng ${seconds.toFixed(0)} s`, "");
    L.push(`Cùng lịch sử train ∪ validation (${result.settings.historyOrders} đơn), cùng ngưỡng, cùng ràng buộc B1–B3 (+ không item cùng tổ tiên ở cấp đa mức). Trung vị ${args.runs} lần sau 1 lần chạy lạnh; RSS = mức tăng đỉnh ở lần chạy lạnh; mỗi lượt một tiến trình con. \"Hậu lọc\" = thuật toán gốc + lọc; \"cắt tỉa\" = research/constraints/miners.js.`, "");
    L.push("| Hồ sơ | min_sup | Cấp | Thuật toán | Tập: gốc → giữ | Hậu lọc ms (khai phá + lọc) | Cắt tỉa ms | Nhanh hơn | Candidate đếm: hậu lọc → cắt tỉa (bị loại trước khi đếm) | Cây điều kiện FP: gốc → cắt tỉa (item bị bỏ khỏi cơ sở) | RSS MB hậu lọc / cắt tỉa | Phần bao không ràng buộc ms | Trùng |", "|---|---:|---|---|---|---|---:|---:|---|---|---|---:|:---:|");
    for (const s of summary) {
        for (const algorithm of ["apriori", "fpgrowth"]) {
            const a = s[algorithm];
            const cand = algorithm === "apriori" ? `${m(a.postCounted, 0)} → ${m(a.pushCounted, 0)} (${m(a.pushPruned, 0)})` : "–";
            const trees = algorithm === "fpgrowth" ? `${m(a.postTrees, 0)} → ${m(a.pushTrees, 0)} (${m(a.pushPrunedBaseItems, 0)})` : "–";
            L.push(`| ${s.profile} | ${s.minSupport} | ${s.level === "flat" ? "một cấp" : "đa mức"} | ${algorithm} | ${m(a.rawItemsets, 0)} → ${m(a.keptItemsets, 0)} | ${m(a.postMs)} (${m(a.postMineMs)} + ${m(a.postFilterMs, 2)}) | ${m(a.pushMs)} | ×${m(a.speedup, 2)} | ${cand} | ${trees} | ${m(a.postRss)} / ${m(a.pushRss)} | ${m(a.wrapperNoConstraintMs)} | ${s.allIdentical ? `✔ ${s.n}/${s.n}` : "✘"} |`);
        }
    }
    L.push("", "Giá trị là trung bình qua các seed của trung vị từng seed. \"Nhanh hơn\" = thời gian hậu lọc / thời gian cắt tỉa (< 1 nghĩa là cắt tỉa CHẬM hơn). \"Trùng\": bốn cách (Apriori/FP × hậu lọc/cắt tỉa) cho cùng tập mục (checksum). \"Phần bao không ràng buộc\": bản có cắt tỉa chạy không ràng buộc, đã kiểm tra cho đúng kết quả của thuật toán gốc.", "");
    if (failures.length) L.push(`⚠️ ${failures.length} cấu hình lỗi: ${failures.map((f) => `${f.profile}/${f.seed}/${f.minSupport}: ${f.errors.join(", ")}`).join("; ")}`, "");
    L.push(`Giới hạn: heap ≤ ${args.maxMemoryMb} MB, ${args.timeoutSec} s mỗi lượt; min_sup ≥ ${MIN_SUPPORT_FLOOR}. Tái lập: \`node scripts/benchmark-constraints.js\`; một bộ: \`--profile r1b --seed 20261101\`.`);

    const baseName = args.full ? "phase4-step4-m2-benchmark" : `phase4-step4-m2-benchmark-${args.profiles.join("+")}-seed${args.seeds.join("+")}-sup${args.minSupport.join("+")}-n${args.orders}-r${args.runs}`;
    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(path.join(args.out, `${baseName}.json`), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(args.out, `${baseName}.md`), L.join("\n") + "\n");
    console.log(`\nĐã ghi ${path.join(args.out, baseName)}.{md,json} · ${seconds.toFixed(0)} s`);
}

if (process.argv.includes("--child")) serveChild((job) => measureInChild(job));
else if (require.main === module)
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });

module.exports = { parseArgs, MIN_SUPPORT_FLOOR, measureInChild, constraintsFor };
