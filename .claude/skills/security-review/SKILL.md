---
name: security-review
description: Least-privilege and secret-hygiene review for a diff, a dependency change, or before a release.
---

# Skill — security-review

**When to use:** before opening a PR that touches workflows, dependencies, configuration, or
anything network-facing; and whenever `Trivy`, `Dependabot`, or the guard report an issue.

## Checklist (review the diff, not the repository)

1. **Secrets** — no keys, tokens, `.env` values, private URLs, or customer data.
   Configuration arrives via environment variables; document them in `.env.example`.
2. **Workflow permissions** — `.github/workflows/*` must declare an explicit `permissions:` block.
   Default to `contents: read`. `pull_request_target` is forbidden without human approval.
3. **Untrusted input** — never interpolate `${{ github.event.* }}` (titles, branch names, PR
   bodies) directly into `run:` scripts; pass it through `env:` and quote it.
4. **Pinned actions** — third-party actions are pinned to a full commit SHA or a major tag owned
   by a verified publisher. No `@master`.
5. **Dependencies** — new packages need a permissive licence, a maintained upstream, and a reason
   in the PR body. No post-install scripts from unknown publishers.
6. **Agent privilege** — the diff must not widen capabilities (`docs/agents/permissions.md`),
   add an MCP server (`.mcp.json`), or grant write scopes without an ADR.
7. **Data** — no PII in fixtures, screenshots, or logs. Sample data is synthetic.

## Reporting

| Severity | Meaning | Action |
| --- | --- | --- |
| **blocker** | secret, privilege escalation, remote code path | stop; report; do not merge |
| **warn** | risky but contained | fix in this PR or file a follow-up issue |
| **nit** | hygiene | optional, mention only |

Each finding: `severity · file:line · what · why it matters · concrete fix`.

## On discovering a leaked secret

1. **Stop** further work on the branch.
2. Do **not** rewrite history or delete the commit — rotation must come first.
3. Report the exposure to the maintainer via the private channel in `SECURITY.md`.
