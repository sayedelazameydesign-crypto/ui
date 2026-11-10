// Browser-side retrieval engine: the same primitives as the CLI, no build step.
//
// It imports ../scripts/semantic/core.mjs — the canonical tokenizer, hashed
// embedding, glossary, BM25 and term helpers — so the demo cannot drift from the
// engine it demonstrates. What lives here is only the fusion and result shaping.
// Parity with scripts/semantic/lib.mjs is enforced by scripts/playground-parity.mjs.

import {
  embedLocal,
  cosine,
  tokenize,
  expandTokens,
  bm25Scores,
} from "../scripts/semantic/core.mjs";

export const RRF_K = 60;

/** Rebuild the engine's index shape from the exported playground JSON. */
/**
 * Terms are exported as `term tf,term tf`: a flat string keeps the artifact under
 * the 1 MB repository ceiling without losing term frequencies (BM25 needs them).
 */
function decodeTerms(encoded) {
  if (typeof encoded !== "string") throw new Error("unsupported index: terms must be the compact string encoding");
  return encoded ? encoded.split(",").map((pair) => {
    const at = pair.lastIndexOf(" ");
    return [pair.slice(0, at), Number(pair.slice(at + 1))];
  }) : [];
}

export function hydrate(payload) {
  const chunks = payload.chunks.map((chunk) => ({
    file: chunk.f,
    start: chunk.l,
    heading: chunk.h,
    preview: chunk.p,
    length: chunk.n,
    terms: decodeTerms(chunk.t),
    // int8 → float. `atob` yields a binary string, so read char codes first;
    // the 127× scale cancels in a dot product, so ranking is unchanged.
    vector: Int8Array.from(Uint8Array.from(atob(chunk.v), (c) => c.charCodeAt(0)), (b) => (b > 127 ? b - 256 : b)),
  }));
  return {
    dims: payload.dims,
    stats: payload.stats,
    chunks,
  };
}

function ranked(scores) {
  return scores
    .map((score, i) => ({ score, i }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.i);
}

/**
 * @param {"hybrid"|"vector"|"keyword"} mode
 * @returns {Array<{ score:number, file:string, line:number, heading:string, preview:string, vector:number, keyword:number }>}
 */
export function search(index, query, { k = 8, mode = "hybrid" } = {}) {
  const base = tokenize(query);
  const { tokens } = expandTokens(base);
  const queryVector = tokens.length ? embedLocal(tokens, index.dims) : new Array(index.dims).fill(0);

  const vectorScores = index.chunks.map((chunk) => (chunk.vector ? cosine(queryVector, chunk.vector) : 0));
  const keywordScores = bm25Scores(index, tokens);

  const vectorRank = ranked(vectorScores);
  const keywordRank = ranked(keywordScores);

  let fused;
  if (mode === "vector") fused = vectorRank.map((i) => ({ i, score: vectorScores[i] }));
  else if (mode === "keyword") fused = keywordRank.map((i) => ({ i, score: keywordScores[i] }));
  else {
    const rrf = new Map();
    const bump = (list) => list.forEach((chunkIndex, rank) => rrf.set(chunkIndex, (rrf.get(chunkIndex) ?? 0) + 1 / (RRF_K + rank + 1)));
    bump(vectorRank);
    bump(keywordRank);
    fused = [...rrf.entries()].map(([i, score]) => ({ i, score })).sort((a, b) => b.score - a.score || a.i - b.i);
  }

  const top = fused.slice(0, k);
  const max = top[0]?.score || 1;
  return top.map(({ i, score }) => {
    const chunk = index.chunks[i];
    return {
      score: Number((score / max).toFixed(4)),
      vector: Number(vectorScores[i].toFixed(4)),
      keyword: Number(keywordScores[i].toFixed(2)),
      file: chunk.file,
      line: chunk.start,
      heading: chunk.heading,
      preview: chunk.preview,
    };
  });
}
