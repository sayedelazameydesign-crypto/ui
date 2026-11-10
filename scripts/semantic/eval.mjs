#!/usr/bin/env node
// Retrieval quality gate — recall@k and MRR over a gold set, per search mode.
//
//   node scripts/semantic/eval.mjs                     # hybrid vs vector vs keyword
//   node scripts/semantic/eval.mjs --k 3 --min-recall 0.9
//   node scripts/semantic/eval.mjs --json
//   node scripts/semantic/eval.mjs --timing            # ms/query + cost estimate
//   node scripts/semantic/eval.mjs --rebuild           # re-index first
//
// Why this exists: "hybrid search is better" is a claim, not a fact. The gold set
// in tests/semantic-gold.json turns it into a number CI can enforce.
// Docs: docs/agents/retrieval-quality.md

import { readFileSync, existsSync } from "node:fs";
import { buildIndex, saveIndex, loadIndex, search, MODES, DEFAULT_INDEX, gitRoot } from "./lib.mjs";

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

const K = Number(value("k", 5));
const MIN_RECALL_AT_3 = Number(value("min-recall", 0.72));
const MIN_MRR = Number(value("min-mrr", 0.66));
// Floors = measured value *on the 58-case set* with a little headroom:
//   R@1 0.62 · R@3 0.76 · MRR 0.68  (2026-11-10, 58 cases; exact values print on every run)
// The old *goal* was 0.85 (decision D8); it is closed as unreachable under the local
// constraints (ADR-0023), so these floors are the standard and the target no longer
// exists. The gate is a ratchet: it moves up, never down.
// Raising these numbers is the definition of progress; lowering them is a decision
// that needs its own ADR.
const MIN_RECALL_AT_1 = Number(value("min-r1", 0.6));
const RERANK = argv.includes("--rerank"); // default off: measured worse, see lib.mjs
const JSON_OUT = argv.includes("--json");
// Scope is a property of the index, not of the gate: evaluate whatever is on disk
// and print which scope it is. `--rebuild` honours `--with-memory`.
const WITH_MEMORY = argv.includes("--with-memory");
const INDEX_PATH = typeof value("index") === "string" ? value("index") : DEFAULT_INDEX;
const TIMING = argv.includes("--timing");

const gold = JSON.parse(readFileSync("tests/semantic-gold.json", "utf8"));
const cases = gold.cases ?? [];

const root = gitRoot();
let index;
if (argv.includes("--rebuild") || !existsSync(INDEX_PATH)) {
  index = await buildIndex({ root, includeMemory: WITH_MEMORY });
  saveIndex(index, INDEX_PATH, root);
  if (!JSON_OUT) console.error(`rebuilt index: ${index.chunks.length} chunks (scope: ${index.scope?.label ?? "unscoped"})`);
} else {
  index = loadIndex(INDEX_PATH, root);
}
const SCOPE = index.scope?.label ?? "unscoped";

/** rank of the first acceptable hit (1-based), or 0 when nothing matched. */
function firstHitRank(results, expect) {
  const wanted = new Set(expect);
  const at = results.findIndex((r) => wanted.has(r.file));
  return at === -1 ? 0 : at + 1;
}

/**
 * Bootstrap 95% interval for R@1. Seeded and deterministic: the same cases print
 * the same interval on every machine, which is the only way a number like this can
 * be quoted in a document.
 */
function bootstrapCi(rows, { resamples = 2000, seed = 20260101 } = {}) {
  const hits = rows.map((r) => (r.rank === 1 ? 1 : 0));
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0; // unsigned: a signed state goes negative and indexes out of range
    return state / 4294967296;
  };
  const means = [];
  for (let i = 0; i < resamples; i += 1) {
    let sum = 0;
    for (let j = 0; j < hits.length; j += 1) sum += hits[Math.floor(next() * hits.length)];
    means.push(sum / hits.length);
  }
  means.sort((a, b) => a - b);
  const quantile = (q) => Number(means[Math.min(means.length - 1, Math.floor(q * means.length))].toFixed(3));
  return { low: quantile(0.025), high: quantile(0.975), resamples, seed };
}

const perMode = {};
for (const mode of MODES) {
  const rows = [];
  let ms = 0;
  for (const testCase of cases) {
    const started = performance.now();
    const results = await search(index, testCase.query, { k: Math.max(K, 3), mode, rerank: RERANK });
    ms += performance.now() - started;
    rows.push({
      id: testCase.id,
      origin: testCase.origin ?? "v1",
      lang: testCase.lang ?? "en",
      rank: firstHitRank(results, testCase.expect),
      top: results[0]?.file ?? null,
      expect: testCase.expect,
    });
  }
  const at1 = rows.filter((r) => r.rank === 1).length / rows.length;
  const at3 = rows.filter((r) => r.rank > 0 && r.rank <= 3).length / rows.length;
  const atK = rows.filter((r) => r.rank > 0 && r.rank <= K).length / rows.length;
  const mrr = rows.reduce((sum, r) => sum + (r.rank > 0 ? 1 / r.rank : 0), 0) / rows.length;
  const stats = (subset) => {
    const n = subset.length || 1;
    return {
      cases: subset.length,
      recall1: Number((subset.filter((r) => r.rank === 1).length / n).toFixed(3)),
      recall3: Number((subset.filter((r) => r.rank > 0 && r.rank <= 3).length / n).toFixed(3)),
      mrr: Number((subset.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / n).toFixed(3)),
    };
  };
  perMode[mode] = {
    mode,
    recall1: Number(at1.toFixed(3)),
    recall3: Number(at3.toFixed(3)),
    [`recall${K}`]: Number(atK.toFixed(3)),
    mrr: Number(mrr.toFixed(3)),
    msPerQuery: Number((ms / rows.length).toFixed(2)),
    // A metric on n cases cannot resolve anything finer than one case: the
    // interval says so out loud instead of letting a 2-point move look like a win.
    recall1Ci95: bootstrapCi(rows),
    bySet: { v1: stats(rows.filter((r) => r.origin === "v1")), v2: stats(rows.filter((r) => r.origin === "v2")) },
    byLang: { en: stats(rows.filter((r) => r.lang === "en")), ar: stats(rows.filter((r) => r.lang === "ar")) },
    misses: rows.filter((r) => r.rank === 0 || r.rank > 3),
  };
}

/* ------------------------------------------------------------------ */
/* Optional cost model (assumptions are explicit, never invented)      */
/* ------------------------------------------------------------------ */

const PRICING = { runnerUsdPerMinute: 0.008, source: "GitHub-hosted 2-core Linux list price, 2026 — assumption" };
const costPer1k = (mode) => Number(((perMode[mode].msPerQuery / 1000 / 60) * PRICING.runnerUsdPerMinute * 1000).toFixed(4));

const best = Object.values(perMode).sort((a, b) => b.recall3 - a.recall3 || b.mrr - a.mrr)[0];
const hybrid = perMode.hybrid;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        cases: cases.length,
        k: K,
        index: { chunks: index.chunks.length, commit: index.commit, provider: index.provider },
        modes: perMode,
        best: best.mode,
        rerank: RERANK,
        thresholds: { recall1: MIN_RECALL_AT_1, recall3: MIN_RECALL_AT_3, mrr: MIN_MRR },
        pricing: TIMING ? { ...PRICING, costPer1kQueries: Object.fromEntries(MODES.map((m) => [m, costPer1k(m)])) } : null,
      },
      null,
      2,
    ),
  );
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`retrieval eval · ${cases.length} cases · k=${K} · index ${index.chunks.length} chunks @ ${index.commit || "?"} · scope ${SCOPE} · rerank ${RERANK ? "on" : "off"}\n`);
  console.log(`${pad("mode", 10)}${pad("R@1", 8)}${pad("R@3", 8)}${pad(`R@${K}`, 8)}${pad("MRR", 8)}ms/query`);
  console.log("-".repeat(50));
  for (const mode of MODES) {
    const m = perMode[mode];
    const mark = mode === best.mode ? " ←" : "";
    console.log(
      `${pad(mode, 10)}${pad(m.recall1.toFixed(2), 8)}${pad(m.recall3.toFixed(2), 8)}${pad(m[`recall${K}`].toFixed(2), 8)}${pad(m.mrr.toFixed(2), 8)}${m.msPerQuery}${mark}`,
    );
  }

  if (hybrid.misses.length) {
    console.log(`\nhybrid misses beyond rank 3:`);
    for (const miss of hybrid.misses) {
      console.log(`  ${miss.id}: expected ${miss.expect.join(" | ")} — got ${miss.top}`);
    }
  }

  if (TIMING) {
    console.log(`\ncost model (${PRICING.source})`);
    for (const mode of MODES) {
      console.log(`  ${pad(mode, 10)} $${costPer1k(mode)} per 1k queries (${perMode[mode].msPerQuery} ms each)`);
    }
    console.log("  note: the local provider has zero marginal API cost; this is runner time only.");
  }

  const ci = hybrid.recall1Ci95;
  console.log(
    `\nR@1 resolution: one case = ${(100 / cases.length).toFixed(1)} points · ` +
      `hybrid 95% CI [${ci.low.toFixed(2)}, ${ci.high.toFixed(2)}] (${ci.resamples} bootstrap resamples, seed ${ci.seed})`,
  );
  console.log("subsets (hybrid):");
  for (const [label, set] of [
    ["v1 (original 18)", hybrid.bySet.v1],
    ["v2 (added 40)", hybrid.bySet.v2],
    ["en", hybrid.byLang.en],
    ["ar", hybrid.byLang.ar],
  ]) {
    console.log(`  ${pad(label, 18)}n=${pad(set.cases, 4)}R@1 ${set.recall1.toFixed(3)} · R@3 ${set.recall3.toFixed(3)} · MRR ${set.mrr.toFixed(3)}`);
  }
  console.log(`\nbest mode by R@3 then MRR: ${best.mode}`);
}

const failed = hybrid.recall1 < MIN_RECALL_AT_1 || hybrid.recall3 < MIN_RECALL_AT_3 || hybrid.mrr < MIN_MRR;
if (failed) {
  console.error(
    `\n✗ hybrid is below the gate: R@1 ${hybrid.recall1} (min ${MIN_RECALL_AT_1}) · ` +
      `R@3 ${hybrid.recall3} (min ${MIN_RECALL_AT_3}) · MRR ${hybrid.mrr} (min ${MIN_MRR})`,
  );
  process.exit(1);
}
if (!JSON_OUT) {
  console.log(
    `✓ hybrid meets the gate: R@1 ${hybrid.recall1} · R@3 ${hybrid.recall3} · MRR ${hybrid.mrr}`,
  );
}
