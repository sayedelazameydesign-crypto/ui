#!/usr/bin/env node
// Benchmark harness — the numbers this repository is willing to defend.
//
//   node scripts/bench.mjs                 # all modes, default workload
//   node scripts/bench.mjs --json          # machine-readable
//   node scripts/bench.mjs --repeat 40     # more samples per query
//
// What it measures: latency (p50/p95/mean), memory, and artifact size for each
// retrieval mode on the *same* index and the *same* queries.
//
// What it deliberately does NOT do: compare against commercial systems. Running a
// competitor in the same environment is the only honest version of that claim, and
// it is not something this repository can do without shipping their dependencies.
// Any "10× faster" figure printed here would be invented, so none is printed.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadIndex, search, bm25Scores, tokenize, expandTokens, embedLocal, cosine, DEFAULT_INDEX, MODES, gitRoot } from "./semantic/lib.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] ? Number(argv[at + 1]) : fallback;
};

const REPEAT = value("repeat", 25);
const K = value("k", 5);
const JSON_OUT = flag("json");

const root = gitRoot();
const indexPath = join(root, DEFAULT_INDEX);
const gold = JSON.parse(readFileSync(join(root, "tests/semantic-gold.json"), "utf8"));
const queries = gold.cases.map((testCase) => testCase.query);

const heapBefore = process.memoryUsage();
const index = loadIndex(DEFAULT_INDEX, root);
const heapAfter = process.memoryUsage();
const indexBytes = statSync(indexPath).size;

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const modes = [...MODES, "hybrid+lexical-rerank"];

const results = {};
for (const mode of modes) {
  const [baseMode, rerank] = mode.split("+");
  const withRerank = Boolean(rerank);

  // Warm-up: the first call pays JIT and cache costs and must not pollute p50.
  for (let i = 0; i < 3; i += 1) {
    for (const query of queries) await search(index, query, { k: K, mode: baseMode, rerank: withRerank });
  }

  const samples = [];
  for (let round = 0; round < REPEAT; round += 1) {
    for (const query of queries) {
      const started = process.hrtime.bigint();
      await search(index, query, { k: K, mode: baseMode, rerank: withRerank });
      samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  results[mode] = {
    samples: samples.length,
    p50: Number(percentile(samples, 50).toFixed(3)),
    p95: Number(percentile(samples, 95).toFixed(3)),
    mean: Number(mean.toFixed(3)),
    queriesPerSecond: Number((1000 / mean).toFixed(1)),
  };
}

// Component costs, measured separately so the fusion overhead is not hand-waved.
const componentSamples = { tokenizeExpand: [], bm25: [], embedVector: [] };
for (let round = 0; round < REPEAT; round += 1) {
  for (const query of queries) {
    let t = process.hrtime.bigint();
    const { tokens } = expandTokens(tokenize(query));
    componentSamples.tokenizeExpand.push(Number(process.hrtime.bigint() - t) / 1e6);

    t = process.hrtime.bigint();
    bm25Scores(index, tokens);
    componentSamples.bm25.push(Number(process.hrtime.bigint() - t) / 1e6);

    const queryVector = embedLocal(tokens, index.dims);
    t = process.hrtime.bigint();
    for (const chunk of index.chunks) cosine(queryVector, chunk.vector);
    componentSamples.embedVector.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
}

const components = Object.fromEntries(
  Object.entries(componentSamples).map(([name, samples]) => {
    samples.sort((a, b) => a - b);
    return [name, { p50: Number(percentile(samples, 50).toFixed(3)), p95: Number(percentile(samples, 95).toFixed(3)) }];
  }),
);

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    commit: index.commit,
  },
  corpus: {
    files: index.stats.files,
    chunks: index.chunks.length,
    dims: index.dims,
    indexBytes,
    avgChunkTokens: index.stats.avgLength,
    vocabulary: index.stats.df.length,
  },
  memory: {
    heapUsedMiB: Number(((heapAfter.heapUsed - heapBefore.heapUsed) / 1024 / 1024).toFixed(2)),
    rssMiB: Number((heapAfter.rss / 1024 / 1024).toFixed(1)),
    note: "heap delta from loading the index in this process; not a peak-RSS measurement",
  },
  workload: { queries: queries.length, repeats: REPEAT, samplesPerMode: queries.length * REPEAT, k: K },
  latency: results,
  components,
  caveats: [
    "measured on the machine that ran this command; absolute values are not portable",
    "no third-party comparison is included: running a competitor here would require its dependencies",
    "p95 over ~450 samples is indicative, not a service-level guarantee",
  ],
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pad = (text, width) => String(text).padEnd(width);
console.log(`benchmark · ${queries.length} queries × ${REPEAT} repeats = ${queries.length * REPEAT} samples per mode`);
console.log(`corpus    ${index.stats.files} files · ${index.chunks.length} chunks · ${index.dims}d · ${(indexBytes / 1024).toFixed(0)} KiB index · ${index.stats.df.length} terms`);
console.log(`memory    +${report.memory.heapUsedMiB} MiB heap after load · ${report.memory.rssMiB} MiB RSS`);
console.log(`runtime   node ${process.version} · ${process.platform}/${process.arch} · @${index.commit}\n`);

console.log(`${pad("mode", 26)}${pad("p50 ms", 10)}${pad("p95 ms", 10)}${pad("mean ms", 10)}queries/s`);
console.log("-".repeat(66));
for (const mode of modes) {
  const row = results[mode];
  console.log(`${pad(mode, 26)}${pad(row.p50, 10)}${pad(row.p95, 10)}${pad(row.mean, 10)}${row.queriesPerSecond}`);
}

console.log(`\ncomponents (per query, ${pad("p50", 6)}/ p95 ms)`);
for (const [name, row] of Object.entries(components)) {
  console.log(`  ${pad(name, 16)}${pad(row.p50, 8)}${row.p95}`);
}

console.log("\ncaveats");
for (const caveat of report.caveats) console.log(`  · ${caveat}`);
