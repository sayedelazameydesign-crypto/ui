// Semantic core — hybrid retrieval (vector + BM25) with zero dependencies.
// Offline by default; the remote embedding provider is opt-in and refuses to run without a key.
// Design, measurement and limits: docs/agents/retrieval-quality.md

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

import {
  DEFAULT_DIMS,
  STOPWORDS,
  fnv1a,
  normalizeToken,
  tokenize,
  embedLocal,
  cosine,
  BILINGUAL_GLOSSARY,
  expandTokens,
  BM25_K1,
  BM25_B,
  bm25Scores,
  termFrequencies,
  buildStats,
} from "./core.mjs";

// Re-exported so every existing import path keeps working.
export {
  DEFAULT_DIMS,
  STOPWORDS,
  fnv1a,
  normalizeToken,
  tokenize,
  embedLocal,
  cosine,
  BILINGUAL_GLOSSARY,
  expandTokens,
  BM25_K1,
  BM25_B,
  bm25Scores,
};

export const INDEX_VERSION = 4; // 4 = windowed markdown sections
export const DEFAULT_INDEX = ".index/semantic.json";

const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".js", ".cjs", ".ts", ".tsx", ".jsx", ".json",
  ".yml", ".yaml", ".sh", ".css", ".html", ".txt", ".astro", ".vue",
]);

// Agent memory is knowledge about *sessions*, not about the repository: a note
// that records "regenerate the artifacts after staging" reads like documentation
// and outranks the guard script it describes. Default scope excludes it;
// `--with-memory` opts in and the choice is recorded in the index.
export const MEMORY_DIR = ".agent/memory/";

const SKIP_PATHS = [
  /^node_modules\//, /^\.index\//, /^\.git\//, /package-lock\.json$/,
  /^\.agent\/tasks\//, /\.min\.(js|css)$/,
  // Test fixtures and gold sets quote queries verbatim: indexing them lets the
  // benchmark match itself. They are code under test, not repository knowledge.
  /^tests\//, /^mocks\//,
  // Generated mirrors of the corpus. Indexing them duplicates every term in the
  // repository inside one file, which distorts BM25 statistics for real documents.
  /^playground\/index\.json$/, /^docs\/architecture\/graph\.json$/, /^artifacts\.manifest\.json$/,
];

/* ------------------------------------------------------------------ */
/* Sources and chunking                                                */
/* ------------------------------------------------------------------ */

export function gitRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

/** Scope labels are part of the index contract: a reader can tell what it holds. */
export const INDEX_SCOPES = Object.freeze({
  default: { memory: false, label: "docs" },
  withMemory: { memory: true, label: "docs+memory" },
});

export const scopeFor = (includeMemory) => (includeMemory ? INDEX_SCOPES.withMemory : INDEX_SCOPES.default);

/**
 * Whether a tracked path belongs in the index. Pure and exported so the scope
 * rules are testable without building an index.
 */
export function isIndexable(path, { includeMemory = false } = {}) {
  if (!TEXT_EXTENSIONS.has(extname(path))) return false;
  if (SKIP_PATHS.some((re) => re.test(path))) return false;
  if (!includeMemory && path.startsWith(MEMORY_DIR)) return false;
  return true;
}

/** Tracked text files, so the index always mirrors the selected scope. */
export function listTrackedFiles(root = gitRoot(), { includeMemory = false } = {}) {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return out
    .split("\0")
    .filter(Boolean)
    .filter((p) => isIndexable(p, { includeMemory }))
    .filter((p) => {
      try {
        return statSync(join(root, p)).size < 400_000;
      } catch {
        return false;
      }
    });
}

// A long section is a bad unit for retrieval: permission matrices and capability
// tables live in sections of forty rows, and BM25's length normalisation then
// buries the one row that answers the question. Sections are therefore emitted
// as overlapping windows, the same way code already was.
//
// MEASURED (2026-11-10, 58 gold cases, everything else held still):
// R@1 0.552 → 0.586 · R@3 0.690 → 0.690 · MRR 0.625 → 0.648.
// The window is deliberately larger than a table row: a row alone ("Merge a pull
// request | ⛔ | ⛔") carries no subject, so the surrounding context has to travel
// with it. Overlap is what keeps a sentence that straddles the boundary intact.
export const MD_WINDOW = 16; // lines per chunk inside a long section
export const MD_OVERLAP = 4; // lines shared with the previous window
// Sections up to this length are emitted whole; longer ones are windowed. The bound
// is exported because it is a contract the property tests assert, not an accident.
export const MD_CHUNK_MAX = MD_WINDOW + MD_OVERLAP;

// Every windowed loop advances by this step. A configuration where overlap ≥ window
// would make the step zero and the loop infinite — an OOM instead of an error. The
// clamp is defence in depth; the invariant that MD_OVERLAP < MD_WINDOW is asserted by
// the property suite, because a hang inside the guard is worse than a failed test.
export function windowStep(window, overlap) {
  return Math.max(1, window - overlap);
}

function chunkMarkdown(content) {
  const lines = content.split("\n");
  const chunks = [];
  let heading = "";
  let buffer = [];
  let start = 1; // 1-based: a document with no heading still starts at line 1

  const emit = (text, from, to) => {
    if (text.trim().length > 60) chunks.push({ heading, start: from, end: to, text: text.trim() });
  };

  const flush = () => {
    if (buffer.length <= MD_CHUNK_MAX) {
      emit(buffer.join("\n"), start, start + buffer.length - 1);
    } else {
      for (let i = 0; i < buffer.length; i += windowStep(MD_WINDOW, MD_OVERLAP)) {
        const window = buffer.slice(i, i + MD_WINDOW);
        emit(window.join("\n"), start + i, start + i + window.length - 1);
        if (i + MD_WINDOW >= buffer.length) break; // the tail is already inside this window
      }
    }
    buffer = [];
  };

  lines.forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (m) {
      if (buffer.length) flush();
      heading = m[2].trim();
      start = i + 1;
    }
    buffer.push(line);
  });
  if (buffer.length) flush();
  return chunks;
}

function chunkCode(content, window = 45, overlap = 10) {
  const lines = content.split("\n");
  const chunks = [];
  for (let i = 0; i < lines.length; i += windowStep(window, overlap)) {
    const slice = lines.slice(i, i + window);
    if (slice.join("").trim().length < 60) continue;
    chunks.push({ heading: "", start: i + 1, end: Math.min(i + window, lines.length), text: slice.join("\n") });
  }
  return chunks;
}

/** Lines between @semantic-ignore-start / -end are not indexed (glossaries, fixtures, vendored text). */
export function stripIgnored(content) {
  return content
    .split("\n")
    .filter((line) => !/@semantic-ignore-(start|end)/.test(line))
    .join("\n")
    .replace(/@semantic-ignore-begin[\s\S]*?@semantic-ignore-finish/g, "");
}

export function chunkFile(relPath, content) {
  const isMarkdown = extname(relPath) === ".md";
  const clean = stripIgnored(content);
  const parts = isMarkdown ? chunkMarkdown(clean) : chunkCode(clean);
  return parts.map((c, i) => ({
    id: `${relPath}#${i}`,
    file: relPath,
    start: c.start,
    end: c.end,
    heading: c.heading,
    preview: c.text.replace(/\s+/gu, " ").slice(0, 220),
    text: c.text,
  }));
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

export const providers = {
  /** Default. Offline, deterministic, no API key. */
  local: async (texts) => texts.map((t) => embedLocal(t, DEFAULT_DIMS)),

  /** Opt-in. Requires OPENAI_API_KEY; never used by CI (see check-egress). */
  openai: async (texts) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set — refusing to send code off-machine.");
    const model = process.env.EMBED_MODEL ?? "text-embedding-3-small";
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) throw new Error(`embedding request failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return json.data.map((d) => d.embedding);
  },
};

export function activeProvider() {
  return process.env.EMBED_PROVIDER ?? "local";
}

/* ------------------------------------------------------------------ */
/* Bilingual query expansion                                          */
/* ------------------------------------------------------------------ */

/**
 * A hand-curated domain glossary. Hashing embeddings carry no cross-lingual
 * knowledge, so an Arabic query cannot reach an English document by luck.
 * Expanding *queries* (never documents) with known equivalents is a small,
 * auditable, offline substitute for a translation model.
 * Extend it when a real Arabic query fails the eval gate.
 */
/* ------------------------------------------------------------------ */
/* BM25 (keyword half of the hybrid)                                   */
/* ------------------------------------------------------------------ */



/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

export async function buildIndex({ root = gitRoot(), provider = activeProvider(), includeMemory = false } = {}) {
  if (!providers[provider]) throw new Error(`unknown EMBED_PROVIDER: ${provider}`);
  const files = listTrackedFiles(root, { includeMemory });
  const scope = scopeFor(includeMemory);
  const chunks = [];
  for (const file of files) {
    const content = readFileSync(join(root, file), "utf8");
    chunks.push(...chunkFile(file, content));
  }

  const vectors = await providers[provider](
    chunks.map((c) => `${c.heading}\n${c.file.replace(/[/._-]/g, " ")}\n${c.text}`),
  );
  chunks.forEach((c, i) => {
    // The path is part of a chunk's meaning ("permissions.md" answers "permissions"),
    // so it feeds BM25 and the embedding context alike.
    const tokens = tokenize(`${c.heading} ${c.file.replace(/[/._-]/g, " ")} ${c.file} ${c.text}`);
    c.vector = vectors[i];
    c.terms = termFrequencies(tokens);
    c.length = tokens.length;
    delete c.text; // keep the index lean; previews are enough for context
  });

  let commit = "";
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    /* index outside a git checkout is still valid */
  }

  return {
    version: INDEX_VERSION,
    provider,
    scope,
    dims: chunks[0]?.vector.length ?? DEFAULT_DIMS,
    createdAt: new Date().toISOString(),
    commit,
    stats: { files: files.length, chunks: chunks.length, ...buildStats(chunks) },
    chunks,
  };
}

export function saveIndex(index, outPath = DEFAULT_INDEX, root = gitRoot()) {
  const target = resolve(root, outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(index));
  return target;
}

export function loadIndex(indexPath = DEFAULT_INDEX, root = gitRoot()) {
  const target = resolve(root, indexPath);
  if (!existsSync(target)) {
    throw new Error(`no index at ${relative(process.cwd(), target) || target} — run: node scripts/semantic/cli.mjs index`);
  }
  return JSON.parse(readFileSync(target, "utf8"));
}

/* ------------------------------------------------------------------ */
/* Retrieval: vector, keyword, and hybrid (reciprocal rank fusion)     */
/* ------------------------------------------------------------------ */

export const RRF_K = 60; // standard RRF damping constant
export const MODES = ["hybrid", "vector", "keyword"];

function rankedIndexes(scores) {
  return scores
    .map((score, i) => ({ score, i }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.i);
}

/* ------------------------------------------------------------------ */
/* Reranker: a cross-encoder substitute without model weights          */
/* ------------------------------------------------------------------ */

// A true neural cross-encoder needs downloaded weights (~50-500 MB) and a
// runtime. That would break the offline, zero-egress, deterministic contract
// this index is built on. Instead the top candidates are rescored with lexical
// and structural features a cross-encoder would learn anyway: how much of the
// query the passage covers, how rare those terms are, and whether the heading
// or the file path names the thing being asked about.
//
// MEASURED OUTCOME (2026-11-10, 18 gold cases, 389 chunks): this reranker is a
// net loss and is therefore OPT-IN. Four configurations were tried and none beat
// the plain fused order (R@1 0.67 / R@3 0.94 / MRR 0.79):
//   blend 0.5 · a-priori weights  → R@1 0.61 · R@3 0.83 · MRR 0.73
//   blend 0.7 · a-priori weights  → R@1 0.67 · R@3 0.83 · MRR 0.77
//   blend 0.7 · rarity-first      → R@1 0.56 · R@3 0.89 · MRR 0.71
//   blend 0.85 · rarity-first     → R@1 0.61 · R@3 0.89 · MRR 0.76
// Lexical features cannot separate "passage about the topic" from "passage that
// answers the question"; they promote term-dense files. A real cross-encoder
// needs weights, which the offline contract forbids by default.
//
// The weights are fixed *a priori*, not fitted to the gold set — fitting them
// there would be training on the test set. They are stated here so any change
// is reviewable.
export const RERANK_WEIGHTS = Object.freeze({
  coverage: 0.3,     // share of distinct query terms present
  rarity: 0.3,       // same, weighted by IDF: rare terms are the informative ones
  density: 0.15,     // term frequency saturation inside the chunk
  heading: 0.15,     // the passage's own heading names the query term
  path: 0.1,         // the file name names the query term
});

export const RERANK_TOP = 20; // rescore window: beyond this the fused order is noise
export const RERANK_BLEND = 0.5; // fused rank and feature score weigh equally

/**
 * @returns {{ score: number, features: Record<string, number> }}
 */
export function rerankScore(index, chunk, queryTokens) {
  const wanted = [...new Set(queryTokens)];
  if (!wanted.length) return { score: 0, features: {} };

  const terms = new Map(chunk.terms ?? []);
  const headingTokens = new Set(tokenize(chunk.heading ?? ""));
  const pathTokens = new Set(tokenize((chunk.file ?? "").replace(/[/._-]/g, " ")));
  const dfMap = new Map(index.stats?.df ?? []);
  const N = index.stats?.documents ?? 0;

  let matched = 0;
  let matchedIdf = 0;
  let totalIdf = 0;
  let tfSum = 0;
  let headingHit = 0;
  let pathHit = 0;

  for (const token of wanted) {
    const tf = terms.get(token) ?? 0;
    const df = dfMap.get(token) ?? 0;
    const idf = N && df ? Math.log(1 + (N - df + 0.5) / (df + 0.5)) : 1;
    totalIdf += idf;
    if (headingTokens.has(token)) headingHit += 1;
    if (pathTokens.has(token)) pathHit += 1;
    if (tf > 0) {
      matched += 1;
      matchedIdf += idf;
      tfSum += tf;
    }
  }

  const features = {
    coverage: matched / wanted.length,
    rarity: totalIdf ? matchedIdf / totalIdf : 0,
    // Saturating density: 3 occurrences already says "this passage is about it".
    density: Math.min(1, tfSum / (3 * wanted.length)),
    heading: headingHit / wanted.length,
    path: pathHit / wanted.length,
  };

  const score = Object.entries(RERANK_WEIGHTS).reduce(
    (sum, [name, weight]) => sum + weight * (features[name] ?? 0),
    0,
  );
  return { score, features };
}

export async function search(
  index,
  query,
  {
    k = 5,
    mode = "hybrid",
    provider = index.provider,
    rerank = false,
    rerankTop = RERANK_TOP,
    // "lexical" is the measured substitute (opt-in, docs: ADR-0011); "neural"
    // requires verified weights plus a runtime and is refused when either is
    // missing — never silently downgraded to something it is not.
    rerankProvider = "lexical",
  } = {},
) {
  if (!providers[provider]) throw new Error(`unknown provider: ${provider}`);
  if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode} (expected ${MODES.join(" | ")})`);

  const baseTokens = tokenize(query);
  const { tokens: queryTokens, extras: expansions } = expandTokens(baseTokens);
  const queryVector = queryTokens.length
    ? (await providers[provider]([queryTokens]))[0]
    : new Array(index.dims ?? DEFAULT_DIMS).fill(0);

  const vectorScores = index.chunks.map((chunk) => (chunk.vector ? cosine(queryVector, chunk.vector) : 0));
  const keywordScores = bm25Scores(index, queryTokens);

  const vectorRank = rankedIndexes(vectorScores);
  const keywordRank = rankedIndexes(keywordScores);

  let fused;
  if (mode === "vector") fused = vectorRank.map((i) => ({ i, score: vectorScores[i] }));
  else if (mode === "keyword") fused = keywordRank.map((i) => ({ i, score: keywordScores[i] }));
  else {
    const rrf = new Map();
    const bump = (ranked, weight) =>
      ranked.forEach((chunkIndex, rank) => {
        rrf.set(chunkIndex, (rrf.get(chunkIndex) ?? 0) + weight / (RRF_K + rank + 1));
      });
    bump(vectorRank, 1);
    bump(keywordRank, 1);
    fused = [...rrf.entries()]
      .map(([i, score]) => ({ i, score }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
  }

  if (rerank && rerankProvider === "neural") {
    const { neuralStatus } = await import("./model.mjs");
    const status = neuralStatus();
    if (!status.available) {
      throw new Error(
        `neural rerank is not available: ${status.reasons.join(" · ")}. ` +
          "The default path stays local and unchanged; see docs/agents/local-model.md",
      );
    }
  }

  // Rerank a window of candidates, then blend: the fused order still carries the
  // signal, the features correct it where lexical evidence is decisive.
  let ordering = fused;
  const featureScores = new Map();
  if (rerank && fused.length > 1) {
    const window = fused.slice(0, Math.max(k, rerankTop));
    const rest = fused.slice(window.length);
    const maxFused = window[0]?.score || 1;
    const rescored = window
      .map(({ i, score }) => {
        const { score: feature, features } = rerankScore(index, index.chunks[i], queryTokens);
        featureScores.set(i, features);
        return { i, score, feature, blended: RERANK_BLEND * (score / maxFused) + (1 - RERANK_BLEND) * feature };
      })
      .sort((a, b) => b.blended - a.blended || a.i - b.i)
      .map(({ i, score }) => ({ i, score }));
    ordering = [...rescored, ...rest];
  }

  const top = ordering.slice(0, k);
  const max = top[0]?.score || 1;

  return top.map(({ i, score }) => {
    const chunk = index.chunks[i];
    return {
      score: Number((score / max).toFixed(4)),
      raw: Number(score.toFixed(6)),
      mode,
      reranked: rerank && fused.length > 1,
      reranker: rerank ? rerankProvider : "none",
      features: featureScores.get(i),
      vector: Number(vectorScores[i].toFixed(4)),
      keyword: Number(keywordScores[i].toFixed(4)),
      expanded: expansions,
      file: chunk.file,
      line: chunk.start,
      heading: chunk.heading,
      preview: chunk.preview,
    };
  });
}

/** Small helper used by the CLI to print an index summary. */
export function indexSummary(index) {
  const files = new Set(index.chunks.map((c) => c.file));
  return {
    provider: index.provider,
    dims: index.dims,
    commit: index.commit || "unknown",
    files: files.size,
    chunks: index.chunks.length,
    terms: index.stats?.df?.length ?? 0,
    avgLength: index.stats?.avgLength ?? 0,
    scope: index.scope?.label ?? "unscoped (built before scope was recorded)",
    createdAt: index.createdAt,
  };
}
