# 0009 — Hybrid retrieval with a measured quality gate

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [retrieval quality](../agents/retrieval-quality.md), [ADR-0006](0006-testing-strategy.md)

## Context

The vector index (ADR-0001 lineage) relied on a single signal: cosine similarity over hashed
embeddings. That signal is good at *topic* and bad at *exact terms* — file names, identifiers,
acronyms — and it is effectively blind across languages: an Arabic query has no lexical path to an
English document.

Two failure modes were observed in practice:

1. Asking "who may merge a pull request" returned a review-tone guideline, not the permission matrix.
2. Every Arabic query landed on Arabic prose in `README.md`, regardless of the actual answer.

Worse, the repository had no way to *know* whether a change improved or degraded retrieval. Quality
was asserted in prose.

## Decision

1. **Two signals, fused by rank.** BM25 (k1 = 1.2, b = 0.75) runs beside vector cosine;
   reciprocal rank fusion (k = 60) combines them without weight tuning. Modes remain selectable
   (`hybrid` default, `vector`, `keyword`) so the choice can be measured rather than assumed.
2. **Index what the user types.** Chunk tokens include the heading and the file path, because
   "permissions" must reach `permissions.md`.
3. **Bilingual query expansion, never document translation.** A hand-curated glossary (~45 Arabic
   terms) expands *queries*; documents stay literal. Fully offline, auditable, and honest about
   being a substitute for a translation model.
4. **Opt-out markers.** `@semantic-ignore` keeps glossaries and fixtures out of the corpus — the
   glossary was otherwise matching Arabic queries against itself.
5. **A gold set and a gate.** `tests/semantic-gold.json` (18 cases, AR + EN) plus
   `scripts/semantic/eval.mjs` computing R@1/R@3/R@5/MRR per mode. CI fails below R@3 0.90 or
   MRR 0.75; the floor is a ratchet that only moves up.

## Consequences

**Positive**
- Measured: R@3 0.67 → 0.94 and MRR 0.62 → 0.81 versus vector-only, at 3.3 ms/query.
- The Arabic experience improves without any network call or model download.
- A future change to ranking must justify itself against numbers, not adjectives.
- Regressions become visible in the same PR that causes them.

**Negative**
- Query cost roughly doubles (1.8 → 3.3 ms per query). Irrelevant against human reading time, real
  against a tight per-request budget.
- The glossary is hand-maintained complexity; it will lag domain vocabulary until a real model lands.
- The gold set is authored by the same agent that wrote the index — a bias risk, mitigated by
  adding every real failure as a case.
- One Arabic case still fails and is documented rather than deleted.

**Neutral**
- The `search(index, query, {mode})` contract is stable; swapping the embedder later does not change
  callers or the eval harness.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| Vector only | Measurably worse (R@3 0.67) and blind to exact identifiers. |
| Keyword only | Better on identifiers, worse on paraphrase; no cross-lingual path at all. |
| Weighted score blending | Needs per-corpus tuning and drifts; RRF is rank-based and stable. |
| Neural cross-encoder reranker | The likely next gain, but requires a model, memory, and egress — deferred. |
| Hosted embeddings | Better semantics, but sends repository text off-machine (see ADR-0010). |

## References

- [`docs/agents/retrieval-quality.md`](../agents/retrieval-quality.md) · `tests/semantic-gold.json`
- `scripts/semantic/lib.mjs` · `scripts/semantic/eval.mjs`
