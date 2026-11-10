# 0001 — Agentic-first, machine-readable repository baseline

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —

## Context

The repository started as an empty shell (`README.md` with one line). Modern repositories are no
longer only human-facing version control: they are shared working environments for people **and**
AI agents. Without an explicit machine-readable contract, agents:

- invent project structure that does not exist,
- commit secrets or push to `main`,
- produce documentation that drifts from the code,
- and behave differently in every session because nothing durable is recorded.

Human documentation (`README.md`) answers "what is this?" — it does not answer "what am I allowed
to do, and how do changes get verified?".

## Decision

Establish **L0 — governance** before any application code, comprising:

1. **`AGENTS.md`** — the normative agent charter: rules, boundaries, working loop, definition of done.
2. **`CONTEXT.md`** — architecture, layers, invariants, vocabulary, change protocol.
3. **`.agent/`** — declarative capability manifest (`capabilities.yaml`) plus memory schema.
4. **`.claude/skills/`** — versioned, reusable procedures (`repo-guard`, `doc-sync`, `security-review`).
5. **`.mcp.json`** — tool declarations with no literal credentials, governed by a written policy.
6. **`scripts/check-repo.sh`** — a deterministic, dependency-free guard that runs locally and in CI.
7. **CI** — guard workflow, PR hygiene workflow, security scanning, Dependabot, templates.

The repository is **machine-readable**: every constraint an agent must respect is written down in
a file it can read, and enforced by a check it can run.

## Consequences

**Positive**
- Agents behave predictably and reversibly; diffs stay small and reviewable.
- Secrets and direct-to-`main` writes are blocked by design, not by vigilance.
- Documentation drift becomes a CI failure instead of an archaeology project.
- Onboarding a new agent (or human) requires reading three files.

**Negative / costs**
- Documentation must be maintained with the code — enforced by the definition of done.
- The guard is intentionally simple and may produce false positives; it must stay readable.
- Governance files add noise to a young repository.

**Neutral**
- The design is stack-agnostic: nothing here constrains the framework chosen in ADR-0002's successor.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Start with application code, document later | Repeats the drift problem; agents would invent structure. |
| One giant `AGENTS.md` | Unmaintainable; human readers get lost in agent rules. |
| Rely on platform-specific config only (e.g. one vendor's instructions file) | Locks the repository to a single tool; agent-agnostic files age better. |
| Heavy prompt-engineering in every session | Not durable, not reviewable, not enforceable. |
| Third-party policy engine | Unnecessary dependency at L0; a 200-line shell guard is auditable. |

## References

- [AGENTS.md](../../AGENTS.md) · [CONTEXT.md](../../CONTEXT.md)
- [Agent permissions](../agents/permissions.md) · [MCP policy](../agents/mcp-policy.md)
- [Memory protocol](../agents/memory-protocol.md)
