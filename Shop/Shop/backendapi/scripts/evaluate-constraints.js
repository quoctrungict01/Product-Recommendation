#!/usr/bin/env node
// Đánh giá M2 — khai phá mẫu phổ biến có ràng buộc (Giai đoạn 4 – Bước 4) trên R1/R1b.
// OFFLINE: không đọc .env, không kết nối MongoDB, không gọi API/cache. Dữ liệu sinh lại từ seed, đối chiếu checksum Bước 2.
//
//   node scripts/evaluate-constraints.js                                 # 2 hồ sơ × 5 seed
//   node scripts/evaluate-constraints.js --profile r1b --seed 20261103   # một bộ
//
// Mỗi bộ chạy trong tiến trình con riêng (giới hạn heap và thời gian), có kiểm tra ngân sách trước khi khai phá.
// (Không require các script đánh giá khác: chúng tự phục vụ IPC khi thấy cờ --child.)

const fs = require("fs");
const path = require("path");
const { generateResearchDataset, PROFILES, RESEARCH_SEEDS, GENERATOR_VERSION } = require("../research/datasets/generator");
const { datasetFromSeedPlan } = require("../research/evaluation/dataset");
const { DEFAULT_GRID } = require("../research/evaluation/runner");
const { DEFAULT_RATIOS } = require("../research/evaluation/split");
const { DEFAULT_LIMITS } = require("../research/evaluation/budget");
const { runInChild, serveChild } = require("../research/evaluation/child-process");
const { DEFAULT_M1_GRID } = require("../research/multilevel/evaluate");
const { runConstraintEvaluation } = require("../research/constraints/evaluate");
const { summarizeM2Run, aggregateM2Runs } = require("../research/constraints/aggregate");
const { describeConstraints } = require("../research/constraints/constraints");
const { buildBusinessRules, RULE_CONSTRAINTS, PHONE_CATEGORY_NAMES } = require("../research/constraints/business");
const { toMarkdownM2 } = require("../research/constraints/report");

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

function evaluateOne({ profile, seed, orders, bootstrap }, onProgress = () => {}) {
    const t0 = Date.now();
    onProgress("sinh dữ liệu");
    const dataset = generateResearchDataset({ profile, seed, count: orders });
    const report = runConstraintEvaluation(dataset, { bootstrap, rareThreshold: RARE_THRESHOLD, onProgress });
    return { summary: summarizeM2Run(report, { seconds: (Date.now() - t0) / 1000 }) };
}

function compareWithStep2(summaries, outDir) {
    const file = path.join(outDir, "phase4-step2-datasets.json");
    if (!fs.existsSync(file)) return { comparedWithStep2: false, allMatch: null, rows: [] };
    const byName = new Map(JSON.parse(fs.readFileSync(file, "utf8")).datasets.map((d) => [d.name, d.checksum]));
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
    console.error(`${jobs.length} bộ dữ liệu · ${args.isolate ? `tiến trình riêng, heap ≤ ${args.maxMemoryMb} MB, dừng sau ${args.timeoutSec} s mỗi bộ` : "cùng tiến trình"}`);
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
        const g = (key) => s.results.find((r) => r.key === key);
        const f = (r) => `R ${(r.summary.recall * 100).toFixed(1)}% · hợp lý ${(r.summary.plausibleItemRate * 100).toFixed(0)}% · Cov ${(r.summary.coverage * 100).toFixed(0)}%`;
        log(`xong sau ${s.seconds.toFixed(1)} s · checksum ${s.dataset.checksum.slice(0, 12)} · một cấp [${f(g("tuned-with-fallback"))}] · M2 [${f(g("m2-flat-with-fallback"))}] · M1 [${f(g("m1-with-fallback"))}] · M2+M1 [${f(g("m2-m1-with-fallback"))}] · cắt tỉa = hậu lọc: ${JSON.stringify(s.constraintCheck.identical)}`);
        (summaries[job.profile] = summaries[job.profile] || []).push(s);
    }

    const all = Object.values(summaries).flat();
    const datasetCheck = { demoChecksumUnchanged, ...compareWithStep2(all, args.out) };
    const profiles = Object.fromEntries(Object.entries(summaries).map(([p, list]) => [p, aggregateM2Runs(list)]));
    const sampleBusiness = buildBusinessRules(generateResearchDataset({ profile: "r1b", seed: RESEARCH_SEEDS[0], count: 10 }).products);
    const meta = { generatedAt: new Date().toISOString(), node: process.version, command: `node scripts/evaluate-constraints.js ${process.argv.slice(2).join(" ")}`.trim(), seconds: (Date.now() - started) / 1000, datasetSeconds: all.reduce((s, x) => s + x.seconds, 0) };
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
        business: { phoneCategories: PHONE_CATEGORY_NAMES, ruleConstraints: RULE_CONSTRAINTS, itemsetConstraints: describeConstraints(sampleBusiness.itemsetConstraints()) },
        resourceLimits: { isolate: args.isolate, timeoutSec: args.timeoutSec, maxMemoryMb: args.maxMemoryMb, miningBudget: DEFAULT_LIMITS },
    };
    const result = { meta, settings, datasetCheck, failures, profiles, runs: summaries };
    const suffix = args.full ? "" : `-${args.profiles.join("+")}-seed${args.seeds.join("+")}-n${args.orders}${args.bootstrap === 1000 ? "" : `-b${args.bootstrap}`}`;
    const base = path.join(args.out, `phase4-step4-m2-evaluation${suffix}`);
    fs.mkdirSync(args.out, { recursive: true });
    const benchFile = path.join(args.out, "phase4-step4-m2-benchmark.json");
    const benchmark = args.full && fs.existsSync(benchFile) ? JSON.parse(fs.readFileSync(benchFile, "utf8")) : null;
    if (Object.keys(profiles).length) fs.writeFileSync(`${base}.md`, toMarkdownM2(result, benchmark));
    fs.writeFileSync(`${base}.json`, JSON.stringify(result, null, 2));
    console.error(`\nĐã ghi ${base}.{md,json} · tổng ${meta.seconds.toFixed(0)} s`);
    if (failures.length) process.exitCode = 1;
}

if (process.argv.includes("--child")) serveChild((job, progress) => evaluateOne(job, progress));
else if (require.main === module) {
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
}

module.exports = { parseArgs, evaluateOne, compareWithStep2, DEMO_CHECKSUM };
