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
| How do I declare authorship? | Trailer: `AI-Assisted-By: <tool>` or `Human-Authored: true` ([provenance](docs/agents/provenance.md)). |
| How do I find code by meaning? | `node scripts/semantic/cli.mjs search "…"` (hybrid; see [retrieval quality](docs/agents/retrieval-quality.md)). |
| May I add an external URL or service? | Only by declaring it in `scripts/check-egress.mjs` with a reason ([sovereignty](docs/security/data-sovereignty.md)). |
| May I commit test data? | Synthetic only. `node scripts/check-pii.mjs --staged` blocks PII and secrets ([pii guard](docs/security/pii-guard.md)). |
| May I download a model? | Only via `semantic/model.mjs` with a checksum pinned in the manifest — never in CI ([local model](docs/agents/local-model.md)). |
| Where do datasets and model weights go? | Git LFS + `artifacts.manifest.json` ([artifacts](docs/data/artifacts.md)). |
| May I hand-edit a generated file? | **No.** Regenerate it (`--write`) and commit the output. |

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
9. **Declare authorship in every commit** — exactly one of `AI-Assisted-By: <tool>` or
   `Human-Authored: true`, plus `Human-Reviewed-By:` on AI commits. Enforcement:
   `node scripts/provenance.mjs --strict`. See [docs/agents/provenance.md](docs/agents/provenance.md).
10. **Keep tooling offline and deterministic.** No script may phone home, and none may require an
    API key to run in CI. Remote model providers are opt-in per session, never a default.
11. **Never delete code you cannot prove is dead.** `scripts/dead-code-report.mjs` outputs
    candidates; removal happens in a dedicated PR with the guard green.
12. **Never hand-edit generated files.** `docs/architecture/graph.md`, `graph.json`, and
    `artifacts.manifest.json` are outputs: change the input, run the generator, commit the result.
13. **Large binaries go through LFS.** Declare the pattern in `.gitattributes` *before* the first
    commit of that type, then record it with `node scripts/artifact-manifest.mjs --write`.
14. **Declare every outbound destination.** A URL not present in `scripts/check-egress.mjs` fails
    the guard. Data does not leave the machine by accident
    ([sovereignty policy](docs/security/data-sovereignty.md)).
15. **Structural JSON is fail-closed.** A new key in `.mcp.json` or a manifest must be added to the
    schema in `scripts/validate-json.mjs`; unknown keys are errors, not warnings.
16. **Quality claims need a measured gate.** Retrieval changes must keep
    `node scripts/semantic/eval.mjs` green (hybrid R@3 ≥ 0.90, MRR ≥ 0.75). Raising the floor is
    allowed; lowering it silently is not.
17. **No real personal data, ever.** Only synthetic fixtures. Exemptions go in
    `.pii-allowlist.json` **with a reason** — never by skipping the check
    ([PII guard](docs/security/pii-guard.md)).
18. **Weights are opt-in, pinned, and isolated.** A model entry with `sha256: null` is refused; a
    fetch needs `--allow-network`; the default search path never imports the loader
    ([ADR-0013](docs/adr/0013-opt-in-model-load.md)).
19. **A negative result is a result.** Report the measurement and ship the default that the numbers
    support (`--rerank` is off for exactly this reason, see [ADR-0011](docs/adr/0011-local-reranker-experiment.md)).
20. **Never weaken a gate to make a run faster.** Routing may skip work only when the classifier
    proves the change is docs-only ([green builds](docs/ci/green-builds.md)).

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
├── .devcontainer/             ← isolated sandbox: non-root, capabilities dropped
├── .github/
│   ├── workflows/             ← guard, security, PR hygiene
│   ├── ISSUE_TEMPLATE/        ← issue forms incl. "agent task"
│   ├── copilot-instructions.md
│   └── pull_request_template.md
├── docs/
│   ├── adr/                   ← architecture decision records (immutable once accepted)
│   ├── agents/                ← permissions, memory, MCP, semantic search, provenance
│   └── ci/                    ← ephemeral environments, pipeline guarantees
├── tests/properties/          ← invariant tests (property-based, seeded)
├── mocks/fixtures/            ← static service fixtures (deterministic, offline)
├── artifacts.manifest.json    ← dataset/model state ledger (generated)
├── .gitattributes             ← LFS patterns + line-ending policy
└── scripts/
    ├── check-repo.sh          ← deterministic repository guard (runs locally and in CI)
    ├── semantic/              ← offline vector index + `search` CLI
    ├── lib/property.mjs       ← property-testing primitives (generators, shrinking)
    ├── lib/schema.mjs         ← minimal fail-closed JSON schema validator
    ├── semantic/eval.mjs      ← quality gate over tests/semantic-gold.json
    ├── semantic/model.mjs     ← opt-in model install/verify (checksum-pinned, isolated)
    ├── property-test.mjs      ← property runner (seeded, shrinks failures)
    ├── mock-server.mjs        ← deterministic HTTP mocks, fault injection
    ├── change-classifier.mjs  ← CI cost/carbon routing by change class
    ├── validate-json.mjs      ← fail-closed schema validation for structural files
    ├── check-egress.mjs       ← egress allowlist (data sovereignty)
    ├── check-pii.mjs          ← PII/secret detection at the commit boundary
    ├── artifact-manifest.mjs  ← artifact ledger: write / check for drift
    ├── architecture-graph.mjs ← living architecture graph: write / check
    ├── provenance.mjs         ← AI/human authorship report
    ├── dependency-audit.mjs   ← zero-trust supply-chain findings
    ├── dead-code-report.mjs   ← orphan candidates (advisory)
    └── git-hooks/             ← commit-msg hook (Conventional Commits + trailers)
```

---

## 4. Canonical commands

Run these from the repository root. They are the **only** commands you may assume exist.

```bash
scripts/check-repo.sh                 # repository guard: conventions + secret scan + tooling
bash scripts/install-hooks.sh         # once per clone: commit-msg hook (trailers, commit format)
git fetch --all --prune               # refresh refs before any work
git switch -c feat/<slug>             # always branch first
git status --short                    # confirm a clean, intentional diff

node scripts/semantic/cli.mjs index             # build the vector index (.index/, gitignored)
node scripts/semantic/cli.mjs search "…" -k 5   # retrieve context by meaning
node scripts/provenance.mjs --strict            # authorship trailers for this branch
node scripts/dependency-audit.mjs --strict      # supply-chain posture
node scripts/dead-code-report.mjs               # orphan candidates (never auto-delete)

node scripts/property-test.mjs --runs 300       # invariants over generated input
node scripts/mock-server.mjs --port 4010        # deterministic service mocks (no egress)
node scripts/change-classifier.mjs              # what the current diff should run in CI
node scripts/semantic/eval.mjs                  # retrieval quality gate (recall@k, MRR)
node scripts/validate-json.mjs                  # fail-closed schema validation
node scripts/check-egress.mjs                   # declared egress destinations only
node scripts/check-pii.mjs --staged             # PII/secrets in the staged diff (pre-commit)
node scripts/semantic/model.mjs status          # opt-in model artifacts (never downloads)
node scripts/semantic/model.mjs plan            # what is missing to enable neural rerank

node scripts/architecture-graph.mjs --write     # regenerate the living architecture graph
node scripts/artifact-manifest.mjs --write      # regenerate the artifact ledger
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
- [ ] Generated files regenerated if structure or artifacts changed (`--write`, then commit).
- [ ] No secrets, no `.env` values, no credentials, no personal data in the diff.
- [ ] Documentation updated (`CONTEXT.md` / ADR / README) if behaviour or structure changed.
- [ ] Commit messages follow the convention; branch is pushed with `-u`.
- [ ] Every commit carries a provenance trailer (`AI-Assisted-By:` / `Human-Authored: true`).
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
| Install dependencies | ⚠️ ask first | never during an unrelated task; `--ignore-scripts` in sandboxes |
| Build the semantic index (`.index/`) | ✅ allowed | derived, gitignored, never committed |
| Send code to a remote embedding provider | ⛔ forbidden by default | opt-in per session, explicit data decision |
| Add a git trailer that misstates authorship | ⛔ forbidden | provenance is an audit trail (ADR-0003) |
| Execute destructive shell commands (`rm -rf`, `git clean -xfd`) | ⛔ forbidden | requires human |

When in doubt: **read-only beats write, ask beats assume.**

---

## 8. Skills, MCP, and memory

- **Skills** — reusable procedures live in `.claude/skills/<name>/SKILL.md`. Load a skill instead
  of improvising a procedure. Available: `repo-guard`, `doc-sync`, `security-review`,
  `semantic-retrieval`.
- **MCP** — servers are declared in `.mcp.json` **without credentials**; secrets come from the
  environment at runtime. Prefer read-only tools; request write scopes only for the task at hand.
  Policy: [docs/agents/mcp-policy.md](docs/agents/mcp-policy.md).
- **Retrieval** — use `scripts/semantic/cli.mjs` (or `lib.mjs` in-process) to find context by
  meaning instead of guessing paths. Results are candidates: open the file before acting.
  Design and limits: [docs/agents/semantic-search.md](docs/agents/semantic-search.md).
- **Provenance** — every commit declares authorship; see §2.9 and
  [docs/agents/provenance.md](docs/agents/provenance.md).
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
| D5 | Repository licence (MIT vs. Apache-2.0) — no `LICENSE` file yet | open |
| D6 | Preview hosting target for per-PR sandboxes (see `docs/ci/ephemeral-environments.md`) | open |
| D7 | Artifact remote for large data (LFS quota vs. dataset registry) — see `docs/data/artifacts.md` | open |
| D8 | Neural cross-encoder reranker for R@1 ≥ 0.85 — the load policy is enforced ([ADR-0013](docs/adr/0013-opt-in-model-load.md)); still missing: a pinned checksum and the ONNX runtime | **open** (policy done) |
| D9 | Runtime egress proxy for real enforcement (the allowlist is intent, a proxy is control); the commit-boundary PII guard now exists ([ADR-0012](docs/adr/0012-pii-dlp-guard.md)) | partly done |

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
