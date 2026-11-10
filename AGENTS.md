# AGENTS.md — Agent Operating Charter / ميثاق تشغيل الوكلاء

> **This file is the single source of truth for AI agents working in this repository.**
> Humans: start at [README.md](README.md) · Architecture context: [CONTEXT.md](CONTEXT.md) · Decisions: [docs/adr/](docs/adr/)
> **هذا الملف هو المرجع الأول لأي وكيل ذكاء اصطناعي يعمل على المستودع. اقرأه كاملاً قبل أي تعديل.**

---

## 0. Quick contract / العقد السريع

| Question | Answer |
| --- | --- |
| May I push to `main`? | **No.** Branch, then open a PR. |
| May I commit secrets? | **Never.** No keys, tokens, `.env` contents, or customer data. |
| May I delete files I do not understand? | **No.** Ask first. |
| May I change this file? | Only with an explicit human instruction, in a dedicated PR. |
| Do I need to run checks? | **Yes** — `scripts/check-repo.sh` must pass before you finish. |
| Where does project knowledge live? | `CONTEXT.md` + `docs/adr/` — update them with the code. |

---

## 1. What this repository is

`sayedelazameydesign-crypto/ui` is the **user-interface repository** for the owner's design
practice. It is an **agentic-first, machine-readable baseline**: documentation, guardrails,
agent skills, and CI are in place; the runtime stack (framework, design tokens, pages) is
**deliberately not chosen yet** (§9 Open decisions).

**Current maturity: L0 — Baseline.** Do not assume application code exists. Verify before you act.

If you need the human-facing summary, read [README.md](README.md). If you need architecture,
invariants, and vocabulary, read [CONTEXT.md](CONTEXT.md) — that file is normative, not decorative.

---

## 2. Non-negotiable rules

1. **Never commit secrets.** No API keys, tokens, private URLs, `.env` files, or personal data.
   Use environment variables and document them in `.env.example` instead.
2. **Never push directly to `main`.** Work on a branch (`feat/…`, `fix/…`, `chore/…`, `docs/…`)
   and deliver through a pull request. This includes documentation-only changes.
3. **Never rewrite published history.** No `push --force`, no `rebase` on a shared branch,
   no `filter-branch`. If history is wrong, add a corrective commit.
4. **Never delete or rename** the repository root, `.git/`, or files you did not create without
   explicit human approval.
5. **Stay inside your blast radius.** Change only what the task requires. No opportunistic
   refactors, no dependency upgrades, no reformatting of untouched files.
6. **Do not invent facts.** No fabricated benchmarks, screenshots, integrations, or "already
   implemented" claims. If you did not run it, say you did not run it.
7. **Declare your uncertainty.** If two interpretations are plausible and the cost of guessing
   wrong is material, stop and ask — one precise question, with a recommended default.
8. **Respect licensing and provenance.** Only introduce dependencies with a permissive licence
   (MIT / Apache-2.0 / BSD / ISC). Record additions in the PR body.

---

## 3. Repository map

```
.
├── AGENTS.md                  ← you are here (agent contract)
├── CONTEXT.md                 ← architecture, invariants, vocabulary (normative)
├── README.md                  ← human entry point (AR + EN)
├── CLAUDE.md                  ← thin pointer for Claude Code
├── SECURITY.md                ← disclosure + agent privilege model
├── CONTRIBUTING.md            ← human + agent contribution workflow
├── .mcp.json                  ← MCP server declarations (no secrets, ever)
├── .claude/skills/            ← reusable, versioned agent skills (SKILL.md each)
├── .agent/                    ← harness: capabilities, memory schema, task log
├── .github/
│   ├── workflows/             ← guard, security, PR hygiene
│   ├── ISSUE_TEMPLATE/        ← issue forms incl. "agent task"
│   ├── copilot-instructions.md
│   └── pull_request_template.md
├── docs/
│   ├── adr/                   ← architecture decision records (immutable once accepted)
│   └── agents/                ← permission matrix, memory protocol, MCP policy
└── scripts/check-repo.sh      ← deterministic repository guard (runs in CI)
```

---

## 4. Canonical commands

Run these from the repository root. They are the **only** commands you may assume exist.

```bash
scripts/check-repo.sh                 # repository guard: conventions + secret scan
git fetch --all --prune               # refresh refs before any work
git switch -c feat/<slug>             # always branch first
git status --short                    # confirm a clean, intentional diff
```

There is no build system yet. **Do not add one** as a side effect of an unrelated task; the
stack choice is an open decision (§9) that requires human sign-off.

---

## 5. Working loop (follow in order)

1. **Orient** — read `AGENTS.md` (this file), then `CONTEXT.md`, then the relevant ADRs.
   `git log --oneline -20` to understand recent intent.
2. **Confirm scope** — restate the task in one sentence. If it is ambiguous, ask.
3. **Branch** — `feat/…` · `fix/…` · `docs/…` · `chore/…`.
4. **Change minimally** — smallest diff that satisfies the task; keep it reviewable.
5. **Verify** — run `scripts/check-repo.sh`; if you changed docs, check every relative link.
6. **Document** — update `CONTEXT.md` when behaviour, structure, or invariants change; add an
   ADR for any decision that is expensive to reverse.
7. **Commit** — Conventional Commits, imperative mood, ≤72-char subject, body explains *why*:
   `feat(scope): …` · `fix(scope): …` · `docs(scope): …` · `chore(scope): …`
8. **Report** — in the PR body: what changed, why, how it was verified, what remains, risks.

---

## 6. Definition of done

- [ ] The diff does exactly what was asked — nothing more, nothing less.
- [ ] `scripts/check-repo.sh` passes locally.
- [ ] No secrets, no `.env` values, no credentials, no personal data in the diff.
- [ ] Documentation updated (`CONTEXT.md` / ADR / README) if behaviour or structure changed.
- [ ] Commit messages follow the convention; branch is pushed with `-u`.
- [ ] The PR body states verification honestly — including anything **not** verified.
- [ ] No unrelated formatting churn; no force-push; no direct commits to `main`.

---

## 7. Capability boundaries (least privilege)

Full matrix: [docs/agents/permissions.md](docs/agents/permissions.md). Default posture:

| Capability | Default | Notes |
| --- | --- | --- |
| Read repository files | ✅ allowed | — |
| Create/commit on a task branch | ✅ allowed | never on `main` |
| Push to `main` | ⛔ forbidden | requires human |
| Force-push / history rewrite | ⛔ forbidden | — |
| Merge a pull request | ⛔ forbidden | human-only decision |
| Create/modify releases or tags | ⛔ forbidden | requires human |
| Change repository settings, secrets, or workflows permissions | ⛔ forbidden | requires human |
| Network egress | ⚠️ restricted | only hosts declared in `.mcp.json` / task brief |
| Install dependencies | ⚠️ ask first | never during an unrelated task |
| Execute destructive shell commands (`rm -rf`, `git clean -xfd`) | ⛔ forbidden | requires human |

When in doubt: **read-only beats write, ask beats assume.**

---

## 8. Skills, MCP, and memory

- **Skills** — reusable procedures live in `.claude/skills/<name>/SKILL.md`. Load a skill instead
  of improvising a procedure. Available: `repo-guard`, `doc-sync`, `security-review`.
- **MCP** — servers are declared in `.mcp.json` **without credentials**; secrets come from the
  environment at runtime. Prefer read-only tools; request write scopes only for the task at hand.
  Policy: [docs/agents/mcp-policy.md](docs/agents/mcp-policy.md).
- **Memory** — durable, structured notes go in `.agent/memory/` (schema:
  [docs/agents/memory-protocol.md](docs/agents/memory-protocol.md)). Session scratch belongs in
  `.agent/tasks/` and must not be committed. Never store secrets in memory files — they are
  versioned and public.

---

## 9. Open decisions (human sign-off required)

| # | Decision | Status |
| --- | --- | --- |
| D1 | Application stack (Next.js vs. Astro vs. Vite + React) | open |
| D2 | Styling & design tokens (Tailwind v4, CSS variables, RTL strategy) | open |
| D3 | Hosting target (Vercel / Cloudflare / other) | open |
| D4 | Whether agents may open PRs autonomously vs. draft-only | open |

Do not pre-empt these by scaffolding a framework. Propose, then wait.

---

## 10. Escalate to a human when

- The task requires deleting data, rewriting history, or touching `main` directly.
- A decision in §9 blocks progress, or two plausible readings of the task diverge materially.
- You discover a leaked secret → **stop**, do not "fix" it by deleting the commit; report it.
- A required check fails for reasons outside your diff.
- The change would exceed the stated scope or the reviewable-diff budget (~400 lines).

---

## 11. Self-check before you report done

```
[ ] Did I read AGENTS.md and CONTEXT.md?
[ ] Am I on a task branch, not main?
[ ] Is the diff minimal and intentional?
[ ] Did scripts/check-repo.sh pass?
[ ] Are there zero secrets in the diff?
[ ] Did I update CONTEXT.md / add an ADR if structure changed?
[ ] Does my report distinguish verified from assumed?
```

> **Bilingual note / ملاحظة:** user-facing content (README, product copy, UI strings) is bilingual
> Arabic + English, with `dir="rtl"` support. Machine-facing files (this one, ADRs, configs) are
> English for token efficiency — keep the Arabic summary blocks at the top of key documents.
