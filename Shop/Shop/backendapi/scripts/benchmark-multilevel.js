#!/usr/bin/env node
// Benchmark M1 (Giai đoạn 4 – Bước 3): giao dịch đa mức dài hơn -> đo thời gian và bộ nhớ.
// OFFLINE: không đọc .env, không kết nối MongoDB, không gọi API/cache.
//
//   node scripts/benchmark-multilevel.js
//   node scripts/benchmark-multilevel.js --runs 15 --min-support 0.01,0.005,0.002 --profile r1b --seed 20261101
//
// Cùng lịch sử (train ∪ validation), cùng ngưỡng cho mọi cấp (uniform). Mỗi lượt đo là một tiến trình con riêng
// (--expose-gc, giới hạn heap/thời gian): 1 lần chạy lạnh (đo mức tăng RSS đỉnh) + `runs` lần lấy trung vị.
//   itemsets/flat       : Apriori hoặc FP-Growth trên giao dịch sản phẩm
//   itemsets/multilevel : Apriori hoặc FP-Growth trên giao dịch đã thêm danh mục (đúng phần khai phá của M1)
//   full/flat           : mine() của website (tập phổ biến + mọi luật)
//   full/m1             : fitMultilevel() (mở rộng + khai phá + bỏ tập tầm thường + lọc theo cấp + luật 1 ⇒ 1)

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const { runInChild, serveChild } = require(path.join(ROOT, "research/evaluation/child-process"));

const MIN_SUPPORT_FLOOR = 0.001;

function measureInChild({ mode, algorithm, file, minSupport, runs }) {
    const { apriori } = require(path.join(ROOT, "src/apps/services/mining/apriori"));
    const { fpGrowth } = require(path.join(ROOT, "src/apps/services/mining/fpgrowth"));
    const { mine } = require(path.join(ROOT, "src/apps/services/mining"));
    const { assertMiningBudget } = require(path.join(ROOT, "research/evaluation/budget"));
    const { fitMultilevel } = require(path.join(ROOT, "research/multilevel/recommender"));
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    let task;
    let describeResult;
    if (mode === "itemsets") {
        assertMiningBudget(data.transactions, minSupport);
        const run = { apriori, fpgrowth: fpGrowth }[algorithm];
        task = () => run(data.transactions, { minSupport });
        describeResult = (r) => ({ itemsets: r.itemsets.length, checksum: crypto.createHash("sha1").update(JSON.stringify(r.itemsets)).digest("hex"), candidates: r.stats.totalCandidates ?? null, conditionalTrees: r.stats.conditionalTrees ?? null });
    } else if (mode === "full-flat") {
        assertMiningBudget(data.transactions, minSupport);
        task = () => mine(data.transactions, { algorithm, minSupport, minConfidence: 0 });
        describeResult = (r) => ({ itemsets: r.itemsets.length, rules: r.rules.length });
    } else if (mode === "full-m1") {
        // fitMultilevel tự kiểm tra ngân sách trên giao dịch mở rộng.
        task = () => fitMultilevel(data.history, data.products, { algorithm, productMinSupport: minSupport, categoryMinSupport: minSupport });
        describeResult = (r) => ({ itemsets: r.mining.itemsets.length, rules: r.mining.rules.length });
    } else throw new Error(`mode không hỗ trợ: ${mode}`);

    const gc = global.gc || (() => {});
    gc();
    gc();
    const rssBefore = process.resourceUsage().maxRSS;
    let t0 = process.hrtime.bigint();
    let result = task();
    const coldMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const peakRssDeltaMB = Math.max(0, process.resourceUsage().maxRSS - rssBefore) / 1024;
    const times = [];
    for (let i = 0; i < runs; i++) {
        result = null;
        gc();
        t0 = process.hrtime.bigint();
        result = task();
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    return { ...describeResult(result), coldMs, medianMs: times[Math.floor(times.length / 2)], peakRssDeltaMB };
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-m1-bench-"));
    process.on("exit", () => fs.rmSync(tmpDir, { recursive: true, force: true }));
    const limits = { timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, execArgv: ["--expose-gc"] };
    const measure = (job) => runInChild(__filename, job, limits);
    console.log(`Node ${process.version} | ${process.platform} ${process.arch} | ${os.cpus()[0].model}`);
    const total = args.profiles.length * args.seeds.length * args.minSupport.length;
    console.log(`${total} cấu hình × 6 lượt đo · mỗi lượt: tiến trình riêng, heap ≤ ${args.maxMemoryMb} MB, dừng sau ${args.timeoutSec} s`);
    const started = Date.now();
    const rows = [];
    let k = 0;
    for (const profile of args.profiles) {
        for (const seed of args.seeds) {
            const dataset = generateResearchDataset({ profile, seed, count: args.orders });
            const split = temporalSplit(dataset.orders);
            const history = [...split.train, ...split.validation];
            const flat = history.map((o) => o.items);
            const catalog = hierarchyFromCatalog(dataset.products);
            const extended = extendTransactions(flat, catalog.hierarchy, catalog.toNode);
            const files = { flat: path.join(tmpDir, `${profile}-${seed}-flat.json`), multilevel: path.join(tmpDir, `${profile}-${seed}-ml.json`), m1: path.join(tmpDir, `${profile}-${seed}-m1.json`) };
            fs.writeFileSync(files.flat, JSON.stringify({ transactions: flat }));
            fs.writeFileSync(files.multilevel, JSON.stringify({ transactions: extended }));
            fs.writeFileSync(files.m1, JSON.stringify({ history: history.map((o) => ({ id: o.id, time: o.time, items: o.items })), products: dataset.products }));
            const avgFlat = flat.reduce((s, t) => s + t.length, 0) / flat.length;
            const avgExtended = extended.reduce((s, t) => s + t.length, 0) / extended.length;
            for (const minSupport of args.minSupport) {
                k++;
                const base = { minSupport, runs: args.runs };
                const r = {
                    flatA: await measure({ ...base, mode: "itemsets", algorithm: "apriori", file: files.flat }),
                    flatF: await measure({ ...base, mode: "itemsets", algorithm: "fpgrowth", file: files.flat }),
                    mlA: await measure({ ...base, mode: "itemsets", algorithm: "apriori", file: files.multilevel }),
                    mlF: await measure({ ...base, mode: "itemsets", algorithm: "fpgrowth", file: files.multilevel }),
                    fullFlat: await measure({ ...base, mode: "full-flat", algorithm: "fpgrowth", file: files.flat }),
                    fullM1: await measure({ ...base, mode: "full-m1", algorithm: "fpgrowth", file: files.m1 }),
                };
                const errors = Object.entries(r).filter(([, v]) => v.error).map(([key, v]) => `${key}: ${v.error}`);
                const identical = !errors.length && r.flatA.checksum === r.flatF.checksum && r.mlA.checksum === r.mlF.checksum;
                rows.push({ profile, seed, datasetChecksum: dataset.checksum, minSupport, historyOrders: history.length, avgFlatLength: avgFlat, avgExtendedLength: avgExtended, ...r, identical, errors });
                const tag = `[${k}/${total}] ${profile} seed ${seed} sup ${minSupport}`;
                console.log(
                    errors.length
                        ? `${tag}: LỖI ${errors.join("; ")}`
                        : `${tag}: itemsets ${r.flatA.itemsets} → ${r.mlA.itemsets} | Apriori ${r.flatA.medianMs.toFixed(1)} → ${r.mlA.medianMs.toFixed(1)} ms | FP ${r.flatF.medianMs.toFixed(1)} → ${r.mlF.medianMs.toFixed(1)} ms | toàn bộ ${r.fullFlat.medianMs.toFixed(1)} → ${r.fullM1.medianMs.toFixed(1)} ms | trùng: ${identical}`
                );
                if (!identical) process.exitCode = 1;
            }
        }
    }
    const seconds = (Date.now() - started) / 1000;
    const ok = (x) => x && !x.error;
    const summary = [];
    for (const profile of args.profiles) {
        for (const minSupport of args.minSupport) {
            const g = rows.filter((r) => r.profile === profile && r.minSupport === minSupport && !r.errors.length);
            const d = (f) => describe(g.map(f).filter((x) => x !== null && x !== undefined && !Number.isNaN(x)));
            summary.push({
                profile,
                minSupport,
                n: g.length,
                allIdentical: g.length > 0 && g.every((r) => r.identical),
                avgFlatLength: d((r) => r.avgFlatLength),
                avgExtendedLength: d((r) => r.avgExtendedLength),
                flat: { itemsets: d((r) => r.flatA.itemsets), candidates: d((r) => r.flatA.candidates), aprioriMs: d((r) => r.flatA.medianMs), fpMs: d((r) => r.flatF.medianMs), aprioriRss: d((r) => (r.flatA.peakRssDeltaMB > 0 ? r.flatA.peakRssDeltaMB : null)), fpRss: d((r) => (r.flatF.peakRssDeltaMB > 0 ? r.flatF.peakRssDeltaMB : null)) },
                multilevel: { itemsets: d((r) => r.mlA.itemsets), candidates: d((r) => r.mlA.candidates), aprioriMs: d((r) => r.mlA.medianMs), fpMs: d((r) => r.mlF.medianMs), aprioriRss: d((r) => (r.mlA.peakRssDeltaMB > 0 ? r.mlA.peakRssDeltaMB : null)), fpRss: d((r) => (r.mlF.peakRssDeltaMB > 0 ? r.mlF.peakRssDeltaMB : null)) },
                full: { flatMs: d((r) => r.fullFlat.medianMs), m1Ms: d((r) => r.fullM1.medianMs), flatRules: d((r) => r.fullFlat.rules), m1Rules: d((r) => r.fullM1.rules), flatRss: d((r) => (r.fullFlat.peakRssDeltaMB > 0 ? r.fullFlat.peakRssDeltaMB : null)), m1Rss: d((r) => (r.fullM1.peakRssDeltaMB > 0 ? r.fullM1.peakRssDeltaMB : null)) },
                slowdown: { apriori: d((r) => r.mlA.medianMs / r.flatA.medianMs), fpgrowth: d((r) => r.mlF.medianMs / r.flatF.medianMs), full: d((r) => r.fullM1.medianMs / r.fullFlat.medianMs) },
            });
        }
    }
    const failures = rows.filter((r) => r.errors.length).map((r) => ({ profile: r.profile, seed: r.seed, minSupport: r.minSupport, errors: r.errors }));
    const { DEFAULT_LIMITS } = require(path.join(ROOT, "research/evaluation/budget"));
    const result = {
        meta: { generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform} ${process.arch}`, cpu: os.cpus()[0].model, command: `node scripts/benchmark-multilevel.js ${process.argv.slice(2).join(" ")}`.trim(), seconds },
        settings: { generatorVersion: GENERATOR_VERSION, runs: args.runs, minSupport: args.minSupport, profiles: args.profiles, seeds: args.seeds, orders: args.orders, historyOrders: rows[0] && rows[0].historyOrders, resourceLimits: { timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, minSupportFloor: MIN_SUPPORT_FLOOR, miningBudget: DEFAULT_LIMITS } },
        failures,
        summary,
        rows: rows.map((r) => ({ ...r, ok: ok(r.flatA) })),
    };

    const m = (x, digits = 1) => (x && x.n ? x.mean.toFixed(digits) : "–");
    const L = ["# Giai đoạn 4 – Bước 3: Benchmark M1 (giao dịch đa mức) trên R1/R1b", ""];
    L.push(`Tạo lúc: ${result.meta.generatedAt} · Node ${result.meta.node} · ${result.meta.platform} · ${result.meta.cpu} · tổng ${seconds.toFixed(0)} s`, "");
    L.push(`Lịch sử train ∪ validation (${result.settings.historyOrders} đơn) của mỗi bộ; ngưỡng uniform giống nhau cho mọi cấp; trung vị ${args.runs} lần sau 1 lần chạy lạnh; RSS = mức tăng đỉnh ở lần chạy lạnh; mỗi lượt một tiến trình con riêng. Không dùng API/cache.`, "");
    L.push("| Hồ sơ | min_sup | Độ dài GD một cấp → đa mức | Itemsets | Apriori ms | FP-Growth ms | Chậm hơn A / FP | RSS đỉnh MB (A, FP) một cấp → đa mức | Toàn bộ ms: mine() → fitMultilevel() | A = FP |", "|---|---:|---|---|---|---|---|---|---|:---:|");
    for (const s of summary) {
        if (!s.n) {
            L.push(`| ${s.profile} | ${s.minSupport} | lỗi ở mọi seed |||||||| |`);
            continue;
        }
        L.push(
            `| ${s.profile} | ${s.minSupport} | ${m(s.avgFlatLength, 2)} → ${m(s.avgExtendedLength, 2)} | ${m(s.flat.itemsets, 0)} → ${m(s.multilevel.itemsets, 0)} | ${m(s.flat.aprioriMs)} → ${m(s.multilevel.aprioriMs)} | ${m(s.flat.fpMs)} → ${m(s.multilevel.fpMs)} | ×${m(s.slowdown.apriori, 1)} / ×${m(s.slowdown.fpgrowth, 1)} | (${m(s.flat.aprioriRss)}, ${m(s.flat.fpRss)}) → (${m(s.multilevel.aprioriRss)}, ${m(s.multilevel.fpRss)}) | ${m(s.full.flatMs)} → ${m(s.full.m1Ms)} (×${m(s.slowdown.full, 1)}) | ${s.allIdentical ? `✔ ${s.n}/${s.n}` : "✘"} |`
        );
    }
    L.push("", "Giá trị là trung bình qua các seed của trung vị từng seed. \"A = FP\": Apriori và FP-Growth cho cùng tập phổ biến (checksum) trên cả giao dịch một cấp và đa mức.");
    L.push("\"Toàn bộ\": mine() của website sinh mọi luật từ mọi tập; fitMultilevel() chỉ sinh luật 1 ⇒ 1 (đủ cho gợi ý) nhưng thêm bước mở rộng giao dịch, bỏ tập tầm thường và lọc theo cấp.", "");
    if (failures.length) L.push(`⚠️ ${failures.length} cấu hình lỗi: ${failures.map((f) => `${f.profile}/${f.seed}/${f.minSupport}: ${f.errors.join(", ")}`).join("; ")}`, "");
    L.push(`Giới hạn: heap ≤ ${args.maxMemoryMb} MB, ${args.timeoutSec} s mỗi lượt; min_sup ≥ ${MIN_SUPPORT_FLOOR}; kiểm tra ngân sách khai phá trước mỗi lượt. Tái lập: \`node scripts/benchmark-multilevel.js\`; một bộ: \`--profile r1b --seed 20261101\`.`);

    const baseName = args.full ? "phase4-step3-m1-benchmark" : `phase4-step3-m1-benchmark-${args.profiles.join("+")}-seed${args.seeds.join("+")}-sup${args.minSupport.join("+")}-n${args.orders}-r${args.runs}`;
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

module.exports = { parseArgs, MIN_SUPPORT_FLOOR, measureInChild };
