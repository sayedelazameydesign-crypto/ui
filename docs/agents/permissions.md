# Agent Permission Matrix — Least Privilege

> Normative companion to [AGENTS.md](../../AGENTS.md) §7 and
> [`.agent/capabilities.yaml`](../../.agent/capabilities.yaml).
> **If a capability is not listed here, it is `ask`.**

Legend: ✅ `allow` · ⚠️ `ask` (human confirmation required) · ⛔ `deny`

## 1. Repository operations

| Capability | Coding agent | Review agent | Notes |
| --- | --- | --- | --- |
| Read files | ✅ | ✅ | Whole repository. |
| Write files on a task branch | ✅ | ⛔ | Minimal, reviewable diffs. |
| Create a branch | ✅ | ⛔ | `feat/…`, `fix/…`, `docs/…`, `chore/…`. |
| Commit | ✅ | ⛔ | Conventional Commits. |
| Push a task branch | ✅ | ⛔ | `git push -u origin <branch>`. |
| Push to `main` | ⛔ | ⛔ | Human-only. |
| Force-push / rewrite history | ⛔ | ⛔ | No exceptions. |
| Delete files | ⚠️ | ⛔ | Never delete what you did not create, without approval. |
| Merge a pull request | ⛔ | ⛔ | Merge is a human decision. |
| Create tag / release | ⛔ | ⛔ | Human-only. |
| Comment on a PR | ✅ | ✅ | Evidence-based, no invented findings. |
| Approve a PR | ⛔ | ⚠️ | Approval never replaces a green guard. |
| Repository settings, secrets, branch protection | ⛔ | ⛔ | Out of scope entirely. |

## 2. Execution

| Capability | Default | Notes |
| --- | --- | --- |
| Run `scripts/*.sh` | ✅ | Guard and repository scripts only. |
| Run package manager / install dependencies | ⚠️ | Never during an unrelated task; no build system exists yet. |
| Docker | ⚠️ | Only in an isolated, non-privileged container. |
| Network egress | ⚠️ | Restricted to hosts in the task brief / `.mcp.json`. |
| Destructive shell (`rm -rf`, `git clean -xfd`, `git reset --hard`) | ⛔ | Requires explicit human instruction in writing. |
| Read environment variables containing secrets | ⛔ | Use them via tooling; never print, log, or commit them. |

## 3. Data

| Capability | Default | Notes |
| --- | --- | --- |
| Write to `.agent/memory/` | ✅ | Public, permanent, sanitised. |
| Write to `.agent/tasks/` | ✅ | Gitignored scratch. |
| Store personal or client data | ⛔ | Synthetic fixtures only. |
| Copy content out of the sandbox | ⛔ | No exfiltration, ever. |

## 4. Escalation triggers

A human must be involved before proceeding when:

1. A secret is found — stop, report, rotate first.
2. The task implies a `main` write, a history rewrite, or a release.
3. A capability in this file needs to change.
4. A decision in `AGENTS.md` §9 blocks the work (stack, styling, hosting, autonomy level).
5. The diff would exceed ~400 changed lines or touch more than one layer.

## 5. Enforcement

| Layer | Mechanism |
| --- | --- |
| Local | `scripts/check-repo.sh` (conventions, secret scan, links). |
| Pull request | `.github/workflows/guard.yml`, `.github/workflows/pr-hygiene.yml`. |
| Security | `.github/workflows/security.yml` (Trivy), Dependabot, `SECURITY.md`. |
| Human | Branch protection on `main`, required review, merge decision. |

> **Note on honesty:** automation here is intentionally thin. A green check means *conventions
> hold* — it does not prove the change is correct. Review still matters.
