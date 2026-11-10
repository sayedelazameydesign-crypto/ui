# 0006 — Property-based properties and deterministic mocks

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [testing strategy](../ci/testing-strategy.md), [ADR-0001](0001-agentic-first-baseline.md)

## Context

Two failures keep recurring in AI-assisted repositories:

1. **Example bias.** Tests are written from the same mental model as the code, so they confirm it
   rather than challenge it. Edge cases — empty input, Arabic diacritics, off-by-one — slip through.
2. **Network coupling.** Tests reach real services (or a paid model endpoint) because mocking "takes
   effort". They then fail for reasons unrelated to the change, and leak data in the process.

The repository has no test framework, deliberately (ADR-0002), and adding one as a dependency just
to test three small modules is disproportionate.

## Decision

Ship two zero-dependency tools:

1. **`scripts/property-test.mjs`** — seeded (`mulberry32`), shrinking, generator-based property
   runner; properties live in `tests/properties/*.mjs` and assert invariants, not examples.
2. **`scripts/mock-server.mjs`** — deterministic HTTP mock bound to `127.0.0.1`, serving static
   fixtures, with query-based fault injection (`?status=`, `?delay=`).

Both run locally and in CI with no installs, no keys, and no egress. CI runs the property suite on
every pull request that touches tooling, code, or dependencies.

## Consequences

**Positive**
- The first run found a genuine bug: `chunkMarkdown` numbered heading-less documents from line 0.
- Failures are reproducible exactly: `--seed` replays the run, shrinking prints a minimal input.
- No framework, no lockfile churn, no supply-chain surface added to test the supply chain.
- Contract-level testing of HTTP clients is possible before any client exists.

**Negative**
- Generators must be written by hand; a poor generator produces weak properties (garbage in).
- Property tests prove invariants, not intent — a wrong invariant is confidently wrong.
- No coverage metric. On a repository this size that is acceptable; vanity coverage is worse.
- The runner is not parallel and has no watch mode; it is a few seconds, not a few minutes.

**Neutral**
- When a UI framework lands, Playwright/axe are complementary: properties for logic, browsers for
  rendering and accessibility.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| Fast-check + Vitest | Excellent, but adds a dependency tree to test dependency-free code; revisit with the stack. |
| Example-based tests only | Cheaper to write, weaker at exactly the cases that broke here. |
| Contract tests against real services | Network, credentials, flakiness, and data leakage. |
| Record/replay (VCR) | Useful for HTTP clients; overkill before one exists. |

## References

- [`docs/ci/testing-strategy.md`](../ci/testing-strategy.md) · `tests/properties/` · `mocks/fixtures/`
