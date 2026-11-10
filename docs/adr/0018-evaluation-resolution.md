# 0018 — An evaluation set that can resolve what it claims

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [retrieval quality](../agents/retrieval-quality.md), [ADR-0009](0009-hybrid-retrieval.md), [ADR-0011](0011-local-reranker-experiment.md), [ADR-0013](0013-opt-in-model-load.md)

## Context

`tests/semantic-gold.json` held 18 cases. Every quality claim in this repository — the hybrid gate, the
reranker rejection, the embedding-dimension choice, the "R@1 0.67 versus a 0.85 goal" framing — was
argued against that number.

At 18 cases **one case is 5.6 points.** Several recorded decisions were differences of one or two
cases, i.e. inside the instrument's own noise. That is not a measurement problem to note in a footnote;
it is a problem that makes the numbers unusable as evidence, and the repository's standing rule is that
a number must be reproducible *and* meaningful, or it must not be quoted.

The same review found a second issue: the 18 cases were written by the author of the ranker, against
the documents the ranker was tuned on. They were not wrong, but they were easy, and nothing measured
how easy.

## Decision

1. **Enlarge the set to 58 bilingual cases** (43 English, 15 Arabic): the 18 original cases untouched,
   plus 40 added one-per-capability, phrased as user questions. Every case carries `origin`
   (`v1`/`v2`) and `lang`, and the eval prints the subsets separately so a change that only helps one
   half cannot hide in the average.
2. **Authoring rules are written down**, not implied: answerable from the listed file(s); not a copy of
   a heading or of another gold query; *both* files listed when two genuinely answer; a failing case is
   added, never deleted.
3. **Report resolution, not just the point estimate.** Every run prints one-case resolution
   (1/58 = 1.7 points) and a seeded, deterministic bootstrap 95% interval for R@1
   (currently `[0.52, 0.76]`). A change smaller than the interval is not a result.
4. **The gate is a ratchet keyed to the new set**: R@1 ≥ 0.60, R@3 ≥ 0.72, MRR ≥ 0.66 — just under the
   measured 0.64 / 0.74 / 0.69. Lowering a floor requires its own ADR, because it is otherwise
   indistinguishable from hiding a regression.
5. **Re-measure the rejected candidates on the larger set** rather than carrying 18-case conclusions
   forward. Eight candidates were re-run; two survived (windowed markdown sections, glossary growth) and
   six lost. The table lives in [`retrieval-quality.md` §3b](../agents/retrieval-quality.md).

## Consequences

- R@1 fell from 0.72 to 0.64 **because the test got harder**, not because the engine regressed. Both
  numbers are reported: `v1` still scores 0.78 on the same engine.
- The `v1`/`v2` gap (0.78 versus 0.58) is the measured size of the author bias that was previously
  only a caveat in a table.
- The 0.85 target (decision D8) is now demonstrably out of reach for this engine: the two changes that
  work move R@1 by 3.4 and 5.2 points, and the interval is ±12. The replacement trigger in
  [`retrieval-quality.md` §8](../agents/retrieval-quality.md) has fired; the neural path stays the
  only honest route to 0.85, and its weights remain unpinned.
- Adding a document still moves the numbers, including this one. The mitigation is that the corpus size
  is printed on every run, not that the drift is denied.

## Rejected alternatives

| Alternative | Why not |
| --- | --- |
| Keep 18 cases and add a caveat | A caveat does not stop the number from being quoted; the interval does |
| Generate 500 synthetic queries | Synthetic queries are generated from the documents, so they measure the generator, not the retrieval |
| Train/test split with weights fitted on the train half | 58 cases cannot support fitting; and fitting to this corpus would be fitting to the test set as soon as it changes |
| Human-curated query log | The right long-term source, and not available in this session. The `origin` field is where it will land |
| Delete the cases that keep failing | Explicitly forbidden: it is the failure mode this ADR exists to prevent |
