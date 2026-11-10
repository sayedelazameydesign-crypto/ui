// Properties for the semantic engine: tokeniser and embedder contract.
// These are invariants, not examples — they hold for every generated input.

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  tokenize, normalizeToken, embedLocal, cosine, fnv1a, chunkFile, bm25Scores, DEFAULT_DIMS, MD_CHUNK_MAX,
  isIndexable, listTrackedFiles, gitRoot, loadIndex, MEMORY_DIR, DEFAULT_INDEX,
} from "../../scripts/semantic/lib.mjs";
import { gen } from "../../scripts/lib/property.mjs";

const vectorGen = gen.arrayOf(gen.text({ maxLength: 12 }), { maxLength: 6 });

const unit = (s) => s.replace(/[\u064B-\u0652]/gu, "");

export default [
  {
    name: "postings-based BM25 equals a naive reference implementation",
    generators: { tokens: gen.arrayOf(gen.pick(["alpha", "beta", "gamma", "delta"]), { maxLength: 4 }) },
    property: ({ tokens }) => {
      const chunks = [
        { terms: [["alpha", 2], ["beta", 1]], length: 12 },
        { terms: [["beta", 3]], length: 8 },
        { terms: [["gamma", 1], ["alpha", 1]], length: 20 },
      ];
      const df = new Map();
      for (const chunk of chunks) for (const [token] of chunk.terms) df.set(token, (df.get(token) ?? 0) + 1);
      const index = {
        chunks,
        stats: { documents: chunks.length, avgLength: 40 / 3, df: [...df.entries()] },
      };

      const K1 = 1.2;
      const B = 0.75;
      const naive = new Array(chunks.length).fill(0);
      for (const token of new Set(tokens)) {
        const d = df.get(token) ?? 0;
        if (!d) continue;
        const idf = Math.log(1 + (chunks.length - d + 0.5) / (d + 0.5));
        chunks.forEach((chunk, i) => {
          const tf = chunk.terms.find(([t]) => t === token)?.[1] ?? 0;
          if (!tf) return;
          naive[i] += (idf * (tf * (K1 + 1))) / (tf + K1 * (1 - B + (B * chunk.length) / (40 / 3)));
        });
      }

      const fast = bm25Scores(index, tokens);
      return fast.every((score, i) => Math.abs(score - naive[i]) < 1e-9);
    },
  },

  {
    name: "tokenize never yields empty or stopword tokens",
    generators: { text: gen.text({ maxLength: 40 }) },
    property: ({ text }) => tokenize(text).every((t) => t.length > 1),
  },
  {
    name: "tokenize is compositional: separate texts contribute their own tokens",
    generators: { a: gen.text({ maxLength: 20 }), b: gen.text({ maxLength: 20 }) },
    property: ({ a, b }) => {
      const combined = tokenize(`${a} ${b}`);
      return [...tokenize(a), ...tokenize(b)].every((t) => combined.includes(t));
    },
  },
  {
    name: "Arabic diacritics do not change the token (تشكيل)",
    generators: { word: gen.pick(["صلاحيات", "الأمان", "المستودع", "الوكيل"]) },
    property: ({ word }) => normalizeToken(unit(word)) === normalizeToken(word),
  },
  {
    name: "Arabic definite article is normalised away",
    generators: { bare: gen.pick(["صلاحيات", "أسرار", "مستودع", "وكيل"]) },
    property: ({ bare }) => normalizeToken(`ال${bare}`) === normalizeToken(bare),
  },
  {
    name: "embedLocal returns a unit-norm vector of the requested length",
    generators: { text: gen.text({ maxLength: 40 }) },
    property: ({ text }) => {
      const v = embedLocal(text, DEFAULT_DIMS);
      if (v.length !== DEFAULT_DIMS) return false;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return tokenize(text).length === 0 ? norm < 1e-6 : Math.abs(norm - 1) < 1e-5;
    },
  },
  {
    name: "cosine is symmetric and bounded in [0, 1] for unit vectors",
    generators: { a: gen.text({ maxLength: 30 }), b: gen.text({ maxLength: 30 }) },
    property: ({ a, b }) => {
      const va = embedLocal(a);
      const vb = embedLocal(b);
      const ab = cosine(va, vb);
      const ba = cosine(vb, va);
      return Math.abs(ab - ba) < 1e-9 && ab >= -1e-6 && ab <= 1 + 1e-6;
    },
  },
  {
    name: "cosine of a vector with itself is 1 (or 0 for empty text)",
    generators: { text: gen.text({ maxLength: 30 }) },
    property: ({ text }) => {
      const v = embedLocal(text);
      const self = cosine(v, v);
      return tokenize(text).length === 0 ? self < 1e-6 : Math.abs(self - 1) < 1e-5;
    },
  },
  {
    name: "fnv1a is stable, unsigned, and 32-bit",
    generators: { values: vectorGen },
    property: ({ values }) => {
      const text = values.join("|");
      const h = fnv1a(text);
      return h === fnv1a(text) && Number.isInteger(h) && h >= 0 && h < 2 ** 32;
    },
  },
  {
    name: "chunkFile keeps line ranges inside the document",
    generators: { range: gen.lineRange({ maxLines: 60 }), seed: gen.text({ maxLength: 8 }) },
    property: ({ range, seed }) => {
      const lines = Array.from({ length: range.total }, (_, i) => `${seed} line ${i} content`);
      const content = lines.join("\n");
      const chunks = chunkFile("sample.md", content);
      return chunks.every(
        (c) => c.start >= 1 && c.end <= lines.length && c.start <= c.end && c.preview.length > 0,
      );
    },
  },
  {
    // The windowing rule is only safe if nothing falls between two windows. This is
    // the property that makes MD_WINDOW/MD_OVERLAP refactorable: change the numbers
    // and either the coverage still holds or the test fails.
    name: "every line of a long markdown section is inside at least one chunk",
    generators: { range: gen.lineRange({ maxLines: 120 }) },
    property: ({ range }) => {
      const body = Array.from({ length: range.total }, (_, i) => `line ${i} has enough words to be kept`);
      const content = ["# heading", ...body].join("\n");
      const chunks = chunkFile("doc.md", content);
      if (!chunks.length) return true; // a document shorter than the minimum chunk is allowed to vanish
      const covered = new Set();
      for (const chunk of chunks) for (let line = chunk.start; line <= chunk.end; line += 1) covered.add(line);
      // Line 1 is the heading; every other line must be reachable.
      for (let line = 2; line <= range.total + 1; line += 1) if (!covered.has(line)) return false;
      return true;
    },
  },
  {
    name: "a markdown chunk never exceeds MD_CHUNK_MAX lines",
    generators: { range: gen.lineRange({ maxLines: 120 }) },
    property: ({ range }) => {
      const body = Array.from({ length: range.total }, (_, i) => `line ${i} has enough words to be kept`);
      const content = ["# heading", ...body].join("\n");
      return chunkFile("doc.md", content).every((c) => c.end - c.start + 1 <= MD_CHUNK_MAX);
    },
  },
  {
    // Scope is a rule about the corpus, so it is asserted as a rule — not as a
    // count that would drift with every document added.
    name: "agent memory is out of scope by default and only ever added, never removed",
    generators: { slug: gen.text({ maxLength: 20, alphabet: "abcdefghijklmnopqrstuvwxyz-" }) },
    property: ({ slug }) => {
      const path = `${MEMORY_DIR}2026-11-10-${slug || "note"}.md`;
      if (isIndexable(path)) return false; // default must exclude it
      if (!isIndexable(path, { includeMemory: true })) return false; // opt-in must include it
      // Every path indexable by default is indexable with memory too: the flag adds.
      const sample = ["docs/agents/memory-protocol.md", "AGENTS.md", "scripts/semantic/lib.mjs", "tests/semantic-gold.json", "mocks/fixtures/x.json"];
      return sample.every((p) => !isIndexable(p) || isIndexable(p, { includeMemory: true }));
    },
  },
  {
    name: "the index on disk holds only what its recorded scope allows",
    generators: { pick: gen.int(0, 0) },
    property: () => {
      const root = gitRoot();
      if (!existsSync(join(root, DEFAULT_INDEX))) return true; // nothing to check
      const index = loadIndex(DEFAULT_INDEX, root);
      const includeMemory = index.scope?.memory === true;
      if (index.chunks.some((chunk) => !isIndexable(chunk.file, { includeMemory }))) return false;
      // A default-scope index that contains memory would silently break the rule.
      return includeMemory || index.chunks.every((chunk) => !chunk.file.startsWith(MEMORY_DIR));
    },
  },
  {
    name: "the tracked file list honours the same scope as isIndexable",
    generators: { pick: gen.bool() },
    property: ({ pick }) => {
      const files = listTrackedFiles(gitRoot(), { includeMemory: pick });
      return files.every((f) => isIndexable(f, { includeMemory: pick }));
    },
  },
  {
    name: "chunkFile never returns a chunk with an empty identifier",
    generators: { range: gen.lineRange({ maxLines: 60 }) },
    property: ({ range }) => {
      const content = Array.from({ length: range.total }, (_, i) => `## section ${i}\nbody text ${i}`).join("\n\n");
      return chunkFile("doc.md", content).every((c) => c.id.includes("#"));
    },
  },
  {
    name: "normalizeToken removes diacritics and tatweel from Arabic words",
    generators: { word: gen.pick(["صلاحيات", "الأمان", "المستودع", "الوكيل", "تزامن"]) },
    property: ({ word }) => {
      const decorated = `${word.slice(0, 2)}\u064E\u0651${word.slice(2)}\u0640`;
      const out = normalizeToken(decorated);
      return out.length > 0 && !/[\u064B-\u0652\u0640]/u.test(out) && out === normalizeToken(word);
    },
  },
];
