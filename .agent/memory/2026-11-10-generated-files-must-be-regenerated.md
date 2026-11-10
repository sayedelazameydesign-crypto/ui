---
date: 2026-11-10
kind: convention
confidence: high
sources: [scripts/check-repo.sh, docs/architecture/living-docs.md, ADR-0008]
---

**Fact.** `docs/architecture/graph.md`, `docs/architecture/graph.json`, and
`artifacts.manifest.json` are generated outputs; the guard compares them byte-for-byte and fails when
stale.

**Why it matters.** Editing them by hand produces a check that passes locally for the wrong reason
and a graph that silently lies about the repository. Structural changes must end with a regeneration
step (`--write`) in the same commit.

**How to verify.** `node scripts/architecture-graph.mjs --check` and
`node scripts/artifact-manifest.mjs --check` — both must print "is current" / "in sync".
