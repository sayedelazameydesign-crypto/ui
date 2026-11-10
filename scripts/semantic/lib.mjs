// Semantic index core — zero dependencies, offline by default.
// See docs/agents/semantic-search.md for the design and the provider contract.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

export const INDEX_VERSION = 2;
export const DEFAULT_DIMS = 256;
export const DEFAULT_INDEX = ".index/semantic.json";

const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".js", ".cjs", ".ts", ".tsx", ".jsx", ".json",
  ".yml", ".yaml", ".sh", ".css", ".html", ".txt", ".astro", ".vue",
]);

const SKIP_PATHS = [
  /^node_modules\//, /^\.index\//, /^\.git\//, /package-lock\.json$/,
  /^\.agent\/tasks\//, /\.min\.(js|css)$/,
];

// Common words in both languages carry no signal for retrieval.
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
    .replace(/[\u064B-\u0652\u0670\u0640]/gu, "") // harakat + tatweel
    .replace(/[\u0623\u0625\u0622]/gu, "\u0627") // alef forms
    .replace(/\u0649/gu, "\u064A") // alef maqsura
    .replace(/\u0629/gu, "\u0647"); // ta marbuta

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
  for (let i = 0; i < tokens.length - 1; i++) {
    add(`${tokens[i]}~${tokens[i + 1]}`, 0.55);
  }

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

export function chunkFile(relPath, content) {
  const isMarkdown = extname(relPath) === ".md";
  const parts = isMarkdown ? chunkMarkdown(content) : chunkCode(content);
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

  /** Opt-in. Requires OPENAI_API_KEY in the environment; never used by CI. */
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

  const vectors = await providers[provider](chunks.map((c) => `${c.heading}\n${c.text}`));
  chunks.forEach((c, i) => {
    c.vector = vectors[i];
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
    stats: { files: files.length, chunks: chunks.length },
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

export async function search(index, query, { k = 5, provider = index.provider } = {}) {
  if (!providers[provider]) throw new Error(`unknown provider: ${provider}`);
  const [queryVector] = await providers[provider]([query]);
  return index.chunks
    .map((chunk) => ({
      score: Number(cosine(queryVector, chunk.vector).toFixed(4)),
      file: chunk.file,
      line: chunk.start,
      heading: chunk.heading,
      preview: chunk.preview,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
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
    createdAt: index.createdAt,
  };
}

export { readdirSync };
