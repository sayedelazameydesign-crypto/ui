# 0011 — A local reranker was attempted, measured, and left off

- **Status:** accepted (negative result recorded)
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [ADR-0009](0009-hybrid-retrieval.md), [retrieval quality](../agents/retrieval-quality.md), decision **D8**

## Context

`R@1` sits at **0.67** while `R@3` is **0.94**: the right document is almost always in the window, but
it is not first. The obvious fix is a cross-encoder reranker — score each query–passage pair jointly.

A neural cross-encoder needs weights (50–500 MB) and a runtime, downloaded on first use. This
repository's retrieval contract is offline, deterministic, and zero-egress (ADR-0009, ADR-0010), so
downloading weights is not a neutral technical choice: it is a dependency, a network destination, and
a supply-chain surface.

The hypothesis: lexical **and structural** features — the signals a cross-encoder would learn anyway —
might recover enough of the gain to justify keeping the contract intact.

## Decision

**Implemented and measured, not merged into the default path.** A feature-based reranker
(`rerankScore` in `scripts/semantic/lib.mjs`, weights fixed *a priori*) rescoring the top 20
candidates, blended with the fused rank.

Four configurations were run against the same 18 gold cases and the same index:

| Blend · weights | R@1 | R@3 | MRR |
| --- | --- | --- | --- |
| **none (fused order)** | **0.67** | **0.94** | **0.79** |
| 0.50 · a-priori | 0.61 | 0.83 | 0.73 |
| 0.70 · a-priori | 0.67 | 0.83 | 0.77 |
| 0.70 · rarity-first | 0.56 | 0.89 | 0.71 |
| 0.85 · rarity-first | 0.61 | 0.89 | 0.76 |

**Every configuration is worse than doing nothing.** The reranker is therefore `rerank: false` by
default, available only via `--rerank` / `search(..., { rerank: true })`, and the eval harness prints
which mode is active. Weights are documented in the source so a future attempt can argue with them.

## Why the experiment failed

Lexical features measure *"does this passage talk about the query"*, while the question is *"does this
passage answer it"*. On this corpus the two conflict: `CONTRIBUTING.md` and
`.claude/skills/semantic-retrieval/SKILL.md` are dense with retrieval vocabulary and win on coverage,
displacing the document that actually resolves the question. Term density is the wrong proxy for
relevance, and no linear combination of lexical features fixes that.

Choosing weights on the gold set would have been training on the test set, so they were fixed a
priori — which is, honestly, the weakest part of the comparison. A dev/test split (12/6) was
considered and rejected as too noisy at this sample size to be better than an honest "no".

## Consequences

**Positive**
- The negative result is now evidence, not folklore: nobody re-proposes lexical reranking without
  seeing these numbers.
- `R@1 ≥ 0.65` is enforced by the gate, so the *floor* cannot silently drop while the goal (0.85) is
  pursued.
- The reranking seam (`rerank`, `rerankTop`, `RERANK_BLEND`) exists and is exercised, so replacing the
  scorer with a real cross-encoder is a local change, not a redesign.

**Negative**
- `R@1` stays at 0.67, below the 0.85 target. **D8 remains open.**
- ~2× query cost when the flag is enabled (feature scoring per candidate).
- The repo now carries code that is off by default and must be explained by this ADR.

**Neutral**
- The eval harness gained `--rerank`, which makes any future reranker measurable in one command.

## What would actually move R@1

| Path | Cost | Trade-off |
| --- | --- | --- |
| Local ONNX cross-encoder (e.g. a small multilingual reranker) | ~50–200 MB weights, ONNX runtime | breaks "no download" — needs an explicit, declared egress exception and a cache directory |
| Fine-tune a tiny ranking model on synthetic pairs | training infrastructure, GPU time | no external weights, but needs a data pipeline and evaluation discipline |
| Bigger/better gold set + query log | human effort | does not raise R@1 by itself, but makes every later claim trustworthy |
| Caller-side disambiguation (show 3, ask which) | UI, which does not exist yet | shifts the work to the user |

Recommendation: adopt the ONNX cross-encoder **when** a declared model cache and egress exception
exist (D8 + D9 together), and keep the gold set growing until then.

## References

- `scripts/semantic/lib.mjs` (`rerankScore`, `RERANK_WEIGHTS`) · `scripts/semantic/eval.mjs --rerank`
- [`docs/agents/retrieval-quality.md`](../agents/retrieval-quality.md)
