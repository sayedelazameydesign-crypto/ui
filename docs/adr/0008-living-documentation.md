# 0008 — Living documentation as a generated, verified artifact

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [living docs](../architecture/living-docs.md), [ADR-0001](0001-agentic-first-baseline.md)

## Context

Architecture diagrams are usually the first artifact to go stale and the last to be trusted. They
are drawn once, in a tool nobody has installed six months later, and then silently describe a system
that no longer exists. Agents make this worse: they read documentation literally and then act on a
structure that was true in a previous life.

The repository already enforces documentation *presence* (guard) and *consistency* of policy files
(ADR discipline). It did not enforce that the **picture of the system matches the system**.

## Decision

Treat the architecture picture as generated output with a drift gate:

- `scripts/architecture-graph.mjs` derives nodes (components) and edges (markdown links, module
  imports) from tracked files, deterministically — no timestamps, sorted output.
- It writes `docs/architecture/graph.md` (Mermaid + tables) and `graph.json` (data).
- `--check` regenerates in memory and compares **byte for byte**; the guard and the `architecture`
  workflow fail when the committed picture is stale.
- Regeneration is manual on a branch. CI never auto-commits documentation, because that would let
  bot output bypass review (`AGENTS.md` §2).

## Consequences

**Positive**
- The diagram cannot silently disagree with the repository — the disagreement is a red check.
- Mermaid-in-markdown renders on GitHub with no build step and diffs meaningfully in review.
- Agents get a cheap, accurate map before reading 50 files (pairs with the semantic index).

**Negative**
- Structural PRs carry a generated-file diff, which reviewers must trust to be mechanical.
- Component granularity is a design choice that needs revisiting as the repository grows.
- The generator is code that must itself be maintained and tested (it has properties).

**Neutral**
- The graph captures static references only; runtime topology is out of scope by construction.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| Hand-drawn diagrams | Accurate for a week, misleading for a year. |
| External diagramming service | Requires an account, exports binary blobs, diffs poorly. |
| Generate at render time (docs site) | Needs a build step and hosting; the repository should be readable as-is. |
| No diagram, rely on the index | Retrieval finds files, not structure; both are useful. |

## References

- [`docs/architecture/living-docs.md`](../architecture/living-docs.md) ·
  [`graph.md`](../architecture/graph.md) · `scripts/architecture-graph.mjs`
