#!/usr/bin/env node
// Property-based test runner — zero dependencies, seeded, shrinking.
//
//   node scripts/property-test.mjs                  # all properties, 100 runs each
//   node scripts/property-test.mjs --runs 500       # deeper
//   node scripts/property-test.mjs --seed 42        # reproduce a failure exactly
//   node scripts/property-test.mjs --only semantic  # filter by file name
//
// Properties live in tests/properties/*.mjs and default-export an array of
//   { name, generators: { arg: gen }, property: ({ arg }) => boolean | void }
// Throwing or returning false is a failure. Failures shrink to a minimal input
// before being reported, so the message is actionable rather than a wall of data.

import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { runProperty, seedRng } from "./lib/property.mjs";

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

const RUNS = Number(value("runs", 100));
const SEED = Number(value("seed", 20260101));
const ONLY = value("only", "");
const QUIET = argv.includes("--quiet");

seedRng(SEED);

/* ------------------------------------------------------------------ */
/* Discovery and reporting                                             */
/* ------------------------------------------------------------------ */

const propertiesDir = resolve("tests/properties");
let files = [];
try {
  files = readdirSync(propertiesDir)
    .filter((f) => f.endsWith(".mjs"))
    .sort();
} catch {
  console.error(`no property files found in ${propertiesDir}`);
  process.exit(2);
}
if (ONLY) files = files.filter((f) => f.includes(ONLY));

let total = 0;
let failed = 0;
const startedAt = Date.now();

for (const file of files) {
  const module = await import(pathToFileURL(join(propertiesDir, file)).href);
  const definitions = module.default ?? [];
  if (!QUIET) console.log(`\n\x1b[1m${file}\x1b[0m`);

  for (const definition of definitions) {
    total++;
    const { ok, failure } = runProperty(definition, Number(definition.runs ?? RUNS));
    if (ok) {
      if (!QUIET) console.log(`  \x1b[32m✓\x1b[0m ${definition.name}`);
    } else {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${definition.name}`);
      console.log(`      minimal counterexample: ${JSON.stringify(failure)}`);
      if (definition.hint) console.log(`      hint: ${definition.hint}`);
    }
  }
}

const ms = Date.now() - startedAt;
if (failed) {
  console.log(`\n\x1b[31m${failed} of ${total} properties failed\x1b[0m (seed ${SEED}, ${ms}ms)`);
  console.log(`reproduce: node scripts/property-test.mjs --seed ${SEED}`);
  process.exit(1);
}
console.log(`\n\x1b[32m${total} properties passed\x1b[0m · ${RUNS} runs each · seed ${SEED} · ${ms}ms`);
