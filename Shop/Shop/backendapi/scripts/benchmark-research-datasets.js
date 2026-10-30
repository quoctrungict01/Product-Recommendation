#!/usr/bin/env node
// Benchmark có kiểm soát Apriori vs FP-Growth trên bộ dữ liệu nghiên cứu R1/R1b (Giai đoạn 4 – Bước 2).
// Offline: không đọc .env, không kết nối MongoDB, không gọi API/cache website.
//
//   node scripts/benchmark-research-datasets.js
//   node scripts/benchmark-research-datasets.js --runs 15 --min-support 0.01,0.005,0.002 --profiles r1,r1b --seeds 5
//
// Tiến trình cha sinh dữ liệu từ seed, lấy train ∪ validation theo thời gian (đúng phần lịch sử dùng khi
// chấm test) và ghi giao dịch ra file tạm trong thư mục temp của hệ điều hành (xóa khi kết thúc).
// Mỗi lượt đo (hồ sơ × seed × min_sup × thuật toán) chạy trong một tiến trình con riêng (--expose-gc):
// đọc file giao dịch, chạy 1 lần "lạnh" (đo mức tăng RSS đỉnh) rồi `runs` lần để lấy trung vị thời gian.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { fork } = require("child_process");

const ROOT = path.join(__dirname, "..");

function runChild() {
    const { apriori } = require(path.join(ROOT, "src/apps/services/mining/apriori"));
    const { fpGrowth } = require(path.join(ROOT, "src/apps/services/mining/fpgrowth"));
    const ALG = { apriori, fpgrowth: fpGrowth };

    process.once("message", ({ transactionsFile, datasetChecksum, algorithm, minSupport, runs }) => {
        // Giao dịch được tiến trình cha sinh sẵn và ghi ra file tạm: việc sinh dữ liệu (tốn bộ nhớ)
        // không làm tăng mức RSS đỉnh của tiến trình đo, nên đo được đỉnh của riêng lần khai phá.
        const transactions = JSON.parse(fs.readFileSync(transactionsFile, "utf8"));
        const gc = global.gc || (() => {});
        const run = ALG[algorithm];
        try {
            // Dừng sớm nếu ước lượng cho thấy có nguy cơ bùng nổ tập ứng viên.
            require(path.join(ROOT, "research/evaluation/budget")).assertMiningBudget(transactions, minSupport);
        } catch (err) {
            process.send({ error: err.message });
            return;
        }

        gc();
        gc();
        const heapBefore = process.memoryUsage().heapUsed;
        const rssBefore = process.resourceUsage().maxRSS;
        let t0 = process.hrtime.bigint();
        let result = run(transactions, { minSupport });
        const coldMs = Number(process.hrtime.bigint() - t0) / 1e6;
        const rssAfter = process.resourceUsage().maxRSS;
        gc();
        gc();
        const heapRetained = process.memoryUsage().heapUsed - heapBefore;

        const times = [];
        for (let i = 0; i < runs; i++) {
            result = null;
            gc();
            t0 = process.hrtime.bigint();
            result = run(transactions, { minSupport });
            times.push(Number(process.hrtime.bigint() - t0) / 1e6);
        }
        times.sort((a, b) => a - b);
        process.send({
            datasetChecksum,
            historyOrders: transactions.length,
            itemsets: result.itemsets.length,
            checksum: crypto.createHash("sha1").update(JSON.stringify(result.itemsets)).digest("hex"),
            candidates: result.stats.totalCandidates ?? null,
            conditionalTrees: result.stats.conditionalTrees ?? null,
            minSupportCount: result.stats.minSupportCount,
            coldMs,
            medianMs: times[Math.floor(times.length / 2)],
            peakRssDeltaMB: Math.max(0, rssAfter - rssBefore) / 1024,
            heapRetainedMB: Math.max(0, heapRetained) / (1024 * 1024),
        });
    });
}

function measure(job, { timeoutSec, maxMemoryMb }) {
    return new Promise((resolve) => {
        const child = fork(__filename, ["--child"], { execArgv: ["--expose-gc", `--max-old-space-size=${maxMemoryMb}`], stdio: ["ignore", "inherit", "inherit", "ipc"] });
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.kill();
            resolve(value);
        };
        const timer = setTimeout(() => done({ error: `quá ${timeoutSec} s (đã dừng tiến trình)` }), timeoutSec * 1000);
        child.once("message", done);
        child.once("exit", (code, signal) => done({ error: `tiến trình con kết thúc bất thường (mã ${code}${signal ? `, ${signal}` : ""}) — có thể vượt ${maxMemoryMb} MB` }));
        child.send(job);
    });
}

// Sàn min_sup: thấp hơn mức này dễ làm số tập phổ biến bùng nổ trên dữ liệu lớn.
const MIN_SUPPORT_FLOOR = 0.001;

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
    args.full = args.orders === 20000 && args.profiles.join() === "r1,r1b" && args.seeds.join() === RESEARCH_SEEDS.join() && args.minSupport.join() === "0.01,0.005,0.002";
    return args;
}

async function main() {
    const { describe } = require(path.join(ROOT, "research/evaluation/aggregate"));
    const { generateResearchDataset } = require(path.join(ROOT, "research/datasets/generator"));
    const { temporalSplit } = require(path.join(ROOT, "research/evaluation/split"));
    const os = require("os");
    const args = parseArgs(process.argv.slice(2));
    const rows = [];
    // Thư mục tạm của hệ điều hành (ngoài repo), xóa khi kết thúc.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trungshop-bench-"));
    process.on("exit", () => fs.rmSync(tmpDir, { recursive: true, force: true }));
    console.log(`Node ${process.version} | ${process.platform} ${process.arch} | ${os.cpus()[0].model}`);
    const total = args.profiles.length * args.seeds.length * args.minSupport.length;
    console.log(`${total} cấu hình × 2 thuật toán · mỗi lượt: tiến trình riêng, heap ≤ ${args.maxMemoryMb} MB, dừng sau ${args.timeoutSec} s`);
    const started = Date.now();
    let k = 0;
    for (const profile of args.profiles) {
        for (const seed of args.seeds) {
            const dataset = generateResearchDataset({ profile, seed, count: args.orders });
            const split = temporalSplit(dataset.orders);
            const transactionsFile = path.join(tmpDir, `${profile}-${seed}.json`);
            fs.writeFileSync(transactionsFile, JSON.stringify([...split.train, ...split.validation].map((o) => o.items)));
            for (const minSupport of args.minSupport) {
                k++;
                const job = { transactionsFile, datasetChecksum: dataset.checksum, minSupport, runs: args.runs };
                const a = await measure({ ...job, algorithm: "apriori" }, args);
                const f = await measure({ ...job, algorithm: "fpgrowth" }, args);
                const identical = !a.error && !f.error && a.checksum === f.checksum;
                rows.push({ profile, seed, datasetChecksum: dataset.checksum, minSupport, apriori: a, fpgrowth: f, identical });
                const tag = `[${k}/${total}] ${profile} seed ${seed} sup ${minSupport}`;
                console.log(
                    a.error || f.error
                        ? `${tag}: LỖI ${a.error || ""} ${f.error || ""}`
                        : `${tag} (≥${a.minSupportCount} đơn): itemsets ${a.itemsets} | Apriori ${a.medianMs.toFixed(1)} ms, FP ${f.medianMs.toFixed(1)} ms | RSS +${a.peakRssDeltaMB.toFixed(1)}/+${f.peakRssDeltaMB.toFixed(1)} MB | trùng: ${identical}`
                );
                if (!identical) process.exitCode = 1;
            }
        }
    }
    const seconds = (Date.now() - started) / 1000;

    const summary = [];
    for (const profile of args.profiles) {
        for (const minSupport of args.minSupport) {
            const group = rows.filter((r) => r.profile === profile && r.minSupport === minSupport && !r.apriori.error && !r.fpgrowth.error);
            summary.push({
                profile,
                minSupport,
                n: group.length,
                allIdentical: group.length > 0 && group.every((r) => r.identical),
                itemsets: describe(group.map((r) => r.apriori.itemsets)),
                candidates: describe(group.map((r) => r.apriori.candidates)),
                conditionalTrees: describe(group.map((r) => r.fpgrowth.conditionalTrees)),
                aprioriMs: describe(group.map((r) => r.apriori.medianMs)),
                fpMs: describe(group.map((r) => r.fpgrowth.medianMs)),
                ratio: describe(group.map((r) => r.apriori.medianMs / r.fpgrowth.medianMs)),
                // RSS là mức "cao nhất từng đạt"; mức tăng 0 nghĩa là đỉnh của lần khai phá không vượt mức nền -> không đo được.
                aprioriRss: describe(group.map((r) => r.apriori.peakRssDeltaMB).filter((x) => x > 0)),
                fpRss: describe(group.map((r) => r.fpgrowth.peakRssDeltaMB).filter((x) => x > 0)),
                rssUnmeasured: group.filter((r) => !(r.apriori.peakRssDeltaMB > 0) || !(r.fpgrowth.peakRssDeltaMB > 0)).length,
                aprioriHeapMB: describe(group.map((r) => r.apriori.heapRetainedMB)),
                fpHeapMB: describe(group.map((r) => r.fpgrowth.heapRetainedMB)),
            });
        }
    }
    const historyOrders = rows.find((r) => !r.apriori.error)?.apriori.historyOrders;
    const failures = rows.filter((r) => r.apriori.error || r.fpgrowth.error).map((r) => ({ profile: r.profile, seed: r.seed, minSupport: r.minSupport, error: r.apriori.error || r.fpgrowth.error }));
    const { GENERATOR_VERSION } = require(path.join(ROOT, "research/datasets/generator"));
    const { DEFAULT_LIMITS } = require(path.join(ROOT, "research/evaluation/budget"));
    const result = {
        meta: { generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform} ${process.arch}`, cpu: require("os").cpus()[0].model, command: `node scripts/benchmark-research-datasets.js ${process.argv.slice(2).join(" ")}`.trim(), seconds },
        settings: {
            generatorVersion: GENERATOR_VERSION,
            runs: args.runs,
            minSupport: args.minSupport,
            profiles: args.profiles,
            seeds: args.seeds,
            orders: args.orders,
            historyOrders,
            resourceLimits: { timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, minSupportFloor: MIN_SUPPORT_FLOOR, miningBudget: DEFAULT_LIMITS },
        },
        failures,
        summary,
        rows,
    };

    const L = ["# Giai đoạn 4 – Bước 2: Benchmark Apriori vs FP-Growth trên R1/R1b", ""];
    L.push(`Tạo lúc: ${result.meta.generatedAt} · Node ${result.meta.node} · ${result.meta.platform} · ${result.meta.cpu}`, "");
    L.push(`Khai phá trên train ∪ validation (${historyOrders} đơn) của mỗi bộ; tiến trình con riêng cho mỗi lượt; thời gian = trung vị ${args.runs} lần sau 1 lần chạy lạnh; RSS = mức tăng bộ nhớ đỉnh ở lần chạy lạnh (dữ liệu được sinh ở tiến trình cha, nên không tính vào). Không dùng API hay cache.`, "");
    const mb = (d) => (d.mean === null ? "–" : d.mean.toFixed(1));
    L.push("| Hồ sơ | min_sup | Itemsets | Candidate Apriori | Cây điều kiện FP | Apriori ms (TB ± SD) | FP-Growth ms (TB ± SD) | A/FP [min–max] | RSS đỉnh A / FP MB | Trùng |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|");
    for (const s of summary) {
        if (s.n === 0) {
            L.push(`| ${s.profile} | ${s.minSupport} | lỗi ở mọi seed (xem mục lỗi) ||||||||  |`);
            continue;
        }
        L.push(
            `| ${s.profile} | ${s.minSupport} | ${s.itemsets.mean.toFixed(0)} | ${s.candidates.mean.toFixed(0)} | ${s.conditionalTrees.mean.toFixed(0)} | ${s.aprioriMs.mean.toFixed(1)} ± ${s.aprioriMs.sd.toFixed(1)} | ${s.fpMs.mean.toFixed(1)} ± ${s.fpMs.sd.toFixed(1)} | ×${s.ratio.mean.toFixed(2)} [${s.ratio.min.toFixed(2)}–${s.ratio.max.toFixed(2)}] | ${mb(s.aprioriRss)} / ${mb(s.fpRss)}${s.rssUnmeasured ? ` (${s.rssUnmeasured} lượt không đo được)` : ""} | ${s.allIdentical ? `✔ ${s.n}/${s.n}` : "✘"} |`
        );
    }
    L.push("", "TB ± SD qua các seed; [min–max] của tỷ lệ thời gian Apriori/FP-Growth. Thời gian và bộ nhớ phụ thuộc máy, chỉ dùng để so tương đối hai thuật toán.", "");
    L.push(`Bộ sinh \`${GENERATOR_VERSION}\` · checksum dữ liệu từng seed trong file JSON · tổng thời gian ${seconds.toFixed(0)} s.`);
    L.push(`Giới hạn: mỗi lượt heap ≤ ${args.maxMemoryMb} MB, dừng sau ${args.timeoutSec} s; min_sup ≥ ${MIN_SUPPORT_FLOOR}; kiểm tra ngân sách khai phá trước mỗi lượt.`, "");
    if (failures.length) L.push(`⚠️ ${failures.length} lượt lỗi: ${failures.map((f) => `${f.profile}/${f.seed}/${f.minSupport}: ${f.error}`).join("; ")}`, "");
    L.push("Tái lập: `node scripts/benchmark-research-datasets.js` (cùng tham số). Chạy riêng một bộ: `--profile r1 --seed 20261101`.");

    const base = args.full ? "phase4-step2-benchmark" : `phase4-step2-benchmark-${args.profiles.join("+")}-seed${args.seeds.join("+")}-sup${args.minSupport.join("+")}-n${args.orders}`;
    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(path.join(args.out, `${base}.json`), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(args.out, `${base}.md`), L.join("\n") + "\n");
    console.log(`\nĐã ghi ${path.join(args.out, base)}.{md,json} · ${seconds.toFixed(0)} s`);
}

if (process.argv.includes("--child")) runChild();
else if (require.main === module)
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });

module.exports = { parseArgs, MIN_SUPPORT_FLOOR };
