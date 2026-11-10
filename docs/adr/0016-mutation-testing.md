# 0016 — Mutation testing for the guards

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [ADR-0006](0006-testing-strategy.md), [ADR-0010](0010-fail-closed-boundaries.md), [ADR-0012](0012-pii-dlp-guard.md), [ADR-0015](0015-state-snapshots-and-ledger.md)

## Context

This repository's most load-bearing code is not the search engine; it is the **guards** — closed schema
validation, PII masking, the egress allowlist, the ledger's tamper evidence, BM25 weighting. A test suite
that reports 44 properties passing proves those tests run, not that they *can fail*. A guard test that
passes no matter what the guard does is worse than no test: it certifies nothing while looking like
assurance.

## Decision

1. **Inject one defect at a time into a guard, and require the suite to notice.**
   `scripts/mutation-test.mjs` rewrites a single expression per mutant, runs the targeted detector, and
   compares behaviour with the unmutated baseline.
2. **Baseline before mutant.** The detector must *hold* on pristine code before mutation; otherwise
   "the mutant was caught" cannot be distinguished from "the suite was already broken". A broken
   baseline is reported as a stale/broken mutant, not a pass.
3. **The mutant set targets the claims, not the lines.** Each mutant names the protection it disables:
   closed-object validation, PII masking, ledger tamper evidence, BM25 IDF weighting.
4. **Restore is verified.** Every file is restored from an in-memory copy in `finally`, and the restored
   SHA-256 is compared with the original; a failed restore aborts with exit 3 rather than leaving a
   mutated tree behind.
5. **The guard runs `--quick`.** Two fast mutants on every `check-repo.sh`; the full set (including the
   forged-ledger probe) runs in CI and on demand.

## Consequences

**Positive**
- The guards' claims now have adversarial evidence: **4/4 mutants killed**, each with the exact failing
  assertion quoted.
- The forged-ledger detector contains two independent forgeries (edited entry, removed entry) precisely
  because a single one could be caught by a single check — the fixture grew out of a surviving mutant.
- Writing mutants exposed a real ambiguity in the harness's own verdict logic (detector polarity),
  which the baseline rule fixed.

**Negative**
- Each mutant pins a source string; refactors can invalidate them. A stale mutant fails the run with
  "update the mutant, do not delete it" — annoying by design, because silently dropping a mutant lowers
  coverage without changing any number.
- Runtime is seconds per mutant, not milliseconds; the full set is not free in a tight loop.
- Four mutants is a start, not coverage: the guards have more branches than that.

**Neutral**
- The harness is dependency-free and works on any file, so mutants can cover non-guard code later.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Coverage percentage | Measures execution, not detection; a fully covered guard can still be inert. |
| Stryker / StrykerJS | Real mutation testing, but adds a dependency, a config, and a build step for four mutants. |
| Manual "try breaking it" discipline | Not repeatable and not enforced; this session alone shows how easy it is to trust a green suite. |
| Property tests only | Already in place — and one of them (`postings ≡ naive reference`) is what kills the BM25 mutant. Mutation testing tells you whether the properties are load-bearing. |

## References

- `scripts/mutation-test.mjs` · `scripts/check-repo.sh` §13 · `tests/properties/*`
