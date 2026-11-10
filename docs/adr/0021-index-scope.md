# 0021 — Agent memory is not repository knowledge

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [semantic search](../agents/semantic-search.md), [memory protocol](../agents/memory-protocol.md), [retrieval quality](../agents/retrieval-quality.md), [ADR-0009](0009-hybrid-retrieval.md), [ADR-0018](0018-evaluation-resolution.md)

## Context

`scripts/semantic/lib.mjs` indexed every tracked text file except `tests/`, `mocks/`, generated
mirrors, and `.agent/tasks/`. That made `.agent/memory/` part of the retrieval corpus: notes about
*sessions* were competing with documents about the *repository*.

The failure is easy to see once named. A note titled "generated files must be regenerated" is
lexically and semantically very close to *"what does `check-repo.sh` check?"* — so it can outrank the
guard script itself. Measured on the 58-case gold set (2026-11-10): with memory indexed, memory notes
held **rank 1 on two cases, both wrong** (`memory` → `.agent/memory/README.md` instead of
`docs/agents/memory-protocol.md`; `guard-checks` → a memory note instead of `scripts/check-repo.sh`),
and appeared in the **top 5 of ten** cases.

Memory is also a growing, self-authored corpus: every session can add a file that changes what the
benchmark retrieves. A documented corpus that grows with the work described in it is a measurement
that drifts by design.

## Decision

1. **`.agent/memory/` is out of the default index scope.** `isIndexable(path)` is the rule, it is pure,
   and it is asserted by properties rather than by a count.
2. **`--with-memory` restores the old behaviour** — `cli.mjs index --with-memory`, and
   `eval.mjs --rebuild --with-memory --index <path>` for an A/B measurement.
3. **The scope is recorded in the index** (`scope: { memory, label }`), printed by `eval.mjs`, and
   checked by `check-repo.sh`, so a hand-built index cannot silently disagree with the policy.
4. **Nothing is deleted or hidden.** The notes remain tracked files, readable by agents and humans;
   only the *default retrieval corpus* changes, and one flag brings the old corpus back.
5. **A mutant proves the rule can fail** (`memory-indexed-by-default`, killed by the scope properties).

## Measurements, including the one that did not reproduce

| Corpus | R@1 | R@3 | MRR | Memory at rank 1 (wrong) | Memory in top 5 |
| --- | --- | --- | --- | --- | --- |
| `docs+memory` | 0.638 | 0.741 | 0.691 | 2 of 58 | 10 of 58 |
| `docs` (default) | 0.638 | 0.741 | 0.694 | 0 | 0 |

**Be precise about this: on the corpus as it stands, the R@1 gain is zero.** An earlier snapshot of
the same experiment (before the licence and adversarial documentation landed) showed R@1 0.621 → 0.638
and MRR 0.674 → 0.685, i.e. +1 case; on today's corpus that difference has closed to +0.003 MRR, which
is inside one case. A change to the corpus does not stop being correct because its effect is smaller
than the instrument's resolution, but it does stop being an *improvement claim* — so the justification
recorded here is scope correctness and the removal of two demonstrably wrong rank-1 answers, not a
number that happened to move once.

## Consequences

**Good.** Documentation no longer competes with session notes; the demo, the gate, and the CLI all
describe the same corpus; the index is ~3% smaller; and the rule is enforced from three directions
(property, guard, mutant) instead of living in a comment.

**Costs and limits.**

- Semantic search no longer returns memory notes by default. An agent that wants them must rebuild the
  index with `--with-memory`; there is one index on disk, so the two scopes are not searchable
  simultaneously. That is deliberate — a single index means "what you searched is what was built".
- The 10-of-58 pollution figure is a measurement, not a proof of future behaviour: a future memory note
  could be genuinely useful for retrieval, and it will be invisible until someone opts in.
- If memory later becomes a curated, stable knowledge base (rather than dated session notes), the right
  answer is probably a separate index with its own scope, not a flag on this one.

**Rejected.** Keeping both corpora in one index and filtering memory out of the results after fusion
(changes the ranking without measuring the change); demoting memory by a path score (the authority
weighting rejected in ADR-0009 — a heuristic multiplier that hides a corpus problem); pruning the
notes instead (deletes knowledge to fix a retrieval scope); excluding memory by editing the gold set
(moves the goalposts instead of the corpus).
