#!/usr/bin/env node
// Đánh giá M1 — luật kết hợp đa mức (Giai đoạn 4 – Bước 3) trên R1/R1b. OFFLINE: không đọc .env,
// không kết nối MongoDB, không gọi API/cache website. Dữ liệu sinh lại từ seed và đối chiếu checksum với Bước 2.
//
//   node scripts/evaluate-multilevel.js                                 # 2 hồ sơ × 5 seed (~5 phút)
//   node scripts/evaluate-multilevel.js --profile r1b --seed 20261103   # chạy riêng một bộ
//   node scripts/evaluate-multilevel.js --timeout 900 --max-memory-mb 2048 --bootstrap 1000
//
// Mỗi bộ chạy trong tiến trình con riêng (giới hạn heap và thời gian); trước mỗi lần khai phá có kiểm tra ngân sách.

const fs = require("fs");
const path = require("path");
const { generateResearchDataset, PROFILES, RESEARCH_SEEDS, GENERATOR_VERSION } = require("../research/datasets/generator");
const { datasetFromSeedPlan } = require("../research/evaluation/dataset");
const { DEFAULT_GRID } = require("../research/evaluation/runner");
const { DEFAULT_RATIOS } = require("../research/evaluation/split");
const { DEFAULT_LIMITS } = require("../research/evaluation/budget");
const { runInChild, serveChild } = require("../research/evaluation/child-process");
const { runMultilevelEvaluation, DEFAULT_M1_GRID } = require("../research/multilevel/evaluate");
const { summarizeM1Run, aggregateM1Runs } = require("../research/multilevel/aggregate");
const { toMarkdownM1 } = require("../research/multilevel/report");
// Checksum dữ liệu demo 1.000 đơn (GR2, seed 20261026) — như scripts/evaluate-research-datasets.js.
// (Không require script đó: nó tự phục vụ IPC khi thấy cờ --child.)
const DEMO_CHECKSUM = "d1eb602b9280f67944583f56b7e9f832539a7925";
const OUT_DEFAULT = path.join(__dirname, "..", "research-results");
const RARE_THRESHOLD = 0.005;

function parseArgs(argv) {
    const args = { profiles: ["r1", "r1b"], seeds: [...RESEARCH_SEEDS], orders: 20000, bootstrap: 1000, out: OUT_DEFAULT, isolate: true, timeoutSec: 900, maxMemoryMb: 2048 };
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
    args.full = args.orders === 20000 && args.profiles.join() === "r1,r1b" && args.seeds.join() === RESEARCH_SEEDS.join() && args.bootstrap === 1000;
    return args;
}

/** Một bộ dữ liệu: sinh -> đánh giá M1 -> tóm tắt gọn. */
function evaluateOne({ profile, seed, orders, bootstrap }, onProgress = () => {}) {
    const t0 = Date.now();
    onProgress("sinh dữ liệu");
    const dataset = generateResearchDataset({ profile, seed, count: orders });
    const report = runMultilevelEvaluation(dataset, { bootstrap, rareThreshold: RARE_THRESHOLD, onProgress });
    return { summary: summarizeM1Run(report, { seconds: (Date.now() - t0) / 1000 }) };
}

/** Đối chiếu checksum với manifest Bước 2 (nếu có), để chắc chắn đánh giá trên ĐÚNG các bộ dữ liệu đó. */
function compareWithStep2(summaries, outDir) {
    const file = path.join(outDir, "phase4-step2-datasets.json");
    if (!fs.existsSync(file)) return { comparedWithStep2: false, allMatch: null, rows: [] };
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    const byName = new Map(manifest.datasets.map((d) => [d.name, d.checksum]));
    const rows = summaries.map((s) => ({ name: s.dataset.name, checksum: s.dataset.checksum, step2: byName.get(s.dataset.name) || null }));
    const known = rows.filter((r) => r.step2);
    return { comparedWithStep2: known.length > 0, allMatch: known.length > 0 && known.every((r) => r.step2 === r.checksum), rows };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const started = Date.now();
    const demoChecksumUnchanged = datasetFromSeedPlan().checksum === DEMO_CHECKSUM;
    if (!demoChecksumUnchanged) throw new Error("Bộ sinh dữ liệu demo đã thay đổi — dừng lại.");

    const jobs = args.profiles.flatMap((profile) => args.seeds.map((seed) => ({ profile, seed, orders: args.orders, bootstrap: args.bootstrap })));
    console.error(`${jobs.length} bộ dữ liệu · ${args.isolate ? `tiến trình riêng, heap ≤ ${args.maxMemoryMb} MB, dừng sau ${args.timeoutSec} s mỗi bộ` : "cùng tiến trình (--no-isolate)"}`);
    const summaries = {};
    const failures = [];
    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const name = `${job.profile.toUpperCase()}-seed${job.seed}-n${job.orders}`;
        const log = (msg) => console.error(`[${i + 1}/${jobs.length}] ${name}: ${msg}`);
        log("bắt đầu");
        let result;
        if (args.isolate) result = await runInChild(__filename, job, args, log);
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
        const s = result.summary;
        const m1 = s.results.find((r) => r.key === "m1-with-fallback");
        const flat = s.results.find((r) => r.key === "tuned-with-fallback");
        log(
            `xong sau ${s.seconds.toFixed(1)} s · checksum ${s.dataset.checksum.slice(0, 12)} · M1 ${JSON.stringify(s.tuning.m1.selected)} · Recall@5 M1 ${(m1.summary.recall * 100).toFixed(1)}% vs một cấp ${(flat.summary.recall * 100).toFixed(1)}%` +
                (m1.rare.queries ? ` · nhóm hiếm (${m1.rare.queries} truy vấn) ${(m1.rare.recall * 100).toFixed(1)}% vs ${(flat.rare.recall * 100).toFixed(1)}%` : "")
        );
        (summaries[job.profile] = summaries[job.profile] || []).push(s);
    }

    const all = Object.values(summaries).flat();
    const datasetCheck = { demoChecksumUnchanged, ...compareWithStep2(all, args.out) };
    if (datasetCheck.comparedWithStep2 && !datasetCheck.allMatch) console.error("⚠️ Checksum không trùng manifest Bước 2!");
    const profiles = Object.fromEntries(Object.entries(summaries).map(([p, list]) => [p, aggregateM1Runs(list)]));
    const meta = {
        generatedAt: new Date().toISOString(),
        node: process.version,
        command: `node scripts/evaluate-multilevel.js ${process.argv.slice(2).join(" ")}`.trim(),
        seconds: (Date.now() - started) / 1000,
        datasetSeconds: all.reduce((s, x) => s + x.seconds, 0),
    };
    const settings = {
        generatorVersion: GENERATOR_VERSION,
        profiles: args.profiles,
        seeds: args.seeds,
        orders: args.orders,
        k: 5,
        ratios: DEFAULT_RATIOS,
        grid: DEFAULT_GRID,
        m1Grid: DEFAULT_M1_GRID,
        bootstrap: args.bootstrap,
        rareThreshold: RARE_THRESHOLD,
        resourceLimits: { isolate: args.isolate, timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, miningBudget: DEFAULT_LIMITS },
    };
    const result = { meta, settings, datasetCheck, failures, profiles, runs: summaries };

    const suffix = args.full ? "" : `-${args.profiles.join("+")}-seed${args.seeds.join("+")}-n${args.orders}${args.bootstrap === 1000 ? "" : `-b${args.bootstrap}`}`;
    const base = path.join(args.out, `phase4-step3-m1-evaluation${suffix}`);
    fs.mkdirSync(args.out, { recursive: true });
    const benchFile = path.join(args.out, "phase4-step3-m1-benchmark.json");
    const benchmark = args.full && fs.existsSync(benchFile) ? JSON.parse(fs.readFileSync(benchFile, "utf8")) : null;
    if (Object.keys(profiles).length) fs.writeFileSync(`${base}.md`, toMarkdownM1(result, benchmark));
    fs.writeFileSync(`${base}.json`, JSON.stringify(result, null, 2));
    console.error(`\nĐã ghi ${base}.{md,json} · tổng ${meta.seconds.toFixed(0)} s`);
    if (failures.length) {
        console.error(`${failures.length} bộ lỗi: ${failures.map((f) => f.name).join(", ")}`);
        process.exitCode = 1;
    }
}

if (process.argv.includes("--child")) serveChild((job, progress) => evaluateOne(job, progress));
else if (require.main === module) {
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
}

module.exports = { parseArgs, evaluateOne, compareWithStep2, DEMO_CHECKSUM };
