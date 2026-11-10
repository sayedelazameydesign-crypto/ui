#!/usr/bin/env node
// Context packing: fit the useful part of a repository into a token budget.
//
//   node scripts/context-pack.mjs "who may merge a pull request" --budget 1200
//   node scripts/context-pack.mjs "…" --budget 1200 --json --out /tmp/context.md
//   node scripts/context-pack.mjs --eval            # measured across budgets
//
// The pipeline is local and deterministic:
//   1. hybrid retrieval (vector + BM25 + RRF) produces candidates;
//   2. near-duplicate passages are dropped (cosine over the same hashed embedding);
//   3. each passage is compressed *extractively* — query-relevant sentences in
//      their original order, never paraphrased — so every claim keeps a citation;
//   4. passages are selected under the budget with a per-file cap.
//
// What this is not: a summariser. Rewriting text without a model invents
// confident sentences nobody wrote; extracting it keeps the source verifiable.
// So the metric is not "how short" but "how much of the answer survived".
//
// Decision record: docs/adr/0017-context-packing.md

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DEFAULT_INDEX, cosine, embedLocal, gitRoot, loadIndex, search, tokenize } from "./semantic/lib.mjs";
import { sanitizeText } from "./security/adversarial.mjs";

export const CHARS_PER_TOKEN = 4; // a stated estimate, not a tokenizer
export const estimateTokens = (text) => Math.ceil(text.length / CHARS_PER_TOKEN);

/** The exact source range a chunk cites — citations must resolve to real lines. */
export function chunkText(root, chunk) {
  try {
    const lines = readFread(root, chunk.file).split("\n");
    const from = Math.max(0, (chunk.start ?? 1) - 1);
    const to = chunk.end ? Math.min(lines.length, chunk.end) : Math.min(lines.length, from + 40);
    return lines.slice(from, to).join("\n");
  } catch {
    return "";
  }
}

const readFread = (root, file) => readFileSync(join(root, file), "utf8");

const SENTENCE_SPLIT = /(?<=[.!?؟])\s+|\n+/u;

const idfOf = (index, token) => {
  const N = index.stats?.documents ?? 0;
  const df = new Map(index.stats?.df ?? []).get(token) ?? 0;
  return N && df ? Math.log(1 + (N - df + 0.5) / (df + 0.5)) : 0;
};

/** Extractive compression: the highest-value sentences, in source order. */
export function compressPassage(index, text, queryTokens, { maxSentences = 3, maxChars = 420 } = {}) {
  const wanted = new Set(queryTokens);
  const sentences = text
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);

  if (!sentences.length) return { text: text.trim().slice(0, maxChars), kept: 0, total: 0, matched: false, positions: [] };

  const scored = sentences.map((sentence, position) => {
    let score = 0;
    for (const token of new Set(tokenize(sentence))) if (wanted.has(token)) score += idfOf(index, token);
    // A chunk opens right after a heading, so its first sentence carries more context.
    return { sentence, position, score: score + (position === 0 ? 0.5 : 0) };
  });

  const ranked = [...scored].sort((a, b) => b.score - a.score || a.position - b.position);
  const matched = ranked.some((item) => item.score > 0.5);
  const picked = new Set(ranked.slice(0, Math.max(1, Math.min(maxSentences, sentences.length))).map((item) => item.position));

  let out = "";
  let previous = null;
  for (const item of scored) {
    if (!picked.has(item.position)) continue;
    // Mark a gap when sentences were skipped: a reader must see that text is
    // missing, otherwise an extract reads as if the source were this short.
    const gap = previous !== null && item.position > previous + 1 ? " … " : " ";
    const next = out ? `${out}${gap}${item.sentence}` : item.sentence;
    if (next.length > maxChars) break;
    out = next;
    previous = item.position;
  }
  return {
    text: out || sentences[0].slice(0, maxChars),
    kept: picked.size,
    total: sentences.length,
    matched,
    // Exposed so a test can state the contract: a gap marker appears exactly when
    // the kept sentences are not contiguous in the source.
    positions: [...picked].sort((a, b) => a - b),
  };
}

/**
 * @param {{ file: string, line: number, score: number, heading?: string }[]} hits
 * @returns {{ nodes: object[], stats: object }}
 */
export function pack(index, root, query, hits, { budgetTokens = 1200, maxPerFile = 2, maxSentences = 3 } = {}) {
  const queryTokens = tokenize(query);
  const chosen = [];
  const vectors = [];
  const perFile = new Map();
  let duplicates = 0;
  let overBudget = 0;
  let tokens = 0;
  let neutralized = 0;

  for (const hit of hits) {
    const used = perFile.get(hit.file) ?? 0;
    if (used >= maxPerFile) continue;

    const chunk = index.chunks.find((candidate) => candidate.file === hit.file && candidate.start === hit.line);
    const raw = chunk ? chunkText(root, chunk) : "";
    if (!raw.trim()) continue;

    // Retrieved text is untrusted input: it may carry zero-width or bidi
    // codepoints that an agent reads and a human never sees. Neutralise before it
    // enters the pack — line structure is preserved, so citations stay valid.
    const compressed = compressPassage(index, raw, queryTokens, { maxSentences });
    const cleaned = sanitizeText(compressed.text);
    const kept = compressed.kept;
    const total = compressed.total;
    const text = cleaned.text;
    neutralized += cleaned.total;
    const vector = embedLocal(text, index.dims ?? 256);

    if (vectors.some((other) => cosine(vector, other) > 0.95)) {
      duplicates += 1; // the same fact quoted twice is one fact
      continue;
    }

    const node = {
      file: hit.file,
      line: hit.line,
      heading: hit.heading ?? "",
      text,
      score: hit.score,
      sentences: `${kept}/${total}`,
    };
    const nodeTokens = estimateTokens(`${node.file}\n${node.heading}\n${node.text}`);
    if (tokens + nodeTokens > budgetTokens) {
      overBudget += 1;
      continue;
    }

    tokens += nodeTokens;
    chosen.push(node);
    vectors.push(vector);
    perFile.set(hit.file, used + 1);
  }

  return {
    nodes: chosen.sort((a, b) => b.score - a.score),
    stats: {
      candidates: hits.length,
      duplicates,
      overBudget,
      kept: chosen.length,
      neutralized,
      tokens,
      chars: chosen.reduce((sum, node) => sum + node.text.length, 0),
      budget: budgetTokens,
    },
  };
}

export function render(query, packed) {
  const header = [
    "# Packed context",
    "",
    `> query: ${query}`,
    `> budget: ${packed.stats.budget} tokens (estimate: ${CHARS_PER_TOKEN} chars/token)`,
    `> used: ${packed.stats.tokens} tokens · ${packed.stats.kept} passages · ` +
      `${packed.stats.duplicates} duplicate(s) dropped · ${packed.stats.overBudget} over budget` +
      (packed.stats.neutralized ? ` · ${packed.stats.neutralized} invisible codepoint(s) neutralised` : ""),
    "",
  ];
  const body = packed.nodes.map(
    (node) => `## ${node.file}:${node.line}${node.heading ? ` — ${node.heading}` : ""}\n\n${node.text}\n`,
  );
  return `${header.join("\n")}\n${body.join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

async function evaluate(root, index) {
  const gold = JSON.parse(readFileSync(join(root, "tests/semantic-gold.json"), "utf8"));
  const budgets = [400, 800, 1600, 3200];

  // One retrieval pass per case; the budget only changes selection.
  const prepared = [];
  let corpusChars = 0;
  for (const chunk of index.chunks) corpusChars += chunkText(root, chunk).length;
  let baselineChars = 0;
  for (const testCase of gold.cases) {
    const hits = await search(index, testCase.query, { k: 40 });
    // The honest baseline: sending every retrieved candidate in full.
    for (const hit of hits) {
      const chunk = index.chunks.find((candidate) => candidate.file === hit.file && candidate.start === hit.line);
      if (chunk) baselineChars += chunkText(root, chunk).length;
    }
    prepared.push({ testCase, hits });
  }
  const meanBaselineChars = baselineChars / Math.max(1, prepared.length);

  console.log(
    `context packing · ${gold.cases.length} cases · corpus ${(corpusChars / 1024).toFixed(0)} KiB ` +
      `(${estimateTokens("x".repeat(corpusChars)).toLocaleString()} est. tokens)\n`,
  );
  console.log(`${"budget".padEnd(9)}${"passages".padEnd(11)}${"tokens".padEnd(10)}${"answer@budget".padEnd(17)}${"vs corpus".padEnd(12)}vs top-40`);
  console.log("-".repeat(62));

  const rows = [];
  for (const budget of budgets) {
    let answer = 0;
    let totalTokens = 0;
    let totalChars = 0;
    let passages = 0;
    for (const { testCase, hits } of prepared) {
      const packed = pack(index, root, testCase.query, hits, { budgetTokens: budget });
      if (packed.nodes.some((node) => testCase.expect.includes(node.file))) answer += 1;
      totalTokens += packed.stats.tokens;
      totalChars += packed.stats.chars;
      passages += packed.stats.kept;
    }
    const meanChars = totalChars / prepared.length;
    const ratio = corpusChars / Math.max(1, meanChars);
    const vsBaseline = meanBaselineChars / Math.max(1, meanChars);
    const row = {
      budget,
      passages: Number((passages / prepared.length).toFixed(1)),
      tokens: Math.round(totalTokens / prepared.length),
      answerRate: Number((answer / prepared.length).toFixed(3)),
      compression: Number(ratio.toFixed(0)),
      vsBaseline: Number(vsBaseline.toFixed(1)),
    };
    rows.push(row);
    console.log(
      `${String(budget).padEnd(9)}${String(row.passages).padEnd(11)}${String(row.tokens).padEnd(10)}` +
        `${`${(row.answerRate * 100).toFixed(0)}%`.padEnd(17)}${`${row.compression}×`.padEnd(12)}${`${row.vsBaseline}×`}`,
    );
  }
  console.log("\nanswer@budget = the gold file is cited in the pack");
  console.log("vs corpus = corpus size ÷ pack · vs top-40 = the unpacked candidate set (what most tools send) ÷ pack");
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(`--${name}`);
  const value = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at !== -1 && argv[at + 1] ? argv[at + 1] : fallback;
  };

  const root = gitRoot();
  const index = loadIndex(DEFAULT_INDEX, root);

  if (flag("eval")) {
    await evaluate(root, index);
    return;
  }

  const consumed = new Set([value("budget"), value("out"), value("mode")].filter(Boolean));
  const query = argv.filter((arg) => !arg.startsWith("--") && !consumed.has(arg)).join(" ").trim();
  if (!query) {
    console.error('usage: node scripts/context-pack.mjs "your question" [--budget 1200] [--json] [--out file.md]');
    process.exitCode = 2;
    return;
  }

  const hits = await search(index, query, { k: 40 });
  const packed = pack(index, root, query, hits, { budgetTokens: Number(value("budget", 1200)) });

  if (flag("json")) {
    console.log(JSON.stringify({ query, ...packed }, null, 2));
    return;
  }

  const markdown = render(query, packed);
  if (value("out")) {
    writeFileSync(value("out"), markdown);
    console.log(`wrote ${relative(process.cwd(), value("out"))} · ${packed.stats.tokens}/${packed.stats.budget} tokens · ${packed.stats.kept} passages`);
  } else {
    console.log(markdown);
  }
}

if (process.argv[1] && process.argv[1].endsWith("context-pack.mjs")) await main();
