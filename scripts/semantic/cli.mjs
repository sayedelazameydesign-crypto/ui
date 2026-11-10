#!/usr/bin/env node
// Semantic search over the repository — keyword-free, meaning-based retrieval.
//
//   node scripts/semantic/cli.mjs index [--out .index/semantic.json]
//   node scripts/semantic/cli.mjs search "least privilege agent" [-k 5] [--json]
//   node scripts/semantic/cli.mjs stats
//   node scripts/semantic/cli.mjs doctor
//
// Offline by default (EMBED_PROVIDER=local). EMBED_PROVIDER=openai opts into a
// remote provider and requires OPENAI_API_KEY — see docs/agents/semantic-search.md.

import { buildIndex, saveIndex, loadIndex, search, indexSummary, activeProvider, DEFAULT_INDEX, MODES, gitRoot } from "./lib.mjs";

const argv = process.argv.slice(2);
const command = argv[0] ?? "help";

function flag(name, fallback = undefined) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

function numberFlag(name, fallback) {
  const v = flag(name);
  return v === undefined || typeof v === "boolean" ? fallback : Number(v);
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const score = (n) => (n > 0.4 ? `\x1b[32m${n.toFixed(3)}\x1b[0m` : n > 0.2 ? `\x1b[33m${n.toFixed(3)}\x1b[0m` : dim(n.toFixed(3)));

async function cmdIndex() {
  const out = typeof flag("out") === "string" ? flag("out") : DEFAULT_INDEX;
  const provider = activeProvider();
  const t0 = Date.now();
  const index = await buildIndex({ provider });
  const target = saveIndex(index, out);
  const s = indexSummary(index);
  console.log(`${bold("indexed")} ${s.files} files → ${bold(String(s.chunks))} chunks in ${Date.now() - t0}ms`);
  console.log(`  provider : ${s.provider} (dims ${s.dims})`);
  console.log(`  terms    : ${s.terms} unique · avg length ${s.avgLength}`);
  console.log(`  commit   : ${s.commit}`);
  console.log(`  output   : ${target}`);
}

const VALUE_FLAGS = new Set(["k", "index", "out", "query", "provider", "mode"]);

/** Positional words only: skips flags and the values that belong to them. */
function positionals() {
  const words = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      if (VALUE_FLAGS.has(arg.slice(2)) && argv[i + 1] && !argv[i + 1].startsWith("-")) i++;
      continue;
    }
    if (arg.startsWith("-")) {
      if (VALUE_FLAGS.has(arg.slice(1)) && argv[i + 1] && !argv[i + 1].startsWith("-")) i++;
      continue;
    }
    words.push(arg);
  }
  return words.join(" ").trim();
}

async function cmdSearch() {
  const query = typeof flag("query") === "string" ? flag("query") : positionals();
  if (!query || query === "search") {
    console.error('usage: node scripts/semantic/cli.mjs search "your question" [-k 5] [--json]');
    process.exit(2);
  }
  const index = loadIndex(typeof flag("index") === "string" ? flag("index") : DEFAULT_INDEX, gitRoot());
  const mode = typeof flag("mode") === "string" ? flag("mode") : "hybrid";
  const results = await search(index, query, { k: numberFlag("k", 5), mode });

  if (flag("json")) {
    console.log(JSON.stringify({ query, mode, provider: index.provider, commit: index.commit, results }, null, 2));
    return;
  }

  console.log(`${bold("query")} ${query}  ${dim(`(provider ${index.provider}, index@${index.commit || "?"})`)}\n`);
  if (results.length === 0) {
    console.log("no matches — rebuild the index or rephrase the query");
    return;
  }
  for (const r of results) {
    const where = `${r.file}:${r.line}`;
    const heading = r.heading ? dim(` § ${r.heading}`) : "";
    const parts = dim(`vec ${r.vector.toFixed(3)} · bm25 ${r.keyword.toFixed(3)}`);
    console.log(`${score(r.score)}  ${bold(where)}${heading}`);
    console.log(`       ${dim(r.preview.slice(0, 140))}`);
    console.log(`       ${parts}`);
  }
}

async function cmdStats() {
  const index = loadIndex(typeof flag("index") === "string" ? flag("index") : DEFAULT_INDEX, gitRoot());
  const s = indexSummary(index);
  console.log(JSON.stringify(s, null, 2));
}

async function cmdDoctor() {
  const provider = activeProvider();
  const checks = [];
  checks.push(["node runtime", process.version, true]);
  checks.push(["provider", provider, provider === "local" || Boolean(process.env.OPENAI_API_KEY)]);
  if (provider !== "local") {
    checks.push(["OPENAI_API_KEY", process.env.OPENAI_API_KEY ? "set" : "missing", Boolean(process.env.OPENAI_API_KEY)]);
  }
  const requireIndex = argv.includes("--require-index");
  try {
    const index = loadIndex(DEFAULT_INDEX, gitRoot());
    checks.push(["index", `${indexSummary(index).chunks} chunks @ ${index.commit || "?"}`, index.version === 2]);
  } catch (e) {
    // Before the first build there is legitimately no index; only fail if asked.
    checks.push(["index", `absent — run "index" (${e.message.split("—")[0].trim()})`, !requireIndex]);
  }
  for (const [label, value, okFlag] of checks) {
    console.log(`${okFlag ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label.padEnd(14)} ${dim(String(value))}`);
  }
  if (checks.some((c) => !c[2])) process.exitCode = 1;
}

function help() {
  console.log(`semantic — meaning-based search over this repository

  node scripts/semantic/cli.mjs index [--out <path>]      build the vector index
  node scripts/semantic/cli.mjs search <query> [-k N] [--mode hybrid|vector|keyword]
  node scripts/semantic/eval.mjs                          quality gate (recall@k, MRR)
  node scripts/semantic/cli.mjs stats                     index summary
  node scripts/semantic/cli.mjs doctor [--require-index]  environment self-check

Modes: hybrid (default, RRF over vector + BM25) · vector · keyword
Default provider: local (offline, deterministic). No network, no API key.`);
}

const commands = { index: cmdIndex, search: cmdSearch, stats: cmdStats, doctor: cmdDoctor, help };

if (!commands[command]) {
  console.error(`unknown command: ${command}`);
  help();
  process.exit(2);
}

try {
  await commands[command]();
} catch (error) {
  console.error(`\x1b[31merror\x1b[0m ${error.message}`);
  process.exit(1);
}
