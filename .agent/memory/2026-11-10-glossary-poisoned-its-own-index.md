---
date: 2026-11-10
kind: gotcha
confidence: high
sources: [docs/agents/retrieval-quality.md, scripts/semantic/lib.mjs, tests/semantic-gold.json]
---

**Fact.** The bilingual glossary initially lived inside `scripts/semantic/lib.mjs`, which is an
indexed file — so every Arabic query matched that file's own Arabic keys and outranked the documents
that actually answered it.

**Why it matters.** A corpus that contains the query-expansion table will win its own queries.
Fix: wrap non-indexable regions in `@semantic-ignore-begin` / `@semantic-ignore-finish`, and prove
the fix with the eval gate rather than by eye (R@3 0.78 → 0.94, R@1 0.44 → 0.67).

**How to verify.** `node scripts/semantic/eval.mjs` — hybrid must report R@3 ≥ 0.90 and MRR ≥ 0.75,
and `node scripts/property-test.mjs --only boundaries` must stay green.
