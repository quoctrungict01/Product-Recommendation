#!/usr/bin/env node
// Benchmark Apriori và FP-Growth trên dữ liệu giả có seed cố định.
// Chạy hoàn toàn offline: không đọc .env, không kết nối MongoDB.
//
// Cách chạy (từ thư mục backendapi):
//   node scripts/benchmark-mining.js                 # bộ cấu hình mặc định
//   node scripts/benchmark-mining.js --quick         # bộ nhỏ, chạy nhanh
//   node scripts/benchmark-mining.js --runs 7 --out ./ket-qua
//
// Mỗi lượt đo (một thuật toán x một cấu hình) chạy trong một tiến trình con riêng
// (có --expose-gc) để số liệu bộ nhớ không bị ảnh hưởng bởi lượt trước.
// - Thời gian: trung vị của `runs` lần chạy (sau một lần chạy đầu "lạnh").
// - Bộ nhớ đỉnh: mức tăng của maxRSS do lần chạy đầu gây ra.
// - Heap giữ lại: heapUsed sau GC khi vẫn giữ kết quả, trừ heapUsed trước khi chạy.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { fork } = require("child_process");

const MINING_DIR = path.join(__dirname, "..", "src", "apps", "services", "mining");

// ---------------------------------------------------------------- tiến trình con
function runChild() {
    const { apriori } = require(path.join(MINING_DIR, "apriori"));
    const { fpGrowth } = require(path.join(MINING_DIR, "fpgrowth"));
    const { generateTransactions } = require(path.join(MINING_DIR, "synthetic"));
    const ALGORITHMS = { apriori, fpgrowth: fpGrowth };

    process.once("message", ({ algorithm, data, minSupport, runs }) => {
        const run = ALGORITHMS[algorithm];
        const { transactions } = generateTransactions(data);
        const gc = global.gc || (() => {});

        gc();
        gc();
        const heapBefore = process.memoryUsage().heapUsed;
        const rssPeakBefore = process.resourceUsage().maxRSS; // KB

        let start = process.hrtime.bigint();
        let result = run(transactions, { minSupport });
        const coldMs = Number(process.hrtime.bigint() - start) / 1e6;

        const rssPeakAfter = process.resourceUsage().maxRSS;
        gc();
        gc();
        const heapRetained = process.memoryUsage().heapUsed - heapBefore;

        const times = [];
        for (let i = 0; i < runs; i++) {
            result = null;
            gc();
            start = process.hrtime.bigint();
            result = run(transactions, { minSupport });
            times.push(Number(process.hrtime.bigint() - start) / 1e6);
        }
        times.sort((a, b) => a - b);

        const byLength = {};
        for (const { items } of result.itemsets) byLength[items.length] = (byLength[items.length] || 0) + 1;

        process.send({
            itemsets: result.itemsets.length,
            maxLength: Math.max(0, ...Object.keys(byLength).map(Number)),
            byLength,
            checksum: crypto.createHash("sha1").update(JSON.stringify(result.itemsets)).digest("hex"),
            stats: result.stats,
            coldMs,
            medianMs: times.length ? times[Math.floor(times.length / 2)] : coldMs,
            minMs: times.length ? times[0] : coldMs,
            peakRssDeltaMB: Math.max(0, rssPeakAfter - rssPeakBefore) / 1024,
            heapRetainedMB: Math.max(0, heapRetained) / (1024 * 1024),
            avgBasket: transactions.reduce((s, t) => s + t.length, 0) / Math.max(1, transactions.length),
        });
    });
}

// ---------------------------------------------------------------- tiến trình cha
function parseArgs(argv) {
    const args = { runs: 5, out: null, quick: false, timeoutSec: 300 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--quick") args.quick = true;
        else if (a === "--runs") args.runs = Number(argv[++i]);
        else if (a === "--out") args.out = argv[++i];
        else if (a === "--timeout") args.timeoutSec = Number(argv[++i]);
    }
    if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error("--runs phải là số nguyên >= 1");
    return args;
}

function scenarios(quick) {
    const base = { seed: 20261023, itemCount: 200, avgBasketSize: 4, patternCount: 15, patternSize: [2, 5] };
    if (quick) {
        return [
            { group: "A. Thay đổi min_sup (N = 2.000)", data: { ...base, transactionCount: 2000 }, minSupport: 0.02 },
            { group: "A. Thay đổi min_sup (N = 2.000)", data: { ...base, transactionCount: 2000 }, minSupport: 0.01 },
            { group: "B. Thay đổi số giao dịch (min_sup = 1%)", data: { ...base, transactionCount: 5000 }, minSupport: 0.01 },
        ];
    }
    const list = [];
    for (const minSupport of [0.05, 0.02, 0.01, 0.005, 0.0025]) {
        list.push({ group: "A. Thay đổi min_sup (N = 10.000, giỏ TB 4)", data: { ...base, transactionCount: 10000 }, minSupport });
    }
    for (const transactionCount of [1000, 5000, 20000, 50000]) {
        list.push({ group: "B. Thay đổi số giao dịch (min_sup = 1%)", data: { ...base, transactionCount }, minSupport: 0.01 });
    }
    const dense = { ...base, itemCount: 100, avgBasketSize: 10, patternSize: [4, 8], transactionCount: 5000 };
    for (const minSupport of [0.05, 0.03, 0.02]) {
        list.push({ group: "C. Dữ liệu dày (N = 5.000, 100 item, giỏ TB 10)", data: dense, minSupport });
    }
    return list;
}

function measure(algorithm, scenario, runs, timeoutSec) {
    return new Promise((resolve) => {
        const child = fork(__filename, ["--child"], {
            execArgv: ["--expose-gc", "--max-old-space-size=4096"],
            stdio: ["ignore", "inherit", "inherit", "ipc"],
        });
        const timer = setTimeout(() => {
            child.kill();
            resolve({ error: `quá ${timeoutSec}s` });
        }, timeoutSec * 1000);
        child.once("message", (msg) => {
            clearTimeout(timer);
            child.kill();
            resolve(msg);
        });
        child.once("exit", (code) => {
            clearTimeout(timer);
            resolve({ error: `tiến trình con thoát với mã ${code}` });
        });
        child.send({ algorithm, data: scenario.data, minSupport: scenario.minSupport, runs });
    });
}

const fmt = (x, d = 1) => (typeof x === "number" ? x.toFixed(d) : String(x));

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const list = scenarios(args.quick);
    const rows = [];

    console.log(`Node ${process.version} | ${process.platform} ${process.arch} | ${require("os").cpus()[0].model}`);
    console.log(`Số lần đo thời gian mỗi cấu hình: ${args.runs} (lấy trung vị)\n`);

    for (const scenario of list) {
        const a = await measure("apriori", scenario, args.runs, args.timeoutSec);
        const f = await measure("fpgrowth", scenario, args.runs, args.timeoutSec);
        const same = !a.error && !f.error ? a.checksum === f.checksum : null;
        const row = { scenario, apriori: a, fpgrowth: f, sameResult: same };
        rows.push(row);

        const label = `N=${scenario.data.transactionCount} min_sup=${scenario.minSupport * 100}%`;
        if (a.error || f.error) {
            console.log(`${label}: LỖI apriori=${a.error || "ok"} fpgrowth=${f.error || "ok"}`);
        } else {
            console.log(
                `${label} (count>=${a.stats.minSupportCount}): itemsets ${a.itemsets}/${f.itemsets} | ` +
                    `Apriori ${fmt(a.medianMs)} ms, FP ${fmt(f.medianMs)} ms | ` +
                    `RSS +${fmt(a.peakRssDeltaMB)}/+${fmt(f.peakRssDeltaMB)} MB | kết quả giống nhau: ${same}`
            );
        }
        if (same === false) process.exitCode = 1;
    }

    const md = toMarkdown(rows, args);
    console.log("\n" + md);

    if (args.out) {
        fs.mkdirSync(args.out, { recursive: true });
        fs.writeFileSync(path.join(args.out, "benchmark-mining.json"), JSON.stringify(rows, null, 2));
        fs.writeFileSync(path.join(args.out, "benchmark-mining.md"), md);
        console.log(`Đã ghi kết quả vào ${path.resolve(args.out)}`);
    }
}

function toMarkdown(rows, args) {
    const lines = [];
    let group = null;
    for (const { scenario, apriori: a, fpgrowth: f, sameResult } of rows) {
        if (scenario.group !== group) {
            group = scenario.group;
            lines.push("", `### ${group}`, "");
            lines.push(
                "| N | min_sup (count) | Itemsets (dài nhất) | Candidate Apriori | Cây điều kiện FP | Thời gian Apriori (ms) | Thời gian FP-Growth (ms) | Nhanh hơn | RSS đỉnh Apriori (MB) | RSS đỉnh FP (MB) | Heap giữ lại A / FP (MB) | Kết quả trùng |",
                "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|"
            );
        }
        if (a.error || f.error) {
            lines.push(`| ${scenario.data.transactionCount} | ${scenario.minSupport * 100}% | lỗi: ${a.error || ""} ${f.error || ""} |||||||||| |`);
            continue;
        }
        lines.push(
            `| ${scenario.data.transactionCount} | ${scenario.minSupport * 100}% (${a.stats.minSupportCount}) | ` +
                `${a.itemsets} (${a.maxLength}) | ${a.stats.totalCandidates} | ${f.stats.conditionalTrees} | ` +
                `${fmt(a.medianMs)} | ${fmt(f.medianMs)} | ×${fmt(a.medianMs / f.medianMs, 1)} | ` +
                `${fmt(a.peakRssDeltaMB)} | ${fmt(f.peakRssDeltaMB)} | ${fmt(a.heapRetainedMB, 2)} / ${fmt(f.heapRetainedMB, 2)} | ` +
                `${sameResult ? "✔" : "✘"} |`
        );
    }
    lines.unshift(
        `Thời gian: trung vị của ${args.runs} lần. RSS đỉnh: mức tăng bộ nhớ tiến trình trong lần chạy đầu. ` +
            "Heap giữ lại: bộ nhớ của kết quả sau GC."
    );
    return lines.join("\n");
}

if (process.argv.includes("--child")) runChild();
else main().catch((err) => {
    console.error(err);
    process.exit(1);
});
