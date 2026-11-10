# 0022 — Retrieval tuning is exhausted; ordering is the remaining lever

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [retrieval quality](../agents/retrieval-quality.md), [ADR-0009](0009-hybrid-retrieval.md), [ADR-0011](0011-local-reranker-experiment.md), [ADR-0013](0013-opt-in-model-load.md), [ADR-0018](0018-evaluation-resolution.md), [ADR-0021](0021-index-scope.md)

## Context

Decision **D8** asks for R@1 ≥ 0.85 on the 58-case gold set. When Path B began, the delivered engine
measured **0.638** (37/58) on 681 chunks. After the D8 approval card priced the ONNX path (a 293 MiB runtime to carry a 23 MiB model, and
no licence-clean multilingual weights that ship an ONNX export), the owner chose **Path B first**:
improve the deterministic path — chunk boundaries, folder priority, candidate window — before spending
a dependency on a reranker.

Path B's three levers were measured on the 58 cases, same corpus, same commit, one variable at a time.

| Lever | Result |
| --- | --- |
| **Chunk boundaries** — grid over `MD_WINDOW` 8–32 × `MD_OVERLAP` 0–8 (27 configurations) | R@1 spans **0.552–0.690**. The maximum (`MD_WINDOW` 12 / overlap 0) fixes 3 cases and breaks 0 — but its immediate neighbours (`12/1`, `13/0`, `11/0`) are back at 0.638, and McNemar gives **p = 0.25**. A spike, not a plateau. |
| **Folder / path priority** — already measured in ADR-0009's follow-up as `BM25F: path ×1.5, heading ×1.2` | 0.586 R@1 against 0.638: path and heading tokens are already in the indexed text, so boosting them double-counts. Re-confirmed as a *file-level* variant here: aggregating chunk scores per file (`max` / `top-2` / `sum`) gives 0.638 / 0.586 / 0.310 at 681 chunks (0.621 / 0.586 / 0.310 once this ADR joined the corpus). |
| **Candidate window** — score every gold query against all chunks | R@20 = **0.983 (57/58)**, R@50 = 0.983, R@100 = 1.000. Widening the window buys **zero** cases until rank 100. |

The third row reframes the problem. The answer is already inside the top-20 candidate window for 57 of
58 cases, so the missing 21 points are not lost to recall — they are lost to **ordering**, which is
precisely the job of the cross-encoder that ADR-0011 measured only in its lexical, feature-based form.
An earlier draft of the D8 card quoted **R@5 (0.776)** as the ceiling of a top-20 re-scorer; that was
wrong by 12 cases, and the correction is recorded here and in
[retrieval-quality §3c](../agents/retrieval-quality.md).

The grid also produced an uncomfortable measurement about the instrument: one chunker parameter, moved
inside a defensible range, moves R@1 by **eight cases** (σ = 0.022). That is wider than several changes
this repository once reported as wins.

## Decision

1. **The shipped chunk configuration stays at `MD_WINDOW` 16 / `MD_OVERLAP` 4.** The 12/0 point is not
   adopted: a parameter whose exact value nobody can defend must not be selected by the metric that
   scores it, and a maximum whose neighbours collapse is selection noise.
2. **No file-level aggregation, no path or heading weighting.** Both were measured twice, in two
   different forms, and lost both times. This closes the "authority/path prior" family for this engine.
3. **No candidate-window widening.** R@20 = R@50; the single case beyond rank 20 needs a rank-100
   window to reach and would be a per-case chase.
4. **A bug found by the grid is fixed, not documented around:** `MD_OVERLAP ≥ MD_WINDOW` made the window
   loop advance by zero and hang until the process died. `windowStep()` clamps the step, a property
   asserts the invariant that makes the clamp unreachable in the shipped configuration, and the mutant
   `window-step-zero` proves the property fails when the clamp is removed.
5. **D8 stays pending**, and it is now a *runtime* decision rather than a model decision: with ordering
   identified as the bottleneck, the only remaining lever is a re-scorer, and its price is
   `onnxruntime-node` (307,626,018 bytes unpacked, MIT, 3 dependencies, one `postinstall`) for a 23 MiB
   model. That trade is the owner's to make; nothing is installed by this ADR.
6. **The gate does not move.** R@1 ≥ 0.60 / R@3 ≥ 0.72 / MRR ≥ 0.66 stay exactly where ADR-0018 put them.

## Consequences

- Path B is **closed with evidence**, not abandoned by assertion. The next retrieval change must be an
  ordering mechanism, and it must beat the engine's measured band (R@1 0.62–0.66, MRR 0.67–0.70) at the
  same cost.
- Documentation is corpus: the rows above were measured at 681 chunks and this ADR's own text moved the
  engine to 0.62 / 0.76 / 0.78 / 0.68 (705 chunks). The drop is the documented corpus effect, not a code
  change — the code changed in exactly one place, a clamp on a loop step that cannot alter ranking.
- The honest reading of the metric is narrower than before: parameter-level differences below ~8 cases
  are not resolvable on this corpus with this instrument.
- The engine keeps its zero-dependency property; the 293 MiB runtime question is explicitly *open*, and
  only an owner decision installs it.
- The failure classes in [retrieval-quality §5](../agents/retrieval-quality.md) remain unfixed on
  purpose: they are corpus effects (bilingual corpus, summary-vs-topic documents, a benchmark that
  describes itself), not ranker bugs, and the two fixes attempted against them made the average worse.

## Verification

```bash
node scripts/semantic/eval.mjs                 # 0.62 / 0.76 / 0.78 / 0.68 on 705 chunks, this commit
node scripts/property-test.mjs --only semantic  # window advance, coverage, MD_CHUNK_MAX
node scripts/mutation-test.mjs                  # 12/12 killed, including window-step-zero
node scripts/check-repo.sh                      # retrieval gate unchanged
```
