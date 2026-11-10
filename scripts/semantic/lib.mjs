// Semantic core — hybrid retrieval (vector + BM25) with zero dependencies.
// Offline by default; the remote embedding provider is opt-in and refuses to run without a key.
// Design, measurement and limits: docs/agents/retrieval-quality.md

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

export const INDEX_VERSION = 3;
export const DEFAULT_DIMS = 256;
export const DEFAULT_INDEX = ".index/semantic.json";

const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".js", ".cjs", ".ts", ".tsx", ".jsx", ".json",
  ".yml", ".yaml", ".sh", ".css", ".html", ".txt", ".astro", ".vue",
]);

const SKIP_PATHS = [
  /^node_modules\//, /^\.index\//, /^\.git\//, /package-lock\.json$/,
  /^\.agent\/tasks\//, /\.min\.(js|css)$/,
  // Test fixtures and gold sets quote queries verbatim: indexing them lets the
  // benchmark match itself. They are code under test, not repository knowledge.
  /^tests\//, /^mocks\//,
];

const STOPWORDS = new Set(
  ("the a an and or of to in for on with without not is are be been this that these those it its as at by from " +
    "you your we our they their he she them i me my if then than so such do does did can could should would may might must " +
    "will shall have has had also more most other some any each every both few many own same very just only into over under " +
    "من في على إلى عن مع أو و ثم لكن إذا كان كانت هذا هذه ذلك تلك هو هي هم أن إن ما لا لم لن قد كل بعض غير بين بعد قبل حيث " +
    "كما أي أيها هناك هنا نحن أنت أنتم لهم لها له التي الذي الذين اللاتي وهذا وهذه وكان يكون تكون")
    .split(/\s+/)
    .filter(Boolean),
);

/** FNV-1a 32-bit hash — stable across runs, no crypto dependency needed. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Normalise one token: strip Arabic diacritics, unify letter variants, and
 * remove the definite article / common suffixes in both languages so that
 * "الصلاحيات" and "صلاحيات" collapse to the same term.
 */
export function normalizeToken(raw) {
  let t = raw
    .replace(/[\u064B-\u0652\u0670\u0640]/gu, "")
    .replace(/[\u0623\u0625\u0622]/gu, "\u0627")
    .replace(/\u0649/gu, "\u064A")
    .replace(/\u0629/gu, "\u0647");

  if (/^[\u0600-\u06FF]/u.test(t)) {
    if (t.length > 3 && t.startsWith("\u0627\u0644")) t = t.slice(2);
    t = t.replace(/(\u0627\u062A|\u0648\u0646|\u064A\u0646|\u0627\u0646|\u0647\u0627|\u0647\u0645|\u064A\u0647)$/u, "");
  }
  return t.replace(/(ation|itions|ing|ed|es|s)$/u, "");
}

export function tokenize(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,}/gu) ?? [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(normalizeToken)
    .filter((t) => t.length > 1);
}

/**
 * Local embedding: signed hashing trick over unigrams + bigrams,
 * sublinear term frequency, L2-normalised. Deterministic, so an index
 * built on a laptop matches one built in CI.
 */
export function embedLocal(text, dims = DEFAULT_DIMS) {
  const vector = new Float64Array(dims);
  const tokens = Array.isArray(text) ? text : tokenize(text);

  const add = (term, weight) => {
    const bucket = fnv1a(term) % dims;
    const sign = fnv1a(`#${term}`) % 2 === 0 ? 1 : -1;
    vector[bucket] += sign * weight;
  };

  for (const token of tokens) add(token, 1);
  for (let i = 0; i < tokens.length - 1; i++) add(`${tokens[i]}~${tokens[i + 1]}`, 0.55);

  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vector[i] = Number((vector[i] / norm).toFixed(6));
  return Array.from(vector);
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both sides are L2-normalised
}

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

/** Tracked text files, so the index always mirrors the repository. */
export function listTrackedFiles(root = gitRoot()) {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return out
    .split("\0")
    .filter(Boolean)
    .filter((p) => TEXT_EXTENSIONS.has(extname(p)))
    .filter((p) => !SKIP_PATHS.some((re) => re.test(p)))
    .filter((p) => {
      try {
        return statSync(join(root, p)).size < 400_000;
      } catch {
        return false;
      }
    });
}

function chunkMarkdown(content) {
  const lines = content.split("\n");
  const chunks = [];
  let heading = "";
  let buffer = [];
  let start = 1; // 1-based: a document with no heading still starts at line 1

  const flush = (end) => {
    const text = buffer.join("\n").trim();
    if (text.length > 60) chunks.push({ heading, start, end, text });
    buffer = [];
  };

  lines.forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (m) {
      if (buffer.length) flush(i - 1);
      heading = m[2].trim();
      start = i + 1;
    }
    buffer.push(line);
  });
  if (buffer.length) flush(lines.length);
  return chunks;
}

function chunkCode(content, window = 45, overlap = 10) {
  const lines = content.split("\n");
  const chunks = [];
  for (let i = 0; i < lines.length; i += window - overlap) {
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
// @semantic-ignore-begin
export const BILINGUAL_GLOSSARY = {
  // permissions & ownership
  "صلاحيه": ["permission", "capability", "allow", "deny"],
  "صلاحيات": ["permission", "capability", "matrix"],
  "ممنوع": ["forbidden", "deny", "never"],
  "مسموح": ["allow", "allowed", "permitted"],
  "وكيل": ["agent", "bot"],
  "وكلاء": ["agents"],
  "دمج": ["merge", "merging"],
  "سحب": ["pull", "request"],
  "طلب": ["request", "pull"],
  // provenance & authorship
  "اصل": ["provenance", "origin", "authorship"],
  "تأليف": ["authorship", "author"],
  "التزام": ["commit"],
  "مراجعه": ["review", "reviewed"],
  // security
  "اسرار": ["secret", "secrets", "credential"],
  "سري": ["secret"],
  "امن": ["security", "secure"],
  "امان": ["security", "safety"],
  "ثغره": ["vulnerability", "vulnerability-scan"],
  "تشفير": ["encryption", "crypto"],
  // data & artifacts
  "بيانات": ["data", "dataset"],
  "اصل_بيانات": ["dataset"],
  "مستودع": ["repository", "repo"],
  "سجل": ["ledger", "manifest", "log"],
  "ملف": ["file", "artifact"],
  // testing & quality
  "اختبار": ["test", "testing"],
  "اختبارات": ["tests", "testing"],
  "جوده": ["quality"],
  "خصائص": ["property", "properties"],
  "فشل": ["failure", "fail"],
  // docs & decisions
  "توثيق": ["documentation", "docs"],
  "قرار": ["decision", "adr"],
  "معماريه": ["architecture"],
  "مخطط": ["diagram", "graph"],
  "ترخيص": ["license", "licence", "licensing"],
  // operations
  "فحص": ["scan", "audit", "check"],
  "بينيه": ["environment", "infra"],
  "تكلفه": ["cost", "pricing"],
  "ذاكره": ["memory"],
  "بحث": ["search", "retrieval"],
  "تطبيع": ["normalisation", "normalize", "tokenize"],
  "عربي": ["arabic", "arabic-normalisation"],
  "لغه": ["language"],
};
// @semantic-ignore-finish

/** Adds glossary equivalents to a query's tokens (never to indexed documents). */
export function expandTokens(tokens, maxExtra = 8) {
  const expanded = new Set(tokens);
  const extras = [];
  for (const token of tokens) {
    for (const synonym of BILINGUAL_GLOSSARY[token] ?? []) {
      if (!expanded.has(synonym)) {
        expanded.add(synonym);
        extras.push(synonym);
        if (extras.length >= maxExtra) return { tokens: [...tokens, ...extras], extras };
      }
    }
  }
  return { tokens: [...tokens, ...extras], extras };
}

/* ------------------------------------------------------------------ */
/* BM25 (keyword half of the hybrid)                                   */
/* ------------------------------------------------------------------ */

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** Per-chunk term frequencies, as sorted [token, count] pairs (compact JSON). */
function termFrequencies(tokens) {
  const tf = new Map();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return [...tf.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function buildStats(chunks) {
  const df = new Map();
  let totalLength = 0;
  for (const chunk of chunks) {
    for (const [token] of chunk.terms) df.set(token, (df.get(token) ?? 0) + 1);
    totalLength += chunk.length ?? 0;
  }
  return {
    documents: chunks.length,
    avgLength: chunks.length ? Number((totalLength / chunks.length).toFixed(3)) : 0,
    df: [...df.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

export function bm25Scores(index, queryTokens) {
  const { documents: N, avgLength: avgdl } = index.stats ?? {};
  const dfMap = new Map(index.stats?.df ?? []);
  const scores = new Array(index.chunks.length).fill(0);
  if (!N || !avgdl) return scores;

  for (const token of new Set(queryTokens)) {
    const df = dfMap.get(token) ?? 0;
    if (df === 0) continue;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    index.chunks.forEach((chunk, i) => {
      const entry = chunk.terms?.find(([t]) => t === token);
      if (!entry) return;
      const tf = entry[1];
      const dl = chunk.length ?? 1;
      scores[i] += (idf * (tf * (BM25_K1 + 1))) / (tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avgdl));
    });
  }
  return scores;
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

export async function buildIndex({ root = gitRoot(), provider = activeProvider() } = {}) {
  if (!providers[provider]) throw new Error(`unknown EMBED_PROVIDER: ${provider}`);
  const files = listTrackedFiles(root);
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

export async function search(index, query, { k = 5, mode = "hybrid", provider = index.provider } = {}) {
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

  const top = fused.slice(0, k);
  const max = top[0]?.score || 1;

  return top.map(({ i, score }) => {
    const chunk = index.chunks[i];
    return {
      score: Number((score / max).toFixed(4)),
      raw: Number(score.toFixed(6)),
      mode,
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
    createdAt: index.createdAt,
  };
}
