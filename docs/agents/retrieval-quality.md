# Retrieval Quality — Measured, Not Asserted

`docs/agents/semantic-search.md` describes what the index is. This document answers a harder
question: **is it any good, and did it get better or worse?** A retrieval system without a gold set
is an opinion; with one, it is a number CI can enforce.

## 1. Architecture

```
query ──► tokenize ──► bilingual glossary expansion ──┬──► vector  (hashed embeddings, 256d cosine)
                                                      └──► keyword (BM25, k1=1.2 b=0.75)
                                                              │
                                                    reciprocal rank fusion (k=60)
                                                              │
                                                            top-k
```

| Component | Why | Cost |
| --- | --- | --- |
| Hashed embeddings | semantics without a model download or egress | ~1 ms/query |
| BM25 | exact terms, identifiers, file names — the vector's blind spot | ~1 ms/query |
| RRF fusion | combines two differently-scaled rankings without tuning weights | negligible |
| Bilingual glossary | Arabic query → English document without a translation model | hand-curated, ~45 entries |
| Path tokens | `permissions.md` should match "permissions" | index size only |
| `@semantic-ignore` markers | keep glossaries/fixtures from polluting the corpus | none |

## 2. The gold set

[`tests/semantic-gold.json`](../../tests/semantic-gold.json) holds 18 cases: realistic queries
(Arabic and English) each mapped to the file(s) that actually answer it. It is small on purpose —
a case is added when a **real query fails**, not to inflate a score.

```bash
node scripts/semantic/eval.mjs                 # compare modes
node scripts/semantic/eval.mjs --timing        # + cost model
node scripts/semantic/eval.mjs --json          # machine-readable
```

## 3. Measured results (this commit)

Corpus: 386 chunks from 77 files (tests and fixtures excluded — see §2). Measured, not estimated:

| Mode | R@1 | R@3 | R@5 | MRR | ms/query |
| --- | --- | --- | --- | --- | --- |
| **hybrid** | **0.67** | **0.94** | **0.94** | **0.79** | 3.3 |
| vector only | 0.50 | 0.67 | 0.83 | 0.62 | 1.6 |
| keyword only | 0.50 | 0.83 | 0.94 | 0.66 | 1.5 |

Hybrid is not a slogan here: it moves R@3 from 0.67 → 0.94 and MRR from 0.62 → 0.79 against
vector-only, at roughly 2× the query cost (3.3 ms vs 1.6 ms — both irrelevant next to human reading
time).

The same run also shows the effect of two fixes measured rather than guessed:

- path tokens + glossary expansion: R@3 **0.72 → 0.78**;
- `@semantic-ignore` around the glossary body (it was matching Arabic queries against itself):
  R@3 **0.78 → 0.94**, R@1 **0.44 → 0.67**;
- excluding `tests/` and `mocks/` from the corpus: a benchmark that contains its own queries wins
  its own queries. The gate caught this regression (R@3 fell to 0.83 when the gold set was indexed)
  before any human noticed.

## 4. The gate (a ratchet, not a wish)

```bash
node scripts/semantic/eval.mjs --min-r1 0.65 --min-recall 0.9 --min-mrr 0.75   # defaults
```

CI and the guard fail when hybrid drops below R@1 **0.65**, R@3 **0.90** or MRR **0.75**. Each floor
sits just under the measured value: high enough to catch a regression, low enough not to flake on a
new document. The R@1 floor is a **floor, not a goal** — the goal is 0.85 (decision D8), and raising
this number is the definition of progress. Floors only move up.

## 4a. The reranker that lost (decision D8)

`R@1` 0.67 versus `R@3` 0.94 means the answer is nearly always in the window but often not first. A
feature-based reranker was implemented (`rerankScore`, top-20 window, weights fixed a priori) and
measured in four configurations:

| Blend · weights | R@1 | R@3 | MRR |
| --- | --- | --- | --- |
| **none (fused order)** | **0.67** | **0.94** | **0.79** |
| 0.50 · a-priori | 0.61 | 0.83 | 0.73 |
| 0.70 · a-priori | 0.67 | 0.83 | 0.77 |
| 0.70 · rarity-first | 0.56 | 0.89 | 0.71 |
| 0.85 · rarity-first | 0.61 | 0.89 | 0.76 |

All worse. It is therefore **off by default** (`--rerank` to try it) and the negative result is kept
as evidence in [ADR-0011](../adr/0011-local-reranker-experiment.md). Lexical features reward passages
that *discuss* the topic and displace passages that *answer* it — exactly the gap a semantic
cross-encoder exists to close, and exactly the thing this offline contract cannot download.

## 5. Known failure, stated plainly

One case still fails: the Arabic query asking *who may merge a pull request* ranks
`CONTRIBUTING.md` above `docs/agents/permissions.md`. The glossary expands the merge term, but the
PR-workflow document is lexically closer. The exact query lives in the gold set (not here, and not in
the index) and is left unfixed, because deleting an inconvenient case is how quality claims rot.

## 6. Cost model (assumption-labelled)

`--timing` prints a per-1k-query cost derived from measured milliseconds:

```
cost/1k queries ≈ (ms_per_query / 1000 / 60) × runner_usd_per_minute × 1000
runner_usd_per_minute = 0.008   (GitHub-hosted 2-core list price, 2026 — an assumption)
```

That yields ~**$0.0003 per 1,000 hybrid queries**. It measures *runner time only*: the local
provider has **zero marginal API cost**, which is precisely why it is the default. A hosted
embedding provider would add per-token charges and egress — both deliberately out of scope.

## 7. Honest limits

| Limit | Consequence |
| --- | --- |
| Hashing embeddings, no neural model | no world knowledge, no paraphrase beyond the glossary |
| BM25 with a fixed k1/b | not tuned per document type |
| No cross-encoder reranker | top-5 is good, top-1 is 67%; the lexical substitute measurably failed (D8) |
| Glossary is hand-curated | Arabic recall is bounded by ~45 entries; grow it when a query fails |
| 18 cases | a thin benchmark; broad enough to catch regressions, not to prove excellence |
| Benchmark contamination is a standing risk | tests/fixtures are excluded from the index; any doc quoting a gold query can still match it |
| Gold set authored by the same agent that wrote the index | possible bias; a human-curated query log would be stronger |

## 8. When to replace this

Adopt a real embedding model (local ONNX) when a reranker or glossary cannot lift R@1 above ~0.8 on
a gold set of 50+ human-authored queries. The `search(index, query, {mode})` contract and the eval
harness stay valid — only `providers` in `lib.mjs` changes.
