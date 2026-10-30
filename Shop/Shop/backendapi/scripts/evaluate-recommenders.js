#!/usr/bin/env node
// Đánh giá offline hệ thống gợi ý và baseline (Giai đoạn 4 – Bước 1).
// Không kết nối MongoDB, không dùng cache website. Dữ liệu tái tạo từ kế hoạch seed.
//
//   node scripts/evaluate-recommenders.js
//   node scripts/evaluate-recommenders.js --seed 20261026 --orders 1000 --bootstrap 1000 --out research-results
//   node scripts/evaluate-recommenders.js --no-write          # chỉ in, không ghi file

const fs = require("fs");
const path = require("path");
const { datasetFromSeedPlan, DEMO_SEED, DEMO_ORDER_COUNT } = require("../research/evaluation/dataset");
const { runEvaluation } = require("../research/evaluation/runner");
const { toMarkdown } = require("../research/evaluation/report");

function parseArgs(argv) {
    const args = { seed: DEMO_SEED, orders: DEMO_ORDER_COUNT, bootstrap: 1000, out: path.join(__dirname, "..", "research-results"), write: true, perQuery: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            if (i + 1 >= argv.length) throw new Error(`Thiếu giá trị cho ${a}`);
            return argv[++i];
        };
        if (a === "--seed") args.seed = Number(next());
        else if (a === "--orders") args.orders = Number(next());
        else if (a === "--bootstrap") args.bootstrap = Number(next());
        else if (a === "--out") args.out = next();
        else if (a === "--no-write") args.write = false;
        else if (a === "--per-query") args.perQuery = true;
        else throw new Error(`Tham số không hỗ trợ: ${a}`);
    }
    for (const key of ["seed", "orders", "bootstrap"]) {
        if (!Number.isInteger(args[key]) || args[key] < 1) throw new Error(`--${key} phải là số nguyên dương`);
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const dataset = datasetFromSeedPlan({ seed: args.seed, orderCount: args.orders });
    const report = runEvaluation(dataset, { bootstrap: args.bootstrap });
    const meta = {
        generatedAt: new Date().toISOString(),
        node: process.version,
        command: `node scripts/evaluate-recommenders.js ${process.argv.slice(2).join(" ")}`.trim(),
    };
    const md = toMarkdown(report, meta);
    process.stdout.write(md);

    if (args.write) {
        fs.mkdirSync(args.out, { recursive: true });
        const base = args.seed === DEMO_SEED && args.orders === DEMO_ORDER_COUNT ? "phase4-step1-evaluation" : `phase4-step1-evaluation-seed${args.seed}-n${args.orders}`;
        const { perQuery, ...summary } = report;
        fs.writeFileSync(path.join(args.out, `${base}.md`), md);
        fs.writeFileSync(path.join(args.out, `${base}.json`), JSON.stringify({ meta, ...summary, ...(args.perQuery ? { perQuery } : {}) }, null, 2));
        console.error(`\nĐã ghi ${path.join(args.out, base)}.{md,json}`);
    }
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error(err.message || err);
        process.exit(1);
    }
}

module.exports = { parseArgs };
