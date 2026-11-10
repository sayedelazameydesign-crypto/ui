# CONTEXT.md — Architecture & Normative Context

> **Status: normative.** If code and this file disagree, that is a bug — fix whichever is wrong,
> in the same pull request. Agents must read this before proposing structural changes.
> Arabic summary of the current state: [§0](#0-الوضع-الحالي--current-state).

---

## 0. الوضع الحالي / Current state

المستودع في مرحلة **الأساس (L0)**:
- لا يوجد كود تطبيق ولا حزمة تقنيات مختارة — القرار مؤجَّل عمداً (D1 في [AGENTS.md](AGENTS.md#9-open-decisions-human-sign-off-required)).
- الموجود الآن: التوثيق، حواجز الحماية الآلية، مهارات الوكلاء، وسياسات الصلاحيات،
  إضافة إلى أربع قدرات: **بحث دلالي متجهي**، **بيئات معزولة مؤقتة**، **توقيع أصل الكود (بشري/ذكائي)**،
  و**محرك تبعيات عديم الثقة**. جميعها تعمل دون شبكة ودون مفاتيح.
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
| L5 · Delivery | hosting, previews, observability | ⛔ not chosen (D3, D6) |
| L0+ · Retrieval & provenance | semantic index, authorship trailers, supply-chain audit | ✅ present |
| L0+ · Verification & docs | property tests, deterministic mocks, generated architecture graph | ✅ present |
| L0+ · Retrieval quality & boundaries | hybrid ranking with a measured gate, fail-closed schemas, declared egress | ✅ present |

The `L0+` row is cross-cutting tooling: it never imports from L1–L5 and must keep working when the
stack arrives.

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
8. **Authorship is declared.** Every commit states `AI-Assisted-By:` or `Human-Authored: true`;
   AI commits need a human reviewer before merge. Declarative, not cryptographic
   ([ADR-0003](docs/adr/0003-ai-code-provenance.md)).
9. **Tooling is offline and deterministic.** The guard, index, provenance, and audit scripts run
   with no network and no API key; identical inputs give identical outputs.
10. **Dependencies are untrusted input.** Pinning, install-hook review, and licence checks run when
    a dependency arrives — not a month later ([ADR-0004](docs/adr/0004-zero-trust-dependencies.md)).
11. **Generated documentation is verified, not trusted.** The architecture graph and the artifact
    ledger are outputs; `--check` fails when they disagree with the repository
    ([ADR-0008](docs/adr/0008-living-documentation.md)).
12. **Optimisation never weakens a gate.** A job may be skipped only when the change classifier
    proves it safe; guard, provenance, and PR hygiene always run
    ([ADR-0007](docs/adr/0007-green-builds.md)).
13. **Quality is measured, not asserted.** Retrieval changes are accepted against a gold set with a
    gate that only ratchets upward ([ADR-0009](docs/adr/0009-hybrid-retrieval.md)).
14. **Boundaries default to "no".** Unknown config keys and undeclared network destinations fail the
    build ([ADR-0010](docs/adr/0010-fail-closed-boundaries.md)).
15. **Only synthetic data enters the repository.** The pre-commit scan blocks PII and secrets in the
    staged diff; exemptions need a written reason ([ADR-0012](docs/adr/0012-pii-dlp-guard.md)).
16. **Weights are opt-in and verified.** Unpinned artifacts are refused, storage is isolated, and the
    default path never loads a model ([ADR-0013](docs/adr/0013-opt-in-model-load.md)).
17. **The demo is the engine.** The playground imports `core.mjs`; parity is enforced, so a demo can
    never quietly retrieve worse than the CLI ([ADR-0014](docs/adr/0014-playground-and-benchmarks.md)).
18. **Derived state is versioned separately.** Snapshots restore it byte-for-byte; source belongs to
    Git ([ADR-0015](docs/adr/0015-state-snapshots-and-ledger.md)).
19. **History is self-verifying.** Every recorded action is hash-chained; an anchor makes truncation
    detectable too.
20. **Defaults follow the measurement.** A component that loses on the eval (the lexical reranker)
    ships off by default and is documented as a negative result ([ADR-0011](docs/adr/0011-local-reranker-experiment.md)).
15. **Bytes are reproducible.** Large artifacts live in LFS and are hashed in the manifest, so a
    result can be traced to the exact data that produced it
    ([ADR-0005](docs/adr/0005-artifact-storage.md)).

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
| **Embedding / index** | Dense vector per chunk of text; the index is derived state (`.index/`, gitignored). |
| **Provenance** | The declared authorship of a commit (human vs. AI + tool), enforced in CI. |
| **Sandbox** | An ephemeral, non-root, capability-dropped environment a change can be run in. |
| **Orphan** | A code file nothing references — a *candidate* for removal, never proof of it. |
| **Property** | An invariant asserted over generated inputs, not a hand-picked example. |
| **Mock** | A deterministic local stand-in for an external service, served from fixtures. |
| **Component** | A directory-level node in the architecture graph (workflows, skills, semantic…). |
| **LFS pointer** | The small tracked stub that stands in for a large binary's bytes. |
| **Routing class** | `docs` · `ci` · `tooling` · `data` · `deps` · `code` — decides which CI jobs run. |
| **Hybrid retrieval** | Vector cosine fused with BM25 by reciprocal rank fusion (RRF, k=60). |
| **RRF** | Rank-based fusion: `1/(k+rank)` summed across rankings; no score scaling needed. |
| **Gold set** | `tests/semantic-gold.json` — queries with the file that truly answers each one. |
| **Egress allowlist** | The declared set of outbound hosts, each with a reason and a file scope. |
| **Fail-closed** | Absent an explicit rule, the answer is "reject" — for keys and for destinations. |
| **PII** | Personal data: names, addresses, phones, national IDs, card numbers, credentials. |
| **Staged blob** | What `git commit` will record — not necessarily what is on disk. |
| **Masking** | Replacing a matched value with a shape-preserving placeholder so logs never leak it. |
| **Negative result** | A measured, documented experiment that did not improve the gate's numbers. |
| **Pinned checksum** | A SHA-256 recorded by a human who verified the artifact independently. |
| **Unpinned** | `sha256: null` — legal in the schema, unusable by the loader, never installed. |
| **Storage isolation** | Model files resolve inside `.models/` only; traversal is rejected, not sanitised. |
| **Parity** | The playground and the engine return the same ranking on the gold set (within tolerance). |
| **Postings** | `token → [[chunk, tf]]`; BM25 touches matching chunks instead of scanning all of them. |
| **p50 / p95** | Median and tail latency — a best case is not a benchmark. |
| **Mutation** | A deliberate defect injected into a guard; "killed" means the suite noticed. |
| **Baseline** | The unmutated behaviour — measured first, so a broken test cannot look like a pass. |
| **Anchor** | A committed record of the ledger's length and head hash; defeats tail truncation. |
| **Snapshot** | A hash-recorded copy of derived state, restorable byte-for-byte. |

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
- [ADR-0003 — Trailer-based AI code provenance](docs/adr/0003-ai-code-provenance.md) · accepted
- [ADR-0004 — Zero-trust dependency engine](docs/adr/0004-zero-trust-dependencies.md) · accepted
- [ADR-0005 — Artifact storage: LFS + manifest](docs/adr/0005-artifact-storage.md) · accepted
- [ADR-0006 — Property tests and deterministic mocks](docs/adr/0006-testing-strategy.md) · accepted
- [ADR-0007 — Cost- and carbon-aware CI routing](docs/adr/0007-green-builds.md) · accepted
- [ADR-0008 — Living documentation as a verified artifact](docs/adr/0008-living-documentation.md) · accepted
- [ADR-0009 — Hybrid retrieval with a measured quality gate](docs/adr/0009-hybrid-retrieval.md) · accepted
- [ADR-0010 — Fail-closed boundaries and declared egress](docs/adr/0010-fail-closed-boundaries.md) · accepted
- [ADR-0011 — A local reranker was attempted, measured, and left off](docs/adr/0011-local-reranker-experiment.md) · accepted (negative result)
- [ADR-0012 — PII and secret detection at the commit boundary](docs/adr/0012-pii-dlp-guard.md) · accepted
- [ADR-0013 — Opt-in model loading with pinned checksums](docs/adr/0013-opt-in-model-load.md) · accepted (policy and loader; artifact absent)
- [ADR-0014 — A playground that cannot lie, and a benchmark harness](docs/adr/0014-playground-and-benchmarks.md) · accepted
- [ADR-0015 — Snapshots for derived state, and a tamper-evident ledger](docs/adr/0015-state-snapshots-and-ledger.md) · accepted
- [ADR-0016 — Mutation testing for the guards](docs/adr/0016-mutation-testing.md) · accepted

## 8. Change protocol

| Change | Required artefacts |
| --- | --- |
| New file convention or folder | `CONTEXT.md` §3/§4 + guard script update |
| New invariant | `AGENTS.md` §2 + ADR if contentious |
| Stack or tooling adoption | ADR superseding ADR-0002 + `CONTEXT.md` layer table |
| Agent capability change | `docs/agents/permissions.md` + ADR |
| New script under `scripts/` | `AGENTS.md` §3/§4 + guard required-file list + a smoke test |
| Authorship or licence policy change | new ADR superseding 0003 / 0004 |
| New artifact root or LFS pattern | `.gitattributes` + `docs/data/artifacts.md` + manifest regeneration |
| Structure change (files move) | `node scripts/architecture-graph.mjs --write` |
| New CI job | classifier rule + `docs/ci/green-builds.md` routing table |
| New outbound destination | `scripts/check-egress.mjs` allowlist entry + a reason |
| New structural JSON file | schema in `scripts/validate-json.mjs` + guard required-file entry |
| New detector rule | `scripts/check-pii.mjs` + a property that proves masking still holds |
| New model artifact | manifest entry with pinned `sha256`, byte count, license, runtime |
| Retrieval code change | re-run `bench.mjs` + `eval.mjs`, put both numbers in the PR, regenerate `playground/index.json` |
| Ranking change | eval run before/after recorded in the PR body (ADR-0009) |

## 9. References

- Agent contract: [AGENTS.md](AGENTS.md)
- Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security & disclosure: [SECURITY.md](SECURITY.md)
- MCP policy: [docs/agents/mcp-policy.md](docs/agents/mcp-policy.md)
- Memory protocol: [docs/agents/memory-protocol.md](docs/agents/memory-protocol.md)
- Semantic search: [docs/agents/semantic-search.md](docs/agents/semantic-search.md)
- Code provenance: [docs/agents/provenance.md](docs/agents/provenance.md)
- Ephemeral environments: [docs/ci/ephemeral-environments.md](docs/ci/ephemeral-environments.md)
- Artifacts & datasets: [docs/data/artifacts.md](docs/data/artifacts.md)
- Testing strategy: [docs/ci/testing-strategy.md](docs/ci/testing-strategy.md)
- Green builds: [docs/ci/green-builds.md](docs/ci/green-builds.md)
- Living documentation: [docs/architecture/living-docs.md](docs/architecture/living-docs.md)
- Retrieval quality: [docs/agents/retrieval-quality.md](docs/agents/retrieval-quality.md)
- Data sovereignty: [docs/security/data-sovereignty.md](docs/security/data-sovereignty.md)
- PII guard: [docs/security/pii-guard.md](docs/security/pii-guard.md)
- Local model policy: [docs/agents/local-model.md](docs/agents/local-model.md)
- Benchmarks: [docs/benchmarks.md](docs/benchmarks.md) · Demo: [playground/index.html](playground/index.html)
- State and rollback: [docs/agents/state-and-rollback.md](docs/agents/state-and-rollback.md)
- Architecture graph (interactive): [playground/graph.html](playground/graph.html)
