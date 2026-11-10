#!/usr/bin/env node
// Export the semantic index for the browser playground.
//
//   node scripts/export-playground.mjs           # write playground/index.json
//   node scripts/export-playground.mjs --check   # fail if the file is stale
//
// The playground must work by opening one HTML file — no server, no bundler, no
// CDN. That means the index has to ship with it, so vectors are int8-quantized
// to keep the artifact small; the quantisation error is measured, not assumed
// (scripts/playground-parity.mjs compares playground recall to the real engine's).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_INDEX, gitRoot, indexSummary, loadIndex } from "./semantic/lib.mjs";

const OUT = "playground/index.json";
const SCALE = 127; // int8 range, symmetric

const root = gitRoot();
const target = join(root, OUT);

if (!existsSync(join(root, DEFAULT_INDEX))) {
  console.error(`no index at ${DEFAULT_INDEX} — run: node scripts/semantic/cli.mjs index`);
  process.exit(1);
}

const index = loadIndex(DEFAULT_INDEX, root);

const quantise = (vector) => {
  const bytes = Buffer.alloc(vector.length);
  let clipped = 0;
  for (let i = 0; i < vector.length; i += 1) {
    let value = Math.round(vector[i] * SCALE);
    if (value > 127) {
      value = 127;
      clipped += 1;
    }
    if (value < -127) {
      value = -127;
      clipped += 1;
    }
    bytes[i] = value < 0 ? 256 + value : value;
  }
  return { base64: bytes.toString("base64"), clipped };
};

let clippedTotal = 0;
const chunks = index.chunks.map((chunk) => {
  const { base64, clipped } = quantise(chunk.vector);
  clippedTotal += clipped;
  return {
    f: chunk.file,
    l: chunk.start,
    h: chunk.heading,
    p: chunk.preview,
    n: chunk.length,
    // `[[term, tf], …]` serialised as `term tf,term tf`. Same data, 165 KiB
    // smaller — the exported index has to stay under the 1 MB LFS threshold.
    t: chunk.terms.map(([term, tf]) => `${term} ${tf}`).join(","),
    v: base64,
  };
});

const payload = {
  version: index.version,
  generator: "scripts/export-playground.mjs",
  // No commit hash here on purpose: an exported artifact that embeds HEAD can
  // never be "current" after it is committed, so `--check` would fail forever.
  dims: index.dims,
  termsEncoding: "term tf,term tf",
  quantization: {
    scheme: "int8",
    scale: SCALE,
    clippedComponents: clippedTotal,
    note: "vectors are stored as int8 (value = round(component * 127)); query vectors stay float32. Parity is measured by scripts/playground-parity.mjs.",
  },
  stats: {
    files: index.stats.files,
    documents: index.stats.documents,
    avgLength: index.stats.avgLength,
    df: index.stats.df,
  },
  chunks,
};

const serialised = `${JSON.stringify(payload)}\n`;

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== serialised) {
    console.error(`\x1b[31m✗\x1b[0m ${OUT} is stale — run: node scripts/export-playground.mjs`);
    process.exit(1);
  }
  console.log(`\x1b[32m✓\x1b[0m ${OUT} is current (${chunks.length} chunks)`);
  process.exit(0);
}

mkdirSync(join(root, "playground"), { recursive: true });
writeFileSync(target, serialised);

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KiB`;
console.log(`exported ${indexSummary(index).chunks} chunks → ${OUT} (${kb(Buffer.byteLength(serialised))})`);
console.log(`dims ${index.dims} · int8 quantized · ${clippedTotal} clipped component(s)`);
