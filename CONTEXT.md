# CONTEXT.md — Architecture & Normative Context

> **Status: normative.** If code and this file disagree, that is a bug — fix whichever is wrong,
> in the same pull request. Agents must read this before proposing structural changes.
> Arabic summary of the current state: [§0](#0-الوضع-الحالي--current-state).

---

## 0. الوضع الحالي / Current state

المستودع في مرحلة **الأساس (L0)**:
- لا يوجد كود تطبيق ولا حزمة تقنيات مختارة — القرار مؤجَّل عمداً (D1 في [AGENTS.md](AGENTS.md#9-open-decisions-human-sign-off-required)).
- الموجود الآن: التوثيق، حواجز الحماية الآلية، مهارات الوكلاء، وسياسات الصلاحيات.
- الهدف: أن يكون المستودع **قابلاً للقراءة والتنفيذ الآمن بواسطة الوكلاء** قبل كتابة أي سطر واجهة.

---

## 1. Purpose

A user-interface repository for the owner's design practice, built to be *maintained*: human
documentation and machine-readable context live side by side, so that both people and agents
can change it without breaking it.

## 2. Layers (target architecture)

| Layer | Responsibility | State |
| --- | --- | --- |
| L0 · Governance | docs, ADRs, agent charter, guard scripts, CI | ✅ present |
| L1 · Foundation | stack, toolchain, lint/format/type gates | ⛔ not chosen (D1) |
| L2 · Design system | tokens, typography, spacing, RTL/LTR primitives | ⛔ not started (D2) |
| L3 · Components | accessible, composable UI primitives | ⛔ not started |
| L4 · Surfaces | pages / routes / content | ⛔ not started |
| L5 · Delivery | hosting, previews, observability | ⛔ not chosen (D3) |

**Rule:** a layer may not depend on a layer above it. L0 must stay stack-agnostic.

## 3. Invariants

1. **Bilingual by default.** Every user-facing surface supports Arabic (RTL) and English (LTR).
   Direction is a property of content, never hard-coded per page.
2. **Accessibility is not a later phase.** Keyboard reachable, visible focus, semantic landmarks,
   labelled controls, respects `prefers-reduced-motion`, contrast AA minimum.
3. **No secrets in the repository.** Ever. Configuration arrives through the environment.
4. **Deterministic guard.** `scripts/check-repo.sh` must be runnable offline, with no installs,
   and must fail on convention violations rather than warning softly.
5. **Documentation is part of the definition of done**, not a follow-up ticket.
6. **Reversible by default.** Prefer changes a single `git revert` can undo.
7. **One source of truth per fact.** If a fact lives in two files, one of them links to the other.

## 4. Vocabulary

| Term | Meaning in this repo |
| --- | --- |
| **Baseline (L0)** | Governance-only state; no application runtime. |
| **Agent** | Any AI system acting on the repo (coding agent, reviewer, automation). |
| **Skill** | A versioned procedure in `.claude/skills/<name>/SKILL.md`. |
| **Harness** | The configuration under `.agent/` describing what an agent may do. |
| **Guard** | `scripts/check-repo.sh` + CI workflows that enforce conventions. |
| **ADR** | Architecture Decision Record in `docs/adr/`, immutable once accepted. |
| **Surface** | A user-facing page or route (L4). |
| **Token** | A design decision expressed as data (colour, space, type). |

## 5. Non-goals

- Being a general-purpose template or a framework starter kit.
- Storing business logic, backend services, or databases here.
- Supporting a stack before D1 is decided.
- "AI-powered features" for their own sake — agentic tooling serves *maintainability* only.

## 6. Constraints

| Constraint | Consequence |
| --- | --- |
| Public repository | Anything committed is world-readable → no secrets, no client data. |
| No build system yet | CI must not assume `package.json` exists. |
| Solo maintainer + agents | Automation must be self-documenting and low-maintenance. |
| Bilingual product | RTL is a first-class layout requirement, not a CSS afterthought. |

## 7. Decision log

Accepted decisions are recorded in [`docs/adr/`](docs/adr/):

- [ADR-0001 — Agentic-first repository baseline](docs/adr/0001-agentic-first-baseline.md) · accepted
- [ADR-0002 — Deferring the application stack](docs/adr/0002-defer-stack-choice.md) · accepted

## 8. Change protocol

| Change | Required artefacts |
| --- | --- |
| New file convention or folder | `CONTEXT.md` §3/§4 + guard script update |
| New invariant | `AGENTS.md` §2 + ADR if contentious |
| Stack or tooling adoption | ADR superseding ADR-0002 + `CONTEXT.md` layer table |
| Agent capability change | `docs/agents/permissions.md` + ADR |

## 9. References

- Agent contract: [AGENTS.md](AGENTS.md)
- Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security & disclosure: [SECURITY.md](SECURITY.md)
- MCP policy: [docs/agents/mcp-policy.md](docs/agents/mcp-policy.md)
- Memory protocol: [docs/agents/memory-protocol.md](docs/agents/memory-protocol.md)
