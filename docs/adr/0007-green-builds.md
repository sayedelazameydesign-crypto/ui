# 0007 — Cost- and carbon-aware CI routing

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [green builds](../ci/green-builds.md), [ADR-0005](0005-artifact-storage.md)

## Context

Every workflow run costs money and energy. On a young repository the obvious waste is:

- scanners running on a markdown typo;
- a superseded run continuing after a new push;
- jobs without timeouts that can burn the full default budget;
- caches keyed on time instead of content, so "cache hit" occasionally means "wrong result".

Two constraints shape the response. First, **skips must be provably safe** — a skipped security scan
on a real code change is a vulnerability, not an optimisation. Second, **claims must be measurable**:
"we saved 40% carbon" from a repository with no telemetry would be fiction.

## Decision

1. **Classify, then route.** `scripts/change-classifier.mjs` assigns every changed file exactly one
   class (`docs`, `ci`, `tooling`, `data`, `deps`, `code`) and derives job decisions. Only a proven
   `docs_only` change may skip heavy jobs; anything ambiguous runs.
2. **Cancel superseded runs.** Concurrency groups on every workflow.
3. **Timeout every job**, so a hang is bounded.
4. **Content-addressed caches only**, and never cache `node_modules` directly (policy for when the
   stack lands).
5. **Always-on gates stay always-on**: guard, provenance, and PR hygiene run regardless of class.
6. **Report runner-minutes avoided**, never invented carbon figures.

## Consequences

**Positive**
- Documentation-only pull requests cost a fraction of a full run, with no loss of protection.
- The routing table is a written, testable policy (property-tested for totality and safety).
- The shape is already right when the expensive workloads arrive.

**Negative**
- An extra job step (a few seconds) to compute the classification.
- A misclassification can skip a needed job — mitigated by conservative defaults and tests.
- Complexity in workflows: conditions must be maintained alongside the classifier.

**Neutral**
- Savings are currently small in absolute terms; the value is architectural.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| `paths-ignore` filters only | Blunt: a docs+code PR is still gated, and filters cannot express job-level logic. |
| Always run everything | Simplest, and the honest cost of protecting nothing in particular. |
| Self-hosted low-power runners | Real lever, but needs hardware and a trust model (D6 territory). |
| Cross-repo build cache | Not supported natively by GitHub; requires an external store. |

## References

- [`docs/ci/green-builds.md`](../ci/green-builds.md) · `scripts/change-classifier.mjs` ·
  `.github/workflows/preview.yml`
