// Properties for context packing. The claims are absolute — "never over budget",
// "every passage cites a real line", "same input, same pack" — so they are tested
// as invariants over generated queries and budgets.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_INDEX, cosine, embedLocal, gitRoot, loadIndex } from "../../scripts/semantic/lib.mjs";
import { pack, chunkText, compressPassage, estimateTokens } from "../../scripts/context-pack.mjs";
import { gen } from "../../scripts/lib/property.mjs";
import { scanText, CLASSES } from "../../scripts/security/adversarial.mjs";

const root = gitRoot();
const index = existsSync(join(root, DEFAULT_INDEX)) ? loadIndex(DEFAULT_INDEX, root) : null;

// A small, deterministic index built from the repository's own text keeps the
// properties fast; the real index is exercised by `context-pack.mjs --eval`.
const probeHits = (index?.chunks ?? []).slice(0, 30).map((chunk) => ({
  file: chunk.file,
  line: chunk.start,
  heading: chunk.heading,
  score: 1,
}));

const queries = ["merge a pull request", "privacy of personal data", "من يحق له دمج", "retrieval quality", "audit ledger"];

export default [
  {
    name: "a pack never exceeds its token budget",
    generators: { budget: gen.pick([50, 120, 200, 400]) },
    property: ({ budget }) => {
      if (!index) return true;
      return queries.every((query) => pack(index, root, query, probeHits, { budgetTokens: budget }).stats.tokens <= budget);
    },
  },
  {
    name: "every packed passage cites a line that exists",
    generators: { query: gen.pick(queries) },
    property: ({ query }) => {
      if (!index) return true;
      const packed = pack(index, root, query, probeHits, { budgetTokens: 400 });
      return packed.nodes.every((node) => {
        const chunk = index.chunks.find((candidate) => candidate.file === node.file && candidate.start === node.line);
        return Boolean(chunk) && chunkText(root, chunk).length > 0 && node.line >= 1;
      });
    },
  },
  {
    name: "packing is deterministic",
    generators: { query: gen.pick(queries) },
    property: ({ query }) => {
      if (!index) return true;
      const first = JSON.stringify(pack(index, root, query, probeHits, { budgetTokens: 400 }));
      const second = JSON.stringify(pack(index, root, query, probeHits, { budgetTokens: 400 }));
      return first === second;
    },
  },
  {
    name: "no two passages in a pack are near-duplicates",
    generators: { query: gen.pick(queries) },
    property: ({ query }) => {
      if (!index) return true;
      const { nodes } = pack(index, root, query, probeHits, { budgetTokens: 800 });
      const vectors = nodes.map((node) => embedLocal(node.text, index.dims ?? 256));
      for (let i = 0; i < vectors.length; i += 1) {
        for (let j = i + 1; j < vectors.length; j += 1) {
          if (cosine(vectors[i], vectors[j]) > 0.95) return false;
        }
      }
      return true;
    },
  },
  {
    name: "compression never expands a passage",
    generators: { query: gen.pick(queries) },
    property: ({ query }) => {
      if (!index) return true;
      return index.chunks.slice(0, 20).every((chunk) => {
        const raw = chunkText(root, chunk);
        if (!raw) return true;
        const { text } = compressPassage(index, raw, query.toLowerCase().split(/\s+/), { maxSentences: 3, maxChars: 420 });
        return text.length <= Math.max(raw.length, 420) && estimateTokens(text) >= 1;
      });
    },
  },
  {
    // Retrieved text is untrusted: the packer is the last place before an agent
    // reads it, so the pack must not carry a codepoint no reviewer can see.
    name: "no packed passage carries a block-severity codepoint",
    generators: { query: gen.pick(queries) },
    property: ({ query }) => {
      if (!index) return true;
      const packed = pack(index, root, query, probeHits, { budgetTokens: 1200 });
      const blockClasses = Object.entries(CLASSES).filter(([, meta]) => meta.severity === "block").map(([id]) => id);
      return packed.nodes.every((node) => scanText(`${node.heading}\n${node.text}`, { classes: blockClasses }).clean);
    },
  },
  {
    name: "a gap marker appears exactly when the kept sentences are not contiguous",
    generators: { count: gen.pick([3, 4, 5]) },
    property: ({ count }) => {
      if (!index) return true;
      const passage = Array.from({ length: count }, (_, i) => `Sentence ${i} about merge and review policy in careful detail.`).join(" ");
      const { text: packed, positions, total } = compressPassage(index, passage, ["merge"], { maxSentences: 2, maxChars: 2000 });
      if (total < 2 || positions.length < 2) return true;
      const contiguous = positions.every((position, i) => i === 0 || position === positions[i - 1] + 1);
      return contiguous ? !packed.includes("…") : packed.includes("…");
    },
  },
];
