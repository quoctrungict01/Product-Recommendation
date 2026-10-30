#!/usr/bin/env node
// Đánh giá baseline và hệ thống gợi ý hiện tại trên bộ dữ liệu nghiên cứu R1/R1b (Giai đoạn 4 – Bước 2).
// Offline: không đọc .env, không kết nối MongoDB, không dùng cache website. Dữ liệu sinh lại từ seed.
//
//   node scripts/evaluate-research-datasets.js                         # đủ 2 hồ sơ × 5 seed (~2 phút)
//   node scripts/evaluate-research-datasets.js --profile r1 --seed 20261101   # chạy riêng một bộ
//   node scripts/evaluate-research-datasets.js --profile r1b --seeds 2        # 2 seed đầu của R1b
//   node scripts/evaluate-research-datasets.js --timeout 600 --max-memory-mb 2048
//   node scripts/evaluate-research-datasets.js --export-dir ../r1-data        # xuất dữ liệu + metadata JSON (nên để ngoài repo)
//
// An toàn tài nguyên: mỗi bộ dữ liệu chạy trong một tiến trình con riêng, giới hạn heap (--max-memory-mb)
// và thời gian (--timeout giây); trước mỗi lần khai phá có kiểm tra ngân sách (research/evaluation/budget.js).
// Dùng --no-isolate để chạy trong cùng tiến trình (không có giới hạn thời gian).

const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const {
    generateResearchDataset,
    generateProfileBaskets,
    datasetMetadata,
    PROFILES,
    RESEARCH_SEEDS,
    GENERATOR_VERSION,
} = require("../research/datasets/generator");
const { datasetFromSeedPlan } = require("../research/evaluation/dataset");
const { generateOrderBaskets } = require("./seed-demo/orders");
const { runEvaluation, DEFAULT_GRID } = require("../research/evaluation/runner");
const { DEFAULT_RATIOS } = require("../research/evaluation/split");
const { rareProductsOf, summarizeRun, aggregateRuns } = require("../research/evaluation/aggregate");
const { DEFAULT_LIMITS } = require("../research/evaluation/budget");
const { toMarkdownMulti } = require("../research/evaluation/report-multi");

// Checksum dữ liệu demo 1.000 đơn (GR2, seed 20261026) ghi trong báo cáo Bước 1.
const DEMO_CHECKSUM = "d1eb602b9280f67944583f56b7e9f832539a7925";
const RARE_THRESHOLD = 0.005;
const OUT_DEFAULT = path.join(__dirname, "..", "research-results");

function parseArgs(argv) {
    const args = {
        profiles: ["r1", "r1b"],
        seeds: [...RESEARCH_SEEDS],
        orders: 20000,
        bootstrap: 1000,
        out: OUT_DEFAULT,
        exportDir: null,
        isolate: true,
        timeoutSec: 600,
        maxMemoryMb: 2048,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            if (i + 1 >= argv.length) throw new Error(`Thiếu giá trị cho ${a}`);
            return argv[++i];
        };
        if (a === "--profiles" || a === "--profile") args.profiles = next().split(",");
        else if (a === "--seeds") args.seeds = RESEARCH_SEEDS.slice(0, Number(next()));
        else if (a === "--seed") args.seeds = next().split(",").map(Number);
        else if (a === "--orders") args.orders = Number(next());
        else if (a === "--bootstrap") args.bootstrap = Number(next());
        else if (a === "--out") args.out = next();
        else if (a === "--export-dir") args.exportDir = next();
        else if (a === "--no-isolate") args.isolate = false;
        else if (a === "--timeout") args.timeoutSec = Number(next());
        else if (a === "--max-memory-mb") args.maxMemoryMb = Number(next());
        else throw new Error(`Tham số không hỗ trợ: ${a}`);
    }
    for (const p of args.profiles) if (!PROFILES[p]) throw new Error(`Hồ sơ không hỗ trợ: ${p}`);
    if (!args.seeds.length || args.seeds.some((s) => !Number.isInteger(s))) throw new Error("--seeds/--seed phải là số nguyên, ít nhất 1 seed");
    if (!Number.isInteger(args.orders) || args.orders < 100 || args.orders > 200000) throw new Error("--orders phải là số nguyên 100..200000");
    if (!Number.isInteger(args.bootstrap) || args.bootstrap < 10) throw new Error("--bootstrap phải là số nguyên ≥ 10");
    if (!(args.timeoutSec > 0)) throw new Error("--timeout phải > 0");
    if (!(args.maxMemoryMb >= 256)) throw new Error("--max-memory-mb phải ≥ 256");
    return args;
}

const isFullRun = (args) =>
    args.orders === 20000 && args.profiles.join() === "r1,r1b" && args.seeds.join() === RESEARCH_SEEDS.join();

/** Một bộ dữ liệu: sinh -> (xuất) -> đánh giá -> tóm tắt. Dùng chung cho tiến trình con và --no-isolate. */
function evaluateOne({ profile, seed, orders, bootstrap, exportDir }, onProgress = () => {}) {
    const t0 = Date.now();
    onProgress("sinh dữ liệu");
    const dataset = generateResearchDataset({ profile, seed, count: orders });
    const metadata = datasetMetadata(dataset);
    if (exportDir) {
        fs.mkdirSync(exportDir, { recursive: true });
        fs.writeFileSync(path.join(exportDir, `${dataset.name}.meta.json`), JSON.stringify(metadata, null, 2));
        fs.writeFileSync(path.join(exportDir, `${dataset.name}.json`), JSON.stringify({ ...metadata, products: dataset.products, orders: dataset.orders }));
        onProgress(`đã xuất ${dataset.name}.json`);
    }
    const report = runEvaluation(dataset, { bootstrap, onProgress });
    const rare = rareProductsOf(dataset, { ratios: DEFAULT_RATIOS, rareThreshold: RARE_THRESHOLD });
    return { metadata, summary: summarizeRun(dataset, report, rare, { seconds: (Date.now() - t0) / 1000 }) };
}

function runChild() {
    process.once("message", (job) => {
        try {
            const result = evaluateOne(job, (msg) => process.send({ type: "progress", msg }));
            process.send({ type: "result", ...result });
        } catch (err) {
            process.send({ type: "error", message: err.message || String(err) });
        }
    });
}

function runIsolated(job, { timeoutSec, maxMemoryMb }, log) {
    return new Promise((resolve) => {
        const child = fork(__filename, ["--child"], { execArgv: [`--max-old-space-size=${maxMemoryMb}`], stdio: ["ignore", "inherit", "inherit", "ipc"] });
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.kill();
            resolve(value);
        };
        const timer = setTimeout(() => done({ error: `quá thời gian ${timeoutSec} s (đã dừng tiến trình)` }), timeoutSec * 1000);
        child.on("message", (msg) => {
            if (msg.type === "progress") log(msg.msg);
            else if (msg.type === "result") done(msg);
            else if (msg.type === "error") done({ error: msg.message });
        });
        child.once("exit", (code, signal) => done({ error: `tiến trình con kết thúc bất thường (mã ${code}${signal ? `, ${signal}` : ""}) — có thể vượt giới hạn bộ nhớ ${maxMemoryMb} MB` }));
        child.send(job);
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const started = Date.now();

    // Dữ liệu demo GR2 không bị ảnh hưởng: bộ sinh demo vẫn cho đúng checksum cũ, và hồ sơ r1 tái tạo y hệt bộ sinh demo.
    const gr2Check = {
        demoChecksum: datasetFromSeedPlan().checksum,
        demoChecksumUnchanged: datasetFromSeedPlan().checksum === DEMO_CHECKSUM,
        r1ReproducesDemoGenerator:
            JSON.stringify(generateOrderBaskets({ count: 1000, seed: 20261026 })) === JSON.stringify(generateProfileBaskets({ profile: "r1", count: 1000, seed: 20261026 })),
    };
    if (!gr2Check.demoChecksumUnchanged || !gr2Check.r1ReproducesDemoGenerator) throw new Error("Bộ sinh dữ liệu demo đã thay đổi — dừng lại.");

    const jobs = args.profiles.flatMap((profile) => args.seeds.map((seed) => ({ profile, seed, orders: args.orders, bootstrap: args.bootstrap, exportDir: args.exportDir })));
    console.error(`${jobs.length} bộ dữ liệu · ${args.isolate ? `tiến trình riêng, giới hạn ${args.maxMemoryMb} MB heap và ${args.timeoutSec} s mỗi bộ` : "cùng tiến trình (--no-isolate)"}`);

    const summaries = {};
    const manifest = [];
    const failures = [];
    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const name = `${job.profile.toUpperCase()}-seed${job.seed}-n${job.orders}`;
        const tag = `[${i + 1}/${jobs.length}] ${name}`;
        const log = (msg) => console.error(`${tag}: ${msg}`);
        log("bắt đầu");
        let result;
        if (args.isolate) result = await runIsolated(job, args, log);
        else {
            try {
                result = evaluateOne(job, log);
            } catch (err) {
                result = { error: err.message };
            }
        }
        if (result.error) {
            log(`LỖI — ${result.error}`);
            failures.push({ name, error: result.error });
            continue;
        }
        const best = result.summary.results.find((r) => r.key === "tuned-with-fallback").summary;
        log(`xong sau ${result.summary.seconds.toFixed(1)} s · checksum ${result.metadata.checksum.slice(0, 12)} · tham số ${JSON.stringify(result.summary.tuning.selected)} · Recall@5 (luật + fallback) ${(best.recall * 100).toFixed(1)}%`);
        (summaries[job.profile] = summaries[job.profile] || []).push(result.summary);
        manifest.push(result.metadata);
    }

    const profiles = Object.fromEntries(Object.entries(summaries).map(([p, list]) => [p, aggregateRuns(list)]));
    const settings = {
        generatorVersion: GENERATOR_VERSION,
        profiles: Object.fromEntries(args.profiles.map((p) => [p, PROFILES[p]])),
        seeds: args.seeds,
        orders: args.orders,
        from: "2026-04-01",
        to: "2026-10-25",
        ratios: DEFAULT_RATIOS,
        grid: DEFAULT_GRID,
        bootstrap: args.bootstrap,
        rareThreshold: RARE_THRESHOLD,
        resourceLimits: { isolate: args.isolate, timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, miningBudget: DEFAULT_LIMITS },
    };
    const benchmarkFile = path.join(args.out, "phase4-step2-benchmark.json");
    const benchmark = fs.existsSync(benchmarkFile) ? JSON.parse(fs.readFileSync(benchmarkFile, "utf8")) : null;
    const meta = {
        generatedAt: new Date().toISOString(),
        node: process.version,
        command: `node scripts/evaluate-research-datasets.js ${process.argv.slice(2).join(" ")}`.trim(),
        seconds: (Date.now() - started) / 1000,
        datasetSeconds: manifest.length ? Object.values(summaries).flat().reduce((s, x) => s + x.seconds, 0) : 0,
    };
    const result = { meta, settings, gr2Check, failures, datasets: manifest, profiles };

    const full = isFullRun(args);
    const suffix = full ? "" : `-${args.profiles.join("+")}-seed${args.seeds.join("+")}-n${args.orders}`;
    fs.mkdirSync(args.out, { recursive: true });
    if (Object.keys(profiles).length) {
        const md = toMarkdownMulti(result, full ? benchmark : null, meta);
        fs.writeFileSync(path.join(args.out, `phase4-step2-r1-evaluation${suffix}.md`), md);
        process.stdout.write(md);
    }
    fs.writeFileSync(path.join(args.out, `phase4-step2-r1-evaluation${suffix}.json`), JSON.stringify(result, null, 2));
    if (full) {
        fs.writeFileSync(
            path.join(args.out, "phase4-step2-datasets.json"),
            JSON.stringify({ generatorVersion: GENERATOR_VERSION, generatedAt: meta.generatedAt, demoGR2: gr2Check, datasets: manifest }, null, 2)
        );
    }
    console.error(`\nĐã ghi ${path.join(args.out, `phase4-step2-r1-evaluation${suffix}`)}.{md,json}${full ? " và phase4-step2-datasets.json" : ""} · tổng ${meta.seconds.toFixed(0)} s`);
    if (failures.length) {
        console.error(`${failures.length} bộ lỗi: ${failures.map((f) => f.name).join(", ")}`);
        process.exitCode = 1;
    }
}

if (process.argv.includes("--child")) runChild();
else if (require.main === module) {
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
}

module.exports = { parseArgs, isFullRun, evaluateOne, DEMO_CHECKSUM };
