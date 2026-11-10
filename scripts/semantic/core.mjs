// Pure retrieval primitives — no Node APIs, no dependencies, no I/O.
//
// This file is the canonical implementation of tokenisation, the hashed
// embedding, the bilingual glossary, BM25 and reciprocal rank fusion. It is
// imported by the CLI/engine (scripts/semantic/lib.mjs) *and* by the browser
// playground, so a demo can never drift from the thing it demonstrates.
// Parity is enforced by scripts/playground-parity.mjs.

export const DEFAULT_DIMS = 256;

export const STOPWORDS = new Set(
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

// The glossary is an index-expansion table, not knowledge: indexing it makes every
// Arabic query match the table itself (measured: R@3 0.78 → 0.94 once excluded).
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
  // state, recovery and audit (added 2026-11-10: Arabic questions about snapshots
  // and the ledger were landing on README.md's summary table instead of the doc)
  "نسخه": ["snapshot", "copy", "backup"],
  "نسخ": ["snapshot", "copies", "backup"],
  "لقطه": ["snapshot"],
  "استعاده": ["restore", "recovery", "rollback"],
  "تراجع": ["rollback", "revert", "revert"],
  "استرجاع": ["restore", "retrieval"],
  "بصمه": ["hash", "digest", "fingerprint"],
  "تجزئه": ["hash", "digest", "checksum"],
  "سلسله": ["chain", "sequence", "chained"],
  "تدقيق": ["audit", "ledger"],
  "تلاعب": ["tamper", "tampering"],
  // model artifacts
  "اوزان": ["weights", "artifact", "model"],
  "نموذج": ["model", "weights"],
  "موديل": ["model"],
  "محلي": ["local", "offline"],
  "تحميل": ["download", "load"],
  "توقيع": ["signature", "sign", "pin"],
  // security and privacy
  "خصوصيه": ["privacy", "pii"],
  "تعميه": ["mask", "masking", "redact"],
  "اعفاء": ["exemption", "exception"],
  "استثناء": ["exception", "exemption"],
  "حمايه": ["guard", "protection", "security"],
  "حارس": ["guard", "gate"],
  // retrieval and measurement
  "فهرس": ["index", "indexing"],
  "استجابه": ["latency", "response"],
  "زمن": ["latency", "time"],
  "سرعه": ["speed", "latency", "performance"],
  "دقه": ["precision", "accuracy"],
  "معيار": ["benchmark", "metric", "standard"],
  "قياس": ["measurement", "measured", "benchmark"],
  "سياق": ["context"],
  "ضغط": ["compression", "compress", "pack"],
  "ميزانيه": ["budget"],
  "اقتباس": ["citation", "quote"],
  "طفره": ["mutation", "mutant"],
  "طفرات": ["mutations", "mutants"],
  // operations
  "بيئه": ["environment", "sandbox"],
  "معزول": ["isolated", "isolation", "sandbox"],
  "معاينه": ["preview"],
  "جلسه": ["session"],
  "تصعيد": ["escalate", "escalation"],
  "بشري": ["human", "manual"],
  "تبعيات": ["dependency", "dependencies"],
  "فرع": ["branch"],
  "مفتاح": ["key", "credential"],
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

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** Per-chunk term frequencies, as sorted [token, count] pairs (compact JSON). */
export function termFrequencies(tokens) {
  const tf = new Map();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return [...tf.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function buildStats(chunks) {
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

// Postings are the difference between "scan every chunk for every term" and
// "look up the term". Measured: BM25 was 1.57 ms/query scanning 445 chunks × 10
// tokens with a linear search inside each chunk's term list; postings make it
// proportional to the matching chunks instead.
const postingsCache = new WeakMap();

export function buildPostings(index) {
  const cached = postingsCache.get(index);
  if (cached) return cached;

  const postings = new Map(); // token → [ [chunkIndex, tf], … ]
  index.chunks.forEach((chunk, i) => {
    for (const [token, tf] of chunk.terms ?? []) {
      const list = postings.get(token);
      if (list) list.push([i, tf]);
      else postings.set(token, [[i, tf]]);
    }
  });
  postingsCache.set(index, postings);
  return postings;
}

export function bm25Scores(index, queryTokens) {
  const { documents: N, avgLength: avgdl } = index.stats ?? {};
  const scores = new Array(index.chunks.length).fill(0);
  if (!N || !avgdl) return scores;

  const postings = buildPostings(index);
  for (const token of new Set(queryTokens)) {
    const list = postings.get(token);
    if (!list) continue;
    const df = list.length;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (const [i, tf] of list) {
      const dl = index.chunks[i].length ?? 1;
      scores[i] += (idf * (tf * (BM25_K1 + 1))) / (tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avgdl));
    }
  }
  return scores;
}
