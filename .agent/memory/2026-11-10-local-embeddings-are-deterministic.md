---
date: 2026-11-10
kind: gotcha
confidence: high
sources: [scripts/semantic/lib.mjs, docs/agents/semantic-search.md]
---

**Fact.** The semantic index uses a local hashing embedder (`EMBED_PROVIDER=local`) and must stay
network-free in CI; the `openai` provider is opt-in and refuses to run without an explicit key.

**Why it matters.** Swapping the default to a hosted provider would leak repository content to a
third party and break offline builds. Only `providers` in `scripts/semantic/lib.mjs` may change,
and only through an ADR-level decision.

**How to verify.** `node scripts/semantic/cli.mjs doctor` — provider must read `local` in CI, and
`grep -n EMBED_PROVIDER .github/workflows/*.yml` must return nothing.
