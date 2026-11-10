---
date: 2026-11-10
kind: gotcha
confidence: high
sources: [docs/adr/0021-index-scope.md, scripts/semantic/lib.mjs, tests/semantic-gold.json]
---

**Fact.** Excluding `.agent/memory/` from the semantic index was proposed on a measurement: R@1 0.621 →
0.638 and MRR 0.674 → 0.685 on the 58-case gold set, i.e. +1 case. On the corpus as it stood a day
later — after the licence and adversarial documentation landed — the same experiment gives R@1 0.638 in
*both* scopes and MRR 0.691 → 0.694. The gain had closed to +0.002, inside one case.

**Why it matters.** The decision was still right, but not for the reason originally quoted. What
reproduces is the mechanism, not the metric: with memory indexed, a memory note took **rank 1 on two
gold cases — both wrong** — and appeared in the **top 5 of ten**. Those two wrong answers disappear when
the scope excludes memory. That is a stable, checkable claim; "+1 case" was a snapshot of a moving
corpus being mistaken for a property of the change.

**How to verify.** `node scripts/semantic/eval.mjs --rebuild --with-memory --index .index/with-memory.json`
against `node scripts/semantic/eval.mjs`, then count memory chunks in the top 5 per case. The scope rule
itself is asserted three ways: the `isIndexable` properties, the guard's scope check, and the
`memory-indexed-by-default` mutant. `11/11 mutants killed`.
