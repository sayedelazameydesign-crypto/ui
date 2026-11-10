#!/usr/bin/env node
// Parity: does the browser playground answer like the real engine?
//
//   node scripts/playground-parity.mjs
//
// A demo that quietly retrieves worse than the thing it demonstrates is a lie
// with good typography. This runs both engines over the gold set and fails if the
// playground's recall@3 drifts from the engine's by more than the tolerance —
// int8-quantized vectors are the only intended source of difference.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadIndex, search as engineSearch, DEFAULT_INDEX, gitRoot } from "./semantic/lib.mjs";
import { hydrate, search as playgroundSearch } from "../playground/engine.mjs";

const TOLERANCE = 0.06;
const K = 5;

const root = gitRoot();
const gold = JSON.parse(readFileSync(join(root, "tests/semantic-gold.json"), "utf8"));
const payload = JSON.parse(readFileSync(join(root, "playground/index.json"), "utf8"));

const engineIndex = loadIndex(DEFAULT_INDEX, root);
const demoIndex = hydrate(payload);

// The engine API is async by contract (a provider may be remote); with the local
// provider every call resolves immediately, so resolve once up front.
const engineResults = new Map();
for (const testCase of gold.cases) {
  engineResults.set(testCase.id, await engineSearch(engineIndex, testCase.query, { k: K }));
}

const rank = (results, expect) => {
  const wanted = new Set(expect);
  const at = results.findIndex((result) => wanted.has(result.file));
  return at === -1 ? 0 : at + 1;
};

const measure = (resultsFor) => {
  const rows = gold.cases.map((testCase) => ({ id: testCase.id, rank: rank(resultsFor(testCase), testCase.expect) }));
  const at3 = rows.filter((row) => row.rank > 0 && row.rank <= 3).length / rows.length;
  const mrr = rows.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / rows.length;
  return {
    at3: Number(at3.toFixed(3)),
    mrr: Number(mrr.toFixed(3)),
    misses: rows.filter((row) => !row.rank || row.rank > 3).map((row) => row.id),
  };
};

const engine = measure((testCase) => engineResults.get(testCase.id));
const demo = measure((testCase) => playgroundSearch(demoIndex, testCase.query, { k: K }));

const delta = Number(Math.abs(engine.at3 - demo.at3).toFixed(3));
const ok = delta <= TOLERANCE;

console.log(`playground parity · ${gold.cases.length} gold cases · ${payload.chunks.length} chunks (int8 vectors)\n`);
console.log(`engine      R@3 ${engine.at3.toFixed(2)} · MRR ${engine.mrr.toFixed(2)}`);
console.log(`playground  R@3 ${demo.at3.toFixed(2)} · MRR ${demo.mrr.toFixed(2)}`);
console.log(`delta       ${delta.toFixed(3)} (tolerance ${TOLERANCE})`);

if (demo.misses.length) console.log(`\nplayground misses: ${demo.misses.join(", ")}`);

console.log(ok ? "\n✓ the playground answers like the engine" : "\n✗ the playground has drifted from the engine");
process.exit(ok ? 0 : 1);
