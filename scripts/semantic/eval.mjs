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
const MIN_RECALL_AT_3 = Number(value("min-recall", 0.9));
const MIN_MRR = Number(value("min-mrr", 0.75));
// R@1 floor = measured value (0.667) with a little headroom. The *goal* is 0.85
// (decision D8) and is deliberately not the gate: a gate nobody passes is a
// disabled gate. Raising this number is the definition of progress.
const MIN_RECALL_AT_1 = Number(value("min-r1", 0.65));
const RERANK = argv.includes("--rerank"); // default off: measured worse, see lib.mjs
const JSON_OUT = argv.includes("--json");
const TIMING = argv.includes("--timing");

const gold = JSON.parse(readFileSync("tests/semantic-gold.json", "utf8"));
const cases = gold.cases ?? [];

const root = gitRoot();
let index;
if (argv.includes("--rebuild") || !existsSync(DEFAULT_INDEX)) {
  index = await buildIndex({ root });
  saveIndex(index, DEFAULT_INDEX, root);
  if (!JSON_OUT) console.error(`rebuilt index: ${index.chunks.length} chunks`);
} else {
  index = loadIndex(DEFAULT_INDEX, root);
}

/** rank of the first acceptable hit (1-based), or 0 when nothing matched. */
function firstHitRank(results, expect) {
  const wanted = new Set(expect);
  const at = results.findIndex((r) => wanted.has(r.file));
  return at === -1 ? 0 : at + 1;
}

const perMode = {};
for (const mode of MODES) {
  const rows = [];
  let ms = 0;
  for (const testCase of cases) {
    const started = performance.now();
    const results = await search(index, testCase.query, { k: Math.max(K, 3), mode, rerank: RERANK });
    ms += performance.now() - started;
    rows.push({ id: testCase.id, rank: firstHitRank(results, testCase.expect), top: results[0]?.file ?? null, expect: testCase.expect });
  }
  const at1 = rows.filter((r) => r.rank === 1).length / rows.length;
  const at3 = rows.filter((r) => r.rank > 0 && r.rank <= 3).length / rows.length;
  const atK = rows.filter((r) => r.rank > 0 && r.rank <= K).length / rows.length;
  const mrr = rows.reduce((sum, r) => sum + (r.rank > 0 ? 1 / r.rank : 0), 0) / rows.length;
  perMode[mode] = {
    mode,
    recall1: Number(at1.toFixed(3)),
    recall3: Number(at3.toFixed(3)),
    [`recall${K}`]: Number(atK.toFixed(3)),
    mrr: Number(mrr.toFixed(3)),
    msPerQuery: Number((ms / rows.length).toFixed(2)),
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
  console.log(`retrieval eval · ${cases.length} cases · k=${K} · index ${index.chunks.length} chunks @ ${index.commit || "?"} · rerank ${RERANK ? "on" : "off"}\n`);
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
