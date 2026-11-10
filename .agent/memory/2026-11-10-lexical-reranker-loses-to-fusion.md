---
date: 2026-11-10
kind: result
confidence: high
sources: [docs/adr/0011-local-reranker-experiment.md, scripts/semantic/lib.mjs, docs/agents/retrieval-quality.md]
---

**Fact.** A feature-based reranker (coverage, IDF-weighted coverage, density, heading, path) rescoring
the top 20 fused candidates was measured in four configurations. All four were **worse** than the
plain RRF order: R@1 0.56–0.67 and R@3 0.83–0.89 against 0.67 / 0.94.

**Why.** Lexical features reward passages that *discuss* the topic (term-dense files like
`CONTRIBUTING.md` and the retrieval skill doc) and push aside the passage that *answers* the query.
No linear combination of lexical signals models "answers it".

**Consequence.** `rerank` defaults to `false`; `--rerank` opts in for future experiments. Do not
re-enable it without beating `R@1 0.667 / R@3 0.944 / MRR 0.787`.

**How to verify.** `node scripts/semantic/eval.mjs` (default) vs `node scripts/semantic/eval.mjs --rerank`.
