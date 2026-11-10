# 0004 — Zero-trust dependency engine

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [ADR-0002](0002-defer-stack-choice.md), [SECURITY.md](../../SECURITY.md)

## Context

A dependency is third-party code that runs with this repository's privileges — at install time
(`postinstall`), at build time, and in CI. The classic posture (monthly advisory emails, manual
bumps) reacts late: by the time an advisory lands, the vulnerable version has been installed on
every machine and in every branch.

The 2026 posture treats dependencies as **untrusted input** and evaluates them *when they arrive*,
with controls that run without network access so they can never themselves become a supply-chain
risk.

At L0 there is no `package.json`. The engine must therefore be useful now (workflow pinning,
lockfile hygiene, licence policy) and ready later (manifest analysis), without pretending to have
data it does not have.

## Decision

Adopt four controls, all deterministic and offline:

1. **`scripts/dependency-audit.mjs`** — repository-level supply-chain checks on every run:
   - floating versions (`*`, `latest`), ranged runtime deps, non-registry sources;
   - lifecycle install hooks (`preinstall` / `install` / `postinstall` / `prepare`);
   - missing `engines.node`, missing or non-permissive `license`;
   - missing committed lockfile;
   - **workflow pinning**: `uses:` refs must be a tag or full SHA, never `master`/`main`;
   - `pull_request_target` and implicit token scope are high-severity findings;
   - jobs without `timeout-minutes`.
2. **`scripts/dead-code-report.mjs`** — flags code files nothing references, so weight can be
   removed deliberately. Advisory by design: heuristics under-report, they do not prove.
3. **Dependabot** — weekly, grouped, for Actions and (later) the package ecosystem, so updates
   arrive as reviewable PRs rather than surprises.
4. **Licence compliance** — `.github/workflows/license-compliance.yml` runs `licensee` and, once a
   manifest exists, `dependency-review-action` which fails on copyleft licences and known-vulnerable
   additions.

A **blocking** secret scan (Trivy) and the guard's own secret patterns complete the perimeter.

## Consequences

**Positive**
- Risky patterns (movable action refs, install hooks, floating versions) fail before merge, not
  after an incident.
- Everything runs offline: no audit tool that itself phones home with repository contents.
- The same script runs locally and in CI, so contributors see the same verdict.
- Adding the stack later just turns on more checks — no rework.

**Negative**
- Heuristic checks produce occasional false positives (e.g. a legitimate `prepare` script); the
  remedy is an explicit, reviewed exception in the PR, not disabling the check.
- No live vulnerability database until a manifest exists; Trivy + Dependabot cover that window.
- Licence allowlist requires maintenance when a new dependency family appears.

**Neutral**
- Registry-side protections (2FA, provenance attestations on packages) are the publisher's job;
  this repository controls what it consumes, not what exists.

## Policy summary

| Rule | Severity | Action |
| --- | --- | --- |
| Moving action ref (`@main`) | high | pin to a tag or SHA |
| Unpinned dependency (`*`, `latest`) | high | pin an exact version |
| No committed lockfile | high | commit it; do not resolve on the fly |
| `pull_request_target` | high | human approval + security review |
| Implicit workflow token scope | high | add explicit `permissions:` |
| Install hook | warn | justify in the PR |
| Non-permissive licence | warn → blocker via dependency-review | review before merge |
| Orphaned code file | advisory | delete in a dedicated PR |

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| `npm audit` only | Needs installs and network; misses workflow-level risk. |
| Renovate/Dependabot only | Good at *updating*, silent about *pinning* and install hooks. |
| Vendoring every dependency | Maximum control, unsustainable maintenance for a solo practice. |
| Allowlist-only registry proxy | Strong, but requires infrastructure this repository does not have. |

## References

- `scripts/dependency-audit.mjs` · `scripts/dead-code-report.mjs`
- `.github/workflows/dependency-audit.yml` · `.github/workflows/license-compliance.yml`
- [Agent permission matrix](../agents/permissions.md) — dependency installation is `ask`, not `allow`
