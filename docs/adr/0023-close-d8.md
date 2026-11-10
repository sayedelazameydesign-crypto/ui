# 0023 — D8 is closed: R@1 0.85 is not reachable under the local constraints

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Closes:** decision **D8** (neural cross-encoder reranker for R@1 ≥ 0.85)
- **Related:** [retrieval quality](../agents/retrieval-quality.md), [D8 card](../agents/d8-onnx-card.md), [local model policy](../agents/local-model.md), [ADR-0011](0011-local-reranker-experiment.md), [ADR-0013](0013-opt-in-model-load.md), [ADR-0018](0018-evaluation-resolution.md), [ADR-0022](0022-retrieval-tuning-exhausted.md)

## Context

D8 asked for one number: **R@1 ≥ 0.85** on the 58-case bilingual gold set. Measured when this decision
was taken, the engine read **R@1 0.621 · R@3 0.759 · MRR 0.682** (36/44/58 cases, 705 chunks, scope
`docs`); 0.85 is 50 of 58, so the gap is 14 cases. Writing this ADR moved the corpus again — see the
margin note in Consequences.

Three lines of evidence now close the question rather than postpone it:

1. **Tuning is exhausted.** [ADR-0022](0022-retrieval-tuning-exhausted.md) measured Path B's three levers
   on the same 58 cases: a 27-configuration chunk-window grid (R@1 0.552–0.690, no plateau), file-level
   aggregation (0.638 / 0.586 / 0.310), and window widening (R@20 = R@50 = 0.983 — no gain). Chunk-boundary
   placement alone moves the metric by eight cases, which is wider than the effects being chased.
2. **The residual is ordering, and the ordering lever is priced out.** The answer is already inside the
   top-20 for 57 of 58 cases, so rank-1 accuracy can only be recovered by a re-scorer. The cheapest
   credible re-scorer is a 23 MB int8 ONNX model carried by a **307,626,018-byte** runtime
   (`onnxruntime-node@1.31.1`, MIT, 3 direct dependencies, one `postinstall` that extracts native
   binaries) — **13× the model**, and 2.9× the weight ceiling that governs the artifact.
3. **No licence-clean, size-compliant, multilingual artifact exists.** The only multilingual cross-encoder
   that publishes an int8 ONNX is **CC-BY-NC-4.0** (non-commercial) — disqualified. The Apache-2.0
   multilingual candidates (306 M and 568 M parameters) **ship no ONNX at all** and exceed the 100 MiB
   ceiling by 3× to 6× even quantized. What remains inside the constraints is **English-only**, which
   would serve 43 cases and leave the 15 Arabic cases unreranked.

The [D8 card](../agents/d8-onnx-card.md) records the full pricing, including the correction that a top-20
re-scorer is bounded by R@20 (0.983), not by R@5 (0.776).

## Decision

1. **D8 is closed as a numeric target** — permanently, under the constraints in force: local and offline,
   artifacts ≤ 100 MiB, licence-clean for commercial use, and no loss of parity between English and
   Arabic. 0.85 is recorded as **not reachable** by this engine in this repository as it stands, not as
   "pending".
2. **The measured band plus the gate floors are the standard.**
   R@1 ≥ **0.60** · R@3 ≥ **0.72** · MRR ≥ **0.66** (ADR-0018), against a measured band of
   R@1 0.62–0.66 · R@3 0.74–0.76 · MRR 0.67–0.70. The floors ratchet **up** only; lowering one still
   requires its own ADR.
3. **Language parity is a constraint, not a preference.** An English-only re-scorer is **rejected** even
   though it is technically purchasable: improving 43 cases while leaving 15 unserved is a parity break,
   and a system that is measurably better in one language teaches its users to trust it less in the other.
4. **The neural path stays declared and dormant.** [ADR-0013](0013-opt-in-model-load.md)'s loader and
   policy are unchanged and still property-tested; `models.manifest.json` keeps its unpinned entry, which
   the loader refuses. No work is planned, no artifact is installed, no dependency is added.
5. **Reopening needs a new constraint, not a new attempt.** Reopen only if all of the following hold:
   a licence-clean cross-encoder that covers English **and** Arabic, an ONNX export **from the author**,
   quantized weights ≤ 100 MiB, and a runtime whose unpacked size is a small fraction of the weights
   (target ≤ 25 MiB, e.g. a WASM runtime of that order) — measured, pinned, and gated by the
   [card's §7](../agents/d8-onnx-card.md) protocol. A new tuning sweep does not qualify.

## Consequences

- **Corpus drift is now the binding risk, and the margin is one case.** This ADR's own text moved the
  measurement from 0.621 to **0.603** (35/58, 713 chunks: the `unicode-arabic` case now lands on this
  document, and `generated-files` shifted with the fusion statistics). The floor is 0.60, so the gate
  passes with **one case of headroom**. Documentation is corpus; that is not new (§3 of the retrieval
  quality doc), but the ratchet has reached the point where it is the thing to watch.
- **Corpus hygiene rule (new, and the reason a red gate must not be "fixed" by lowering a floor):** a new
  document should not *restate* the vocabulary of a query class it does not answer. Link to
  `retrieval-quality.md` instead of repeating the retrieval terms — and when the guard fails after a
  documentation change, the question is "which document now competes with the answer?", not "which
  threshold can move?".
- The zero-dependency property holds. `check-repo.sh`, `eval.mjs`, the playground and the guard stay
  dependency-free and deterministic, and retrieval keeps its ~1.5 ms/query budget.
- Reports state the **band and the floors**, never a target that cannot be met: `AGENTS.md`, `README.md`,
  `retrieval-quality.md`, the card and the eval's own header comment are updated by this ADR.
- The 22 non-rank-1 cases remain documented by failure *class* (§5 of the retrieval quality doc) instead
  of being pursued one at a time.
- If the constraints change (a runtime budget, a commercially licensed multilingual encoder, an
  author-published multilingual ONNX), the work resumes from the card's measurement design — with the
  pre-registered thresholds, not from a fresh grid search.
- **What this ADR does not say:** that 0.62 is good. It says that going higher costs a dependency this
  repository has decided not to carry, and that saying so is more useful than leaving D8 open forever.

## Verification

```bash
node scripts/semantic/eval.mjs        # this commit: 0.60 / 0.76 / 0.78 / 0.67 · 713 chunks
                                      # the run prints the exact numbers; one case = 1.7 points
node scripts/semantic/eval.mjs --json # bySet/byLang + bootstrap interval
node scripts/semantic/model.mjs status  # declares the neural path, refuses it: unpinned
bash scripts/check-repo.sh             # gate enforced at 0.60 / 0.72 / 0.66
```
