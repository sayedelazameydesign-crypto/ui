---
date: 2026-11-10
kind: gotcha
confidence: high
sources: [tests/properties/context.mjs, scripts/mutation-test.mjs, docs/agents/context-packing.md]
---

**Fact.** The context-packing properties began with `if (!index) return true;` — a convenience so the
suite would not fail on a fresh clone before `.index/` existed. In a working tree where the index had
not been built, all seven of them passed without packing a single passage.

**Why it matters.** Mutation testing found it, and only mutation testing could: the
`packer-budget-ignored` mutant "survived" because the property that should have caught it never ran its
body. A vacuous pass and a real pass are indistinguishable in the report, and CI's property job does not
build the index, so the guard was silently weaker there too. The mutant that looked like a weak test was
actually a report about a skipped one.

**How to verify.** `node scripts/property-test.mjs --only context` now builds `.index/semantic.json` on
demand and fails loudly if it cannot; `node scripts/mutation-test.mjs` does the same before running any
property mutant, so a missing index can no longer masquerade as a surviving guard. `10/10 mutants killed`.
