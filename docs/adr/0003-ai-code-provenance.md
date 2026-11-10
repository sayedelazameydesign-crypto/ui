# 0003 — Trailer-based AI code provenance

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [ADR-0001](0001-agentic-first-baseline.md), [provenance policy](../agents/provenance.md)

## Context

Agents now write a material share of this repository. `git blame` answers *which commit* touched a
line, not *whether a human or a model* wrote it. That distinction matters for three reasons:

1. **Accountability.** "A human reviewed this" must be verifiable, not assumed.
2. **Measurement.** Without data, claims about AI output share are anecdotes.
3. **Licensing exposure.** Model output may resemble training data; knowing which code is
   AI-generated scopes any future licence investigation.

Options considered: full cryptographic signing of every commit, GitHub-native attestations, plain
`Co-authored-by:` trailers, or no attribution at all.

Full signing is strong but heavy: keys must be provisioned for humans *and* agents, and it says
nothing about *which* model was involved. `Co-authored-by:` alone conflates "assisted" with
"co-authored" and is already widely abused. No attribution is indefensible in a repository that
explicitly invites agents to commit.

## Decision

Adopt **declarative authorship trailers**, one per commit, verified in CI:

- `AI-Assisted-By: <tool>` (+ optional `Model: <id>`) for agent-produced changes.
- `Human-Authored: true` for changes written with no model involved.
- `Human-Reviewed-By: @handle` required on AI commits **before merge**; CI warns while the PR
  is open rather than failing the agent that opened it.
- `Signed-off-by:` (DCO) available via `--require-dco` when a stricter regime is wanted.

Enforcement:

| Layer | Mechanism |
| --- | --- |
| Local | `scripts/git-hooks/commit-msg` warns/reminds; `node scripts/provenance.mjs` on demand |
| CI | `.github/workflows/provenance.yml` runs `--strict`, uploads `provenance.json` |
| History | Baseline = the commit that introduced the policy; earlier commits are grandfathered |

Attribution is **declarative, not cryptographic**. That is a deliberate, documented trade-off.

## Consequences

**Positive**
- One command produces an auditable AI/human split per PR and per release.
- No key provisioning, no new dependency, no network call.
- Review becomes the stated control for AI code, which matches how the risk actually behaves.
- Grandfathering means adoption required zero history rewriting.

**Negative**
- Trailers are statements; a motivated author can misdeclare them. Review and code ownership are
  the real controls.
- Squash merges flatten per-commit trailers — the merge body must aggregate them.
- One more thing for contributors to remember (mitigated by the local hook and clear failures).

**Neutral**
- Upgrading later to signed commits or GitHub artifact attestations is additive: the trailer
  schema and the JSON report stay valid.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| Mandatory GPG/SSH signing for all commits | Strongest, but agent key custody is unsolved and it does not identify the model. |
| GitHub artifact attestations (`actions/attest`) | Excellent for build provenance; orthogonal to authorship, and needs a real build. |
| `Co-authored-by:` only | Conflates roles and is already unreliable in the wild. |
| Commit-message prefixes (`[AI]`) | Breaks Conventional Commits parsing and pollutes subject lines. |

## References

- [docs/agents/provenance.md](../agents/provenance.md) — the operational policy
- `scripts/provenance.mjs` — implementation and JSON report
- [ADR-0004](0004-zero-trust-dependencies.md) — licence and dependency side of supply chain
