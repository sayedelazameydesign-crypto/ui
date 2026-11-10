---
date: 2026-11-10
kind: gotcha
confidence: high
sources: [docs/adr/0016-mutation-testing.md, scripts/mutation-test.mjs]
---

**Fact.** A mutation harness without a baseline is meaningless: if the detector is already broken, "the
mutant was caught" is indistinguishable from "the suite never worked". `mutation-test.mjs` therefore runs
each detector on **pristine code first** and only then mutates; a failing baseline is reported as
`broken-baseline`, not a pass.

**Second finding.** The first forged-ledger forgery (one edited entry) was caught by one check, so
disabling that check made the mutant survive. The fixture now carries two independent forgeries
(edited entry, removed entry) — a surviving mutant is a signal to strengthen the test, not the mutant.

**How to verify.** `node scripts/mutation-test.mjs` → 4/4 killed, with the failing assertion quoted.
