# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

- Preferred: **GitHub Private Security Advisory** — *Security → Advisories → Report a vulnerability*
  on this repository.
- Include: affected file or workflow, a reproduction (or a precise description), impact, and any
  suggested fix.
- Expect an acknowledgement within **5 working days**. This is a personal project maintained by a
  single owner, so timelines are best-effort, not contractual.

Do not include live credentials in a report. If you must reference one, describe it and rotate it.

## Supported versions

This repository is currently at **L0 — governance only** (no runtime, no deployed service). There
are no released versions to support. Once an application exists, this section will list supported
branches and their support windows.

| Version | Supported |
| --- | --- |
| `main` | ✅ (conventions and workflow security) |
| any application release | — not yet released |

## What this repository considers a security issue

- A committed secret, token, private key, or personal data.
- A CI/CD workflow capable of privilege escalation (e.g. `pull_request_target` with untrusted
  checkout, over-broad `permissions:`).
- A dependency or GitHub Action that is unpinned or malicious.
- An agent configuration that grants capabilities beyond
  [`docs/agents/permissions.md`](docs/agents/permissions.md) — this is a **privilege-escalation**
  bug, treated as high severity.
- Prompt-injection vectors introduced into repository content consumed by agents.

## Practices in place

| Control | Where |
| --- | --- |
| Deterministic convention + secret scan | `scripts/check-repo.sh`, `.github/workflows/guard.yml` |
| Filesystem vulnerability scan | `.github/workflows/security.yml` (Trivy) |
| Dependency and Action updates | `.github/dependabot.yml` |
| Explicit least-privilege workflow tokens | `permissions:` block in every workflow |
| Agent capability manifest | `.agent/capabilities.yaml` |
| MCP credential hygiene | `.mcp.json`, `docs/agents/mcp-policy.md` |
| No secrets in history by policy | `AGENTS.md` §2.1 |

## If a secret is exposed

1. **Rotate first.** Revoke the credential at its provider — history rewriting does not protect a
   leaked value.
2. Remove it from the working tree and from any configuration file.
3. Replace it with an environment variable and document it in `.env.example`.
4. Report the exposure so the commit history can be assessed deliberately by a human.
5. Never delete the commit to "hide" the leak — that destroys evidence and leaves the secret valid
   in forks and caches.

## Agent-specific guidance

Autonomous agents are **untrusted by default**. They may read, propose, and commit on a task
branch; they may not merge, release, or change settings. See
[`AGENTS.md`](AGENTS.md) §7 and [`docs/agents/permissions.md`](docs/agents/permissions.md).
