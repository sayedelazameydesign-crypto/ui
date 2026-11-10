---
date: 2026-11-10
kind: result
confidence: high
sources: [docs/adr/0022-retrieval-tuning-exhausted.md, docs/agents/retrieval-quality.md, scripts/semantic/lib.mjs]
---

**Fact.** A 27-configuration grid over the markdown chunk window (`MD_WINDOW` 8–32 × `MD_OVERLAP` 0–8)
spans R@1 **0.552–0.690** (σ 0.022) on the same 58 cases. The maximum — window 12, overlap 0 —
fixes 3 cases, breaks 0, and still gives McNemar **p = 0.25**. Its immediate neighbours (`12/1`, `13/0`,
`11/0`) are back at the baseline 0.638: a spike with no plateau.

**Why it matters.** One arbitrary parameter moves the metric by eight cases — more than several changes
this repository previously called wins. Selecting a parameter by the same 58 cases used to score it is
how a benchmark starts agreeing with whoever tuned it.

**Consequence.** The shipped window stays 16/4 (chosen before the grid existed); the negative result is
ADR-0022. Require a *region*, not a point: if ±1 step in the parameter does not hold the gain, it is not
a gain.

**Bonus finding.** `MD_OVERLAP ≥ MD_WINDOW` made the window loop advance by zero and hang until the heap
died. Fixed with `windowStep()` plus a configuration property and the `window-step-zero` mutant.

**How to verify.** `node scripts/mutation-test.mjs` (12/12) · `node scripts/semantic/eval.mjs`.
