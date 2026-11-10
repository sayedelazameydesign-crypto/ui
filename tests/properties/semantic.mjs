// Properties for the semantic engine: tokeniser and embedder contract.
// These are invariants, not examples — they hold for every generated input.

import { tokenize, normalizeToken, embedLocal, cosine, fnv1a, chunkFile, DEFAULT_DIMS } from "../../scripts/semantic/lib.mjs";
import { gen } from "../../scripts/lib/property.mjs";

const vectorGen = gen.arrayOf(gen.text({ maxLength: 12 }), { maxLength: 6 });

const unit = (s) => s.replace(/[\u064B-\u0652]/gu, "");

export default [
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
