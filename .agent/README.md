# `.agent/` — Agent Harness

Machine-readable configuration describing **what an agent may do** in this repository, and
**what it must remember between sessions**.

| Path | Purpose | Committed? |
| --- | --- | --- |
| `capabilities.yaml` | Declarative capability matrix (allow / ask / deny) | ✅ yes |
| `memory/` | Durable, reviewed project memory (decisions, gotchas) | ✅ yes |
| `tasks/` | Per-session scratch and task logs | ❌ no (gitignored) |

## Rules

1. `capabilities.yaml` is **declarative, not advisory**: it mirrors
   [`docs/agents/permissions.md`](../docs/agents/permissions.md). If they disagree, the stricter
   one wins and the PR must reconcile them.
2. Anything under `memory/` is **public and permanent** — no secrets, no personal data, no
   speculation presented as fact.
3. `tasks/` is scratch space. Do not commit it; promote durable findings into `memory/` instead.
4. Changing this folder requires a human-approved PR and, for capability changes, an ADR.

Related: [AGENTS.md](../AGENTS.md) · [memory protocol](../docs/agents/memory-protocol.md) ·
[MCP policy](../docs/agents/mcp-policy.md)
