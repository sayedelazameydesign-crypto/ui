# Retrieval Quality — Measured, Not Asserted

`docs/agents/semantic-search.md` describes what the index is. This document answers a harder
question: **is it any good, did it get better or worse, and can this measurement even tell?**

A retrieval system without a gold set is an opinion; with one, it is a number CI can enforce. With a
*gold set too small to resolve*, it is a number that flatters itself. Both halves are below.

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
| Bilingual glossary | Arabic query → English document without a translation model | hand-curated, 87 entries |
| Path tokens | `permissions.md` should match "permissions" | index size only |
| Windowed markdown sections | a forty-row permission matrix must not be one chunk | ~10% more chunks |
| `@semantic-ignore` markers | keep glossaries/fixtures from polluting the corpus | none |

## 2. The gold set

[`tests/semantic-gold.json`](../../tests/semantic-gold.json) holds **58 cases** — realistic queries,
43 English and 15 Arabic, each mapped to the file(s) that actually answer it.

| Set | Cases | Origin | Rule |
| --- | --- | --- | --- |
| `v1` | 18 | written when the engine was built | never edited since; kept as the historical reference |
| `v2` | 40 | added 2026-11-10 ([ADR-0018](../adr/0018-evaluation-resolution.md)) | one case per documented capability, phrased as user questions |

Every case carries `origin` (`v1`/`v2`) and `lang`, and the eval prints the subsets separately, so a
change that only helps one half of the corpus cannot hide inside the average.

The authoring rules, stated so they can be checked against the file:

1. the question is answerable *from the listed file(s)*, and a reviewer can point at the lines;
2. the question is not a copy of a heading, a title, or a gold query already in the set;
3. when two files genuinely answer, both are listed — a benchmark that demands one of two correct
   answers measures the author's taste, not retrieval;
4. a failing case is **added**, never deleted. Deleting an inconvenient case is how quality claims rot.

```bash
node scripts/semantic/eval.mjs                 # compare modes, subsets, CI
node scripts/semantic/eval.mjs --timing        # + cost model
node scripts/semantic/eval.mjs --json          # machine-readable
node scripts/semantic/eval.mjs --rebuild       # re-index first
```

## 3. Measured results

Corpus: the repository's own text, 58 bilingual cases (tests, fixtures and generated mirrors excluded —
see §2 of [`semantic-search.md`](semantic-search.md)), and — since [ADR-0021](../adr/0021-index-scope.md) —
**agent memory excluded** unless the index is built with `--with-memory`. Measured, not estimated. The
chunk count moves with every documentation edit, so an exact count here would be stale by the next
commit; the command prints it.

| Mode | R@1 | R@3 | R@5 | MRR | ms/query |
| --- | --- | --- | --- | --- | --- |
| **hybrid** | **0.64** | **0.76** | **0.78** | **0.69** | 1.0 |
| vector only | 0.41 | 0.55 | 0.64 | 0.49 | 0.4 |
| keyword only | 0.47 | 0.69 | 0.79 | 0.60 | 0.4 |

Read the table as a snapshot, and the engine on this corpus family as **R@1 0.62–0.66, R@3 0.74–0.76,
MRR 0.67–0.70**. The spread is corpus size, not code: adding documentation creates documents that
compete with the ones that answer a question, and removing the session notes that used to compete gives
some of that back (below). One case is 1.7 points, so a difference of one case is not a result.

Two corpus changes are recorded here rather than folded into the numbers:

- **The licence and adversarial documentation** (623 → ~688 chunks) cost one case at the time:
  R@1 0.638 → 0.621, MRR 0.691 → 0.674, `answer@budget` 81% → 79%.
- **Agent memory left the index** ([ADR-0021](../adr/0021-index-scope.md)). With memory indexed, notes
  took rank 1 on two gold cases — both wrong — and appeared in the top 5 of ten; the exclusion removes
  both wrong answers. On this corpus R@1 did not move (0.638 both ways, MRR 0.691 → 0.694); an earlier
  snapshot showed +1 case, and that gain did not reproduce, so it is not claimed here.

Subsets, because the average is not the story:

| Subset | Cases | R@1 | R@3 | MRR |
| --- | --- | --- | --- | --- |
| `v1` (original) | 18 | 0.78 | 0.89 | 0.84 |
| `v2` (added) | 40 | 0.58 | 0.70 | 0.63 |
| English | 43 | 0.67 | 0.79 | 0.73 |
| Arabic | 15 | 0.53 | 0.60 | 0.56 |

The original 18 look easy next to the 40 that followed: they were written by the author of the
ranker, on the documents the ranker was built from. That gap is the most useful number in this file.

### 3a. What changed, and what it bought

Each row is one change measured against the previous row, same corpus, same cases.

| Change | R@1 | R@3 | MRR | Kept? |
| --- | --- | --- | --- | --- |
| baseline: v1 chunking, v1 glossary — all 58 cases | 0.552 | 0.690 | 0.625 | — |
| windowed markdown sections (`MD_WINDOW` 16, `MD_OVERLAP` 4) | 0.586 | 0.690 | 0.648 | ✅ |
| + 45 Arabic domain terms in the glossary | **0.638** | **0.759** | **0.699** | ✅ |

Every row is the same corpus and the same 58 cases, so the rows are deltas and not a story about
progress. The two changes together bought **+8.6 points of R@1 and +6.9 of R@3**; §3b is what the
other eight candidates bought.

### 3b. What was tried and rejected

Every one of these looked reasonable on paper. All were measured on the 58 cases at the state above,
so the comparison is fair.

| Candidate | R@1 | R@3 | MRR | Why it lost |
| --- | --- | --- | --- | --- |
| **RRF k=60, equal weights (kept)** | **0.638** | **0.759** | **0.699** | — |
| BM25F: path ×1.5, heading ×1.2 | 0.586 | 0.776 | 0.682 | path/heading tokens are already in the indexed text; boosting them double-counts |
| bigram terms in the keyword index | 0.500 | 0.638 | 0.590 | chunks roughly double in length, and BM25's length normalisation punishes every chunk for it |
| min–max score fusion instead of RRF | 0.603 | 0.724 | 0.672 | cosine over hashed vectors is not comparable to BM25; normalising does not make it so |
| relative list floor (drop < 0.5 × best) | 0.621 | 0.707 | 0.665 | cuts the tail that RRF is there to exploit |
| evidence tie-break (file appearing repeatedly wins ties) | 0.603 | 0.759 | 0.680 | favours files that repeat themselves, not files that answer |
| 512 / 1024 / 2048 embedding dims | 0.667 / 0.722 / 0.556\* | — | — | hash collisions are not the bottleneck; 256 stays |
| lexical reranker (`--rerank`) | 0.500 | 0.724 | 0.620 | see §4a |

\* measured while the set was still 18 cases, i.e. inside the noise band described in §4b — which is
itself the point of that section.

The candidate rows and §3a were measured against the corpus as it stood during the experiment (602
chunks), so they keep three decimals; §3 is the final state *after* these documents were written (618
chunks) and is quoted at two, because the third digit moves whenever a sentence is added. Documentation is
corpus: a table about retrieval moves the retrieval numbers. Both states are reported instead of pretending
the corpus holds still.

## 4. The gate (a ratchet, not a wish)

```bash
node scripts/semantic/eval.mjs --min-r1 0.60 --min-recall 0.72 --min-mrr 0.66   # defaults
```

CI and the guard fail when hybrid drops below R@1 **0.60**, R@3 **0.72** or MRR **0.66** over the 58
cases. Each floor sits just under the measured band (R@1 0.62–0.66 / R@3 0.74–0.76 / MRR 0.67–0.70): high enough to catch a regression, low enough
not to flake when a document changes. The floors are a **ratchet**: they move up with the measurement.
Moving one *down* is a decision that needs an ADR, because it is indistinguishable from hiding a
regression.

## 4a. The reranker that lost (decision D8)

A feature-based reranker (`rerankScore`, top-20 window, weights fixed a priori, never fitted to the
gold set) was measured on the 18-case set in four configurations — 0.56 to 0.67 R@1 against 0.67 for
the plain fused order — and re-measured on all 58 cases:

| Order | R@1 | R@3 | MRR | ms/query |
| --- | --- | --- | --- | --- |
| **fused (default)** | **0.62–0.66** | **0.74–0.76** | **0.67–0.70** | 1.2 |
| fused + lexical rerank (`--rerank`) | 0.500 | 0.724 | 0.618 | 10.2 |

Still a loss, and now a slower one. Lexical features reward passages that *discuss* the topic and
displace passages that *answer* it — exactly the gap a cross-encoder exists to close. It stays off by
default; the negative result is kept in [ADR-0011](../adr/0011-local-reranker-experiment.md).

**Neural reranking is a declared, opt-in path**, not an aspiration
([ADR-0013](../adr/0013-opt-in-model-load.md)): ≤ 100 MiB quantized weights, isolated in `.models/`,
usable only with a human-pinned SHA-256, refused unless `--enable-neural-rerank` is passed. The loader
is implemented and property-tested; the artifact is not installed, so `R@1` stays at **0.64**.
`node scripts/semantic/model.mjs status` prints exactly what is missing, without guessing.

## 4b. What this metric can and cannot resolve

One case in 58 is **1.7 points**. A bootstrap 95% interval for R@1 is:

```
hybrid 95% CI [0.52, 0.76]   (2 000 resamples, seed 20260101, deterministic)
```

So a 2-point "improvement" is noise, and the honest reading of any candidate change is the interval,
not the point estimate. The eval prints the interval and the per-case resolution on every run for
exactly this reason.

This is why the 18-case set was retired as a decision tool: there, one case was **5.6 points**, and
several decisions in this repository's history (reranker blends, embedding dimensions) were argued
over differences of one or two cases — below the resolution of the instrument.

**0.85 (decision D8) is not reachable by tuning this engine.** Two changes that genuinely worked
moved R@1 by 3.4 and 5.2 points; closing the remaining 21 points by hand would take roughly a dozen
such changes, each of which would have to survive a 58-case interval of ±12 points. That is why D8's
target belongs to the neural path (§4a) and why §8's replacement trigger has now fired.

## 5. Known failures, stated plainly

The failures are listed by *class*, because they share causes:

| Class | Example | Cause |
| --- | --- | --- |
| A machine mirror outranks the normative doc | `who is allowed to merge a pull request` → `.agent/capabilities.yaml` | the mirror restates the matrix more compactly; §3b shows "authority prior" ideas made things worse overall |
| A summary doc outranks the topic doc | `durable memory between sessions` → `.agent/memory/README.md` | the summary has the exact phrase; the protocol has the answer |
| Arabic questions land on `README.md` | `كيف أحفظ نسخة من حالة المستودع` | `README.md` is the only substantial Arabic text; direct Arabic↔Arabic BM25 beats a glossary-expanded match |
| The benchmark describes itself | `who may merge…` (ar) → `docs/agents/retrieval-quality.md` | this document names the queries, so it is a near-match for them. It is kept in the corpus on purpose: excluding the document that reports the failures would be the wrong fix |

The exact queries live in the gold set (not here), and every failure above is left unfixed rather than
deleted from the set. Two of them are *not* ranker bugs: they are the corpus being bilingual in one
file and monolingual everywhere else, and a summary existing at all.

## 6. Cost model (assumption-labelled)

`--timing` prints a per-1k-query cost derived from measured milliseconds:

```
cost/1k queries ≈ (ms_per_query / 1000 / 60) × runner_usd_per_minute × 1000
runner_usd_per_minute = 0.008   (GitHub-hosted 2-core list price, 2026 — an assumption)
```

That yields ~**$0.0002 per 1,000 hybrid queries**. It measures *runner time only*: the local provider
has **zero marginal API cost**, which is precisely why it is the default. A hosted embedding provider
would add per-token charges and egress — both deliberately out of scope.

## 7. Honest limits

| Limit | Consequence |
| --- | --- |
| Hashing embeddings, no neural model | no world knowledge, no paraphrase beyond the glossary |
| BM25 with a fixed k1/b | not tuned per document type |
| No cross-encoder reranker | top-3 is decent (0.74), top-1 is 64%; the lexical substitute measurably failed and the neural path has no pinned weights yet (D8) |
| Glossary is hand-curated | Arabic recall is bounded by 87 entries; grow it when a query *class* fails, not when a single case does |
| 58 cases | enough to catch regressions and to state an interval, not enough to resolve 2-point claims |
| Corpus grows with the docs | every added document shifts the numbers — including this one |
| Benchmark contamination is a standing risk | tests/fixtures are excluded from the index; any doc quoting a gold query can still match it |
| Gold set authored by the same agent that wrote the index | possible bias; §3's `v1`/`v2` gap shows it is real, and a human query log would be stronger |
| Numbers are self-referential | the index includes the scripts that compute these numbers, so editing the eval moves the score slightly |

## 8. When to replace this

Adopt a real embedding model (local ONNX) when a reranker or the glossary cannot lift R@1 above ~0.8
on a gold set of 50+ queries. **That trigger has fired**: 58 cases, R@1 0.64, both systematic levers
already spent, and the neural path is declared but unshipped. Until the artifact is pinned, this
engine is a *measured* baseline that knows its own ceiling — not a claim of quality.
The `search(index, query, {mode})` contract and the eval harness stay valid — only `providers` in
`lib.mjs` changes.
