---
date: 2026-11-10
kind: decision
confidence: high
sources: [docs/adr/0013-opt-in-model-load.md, scripts/semantic/model.mjs, docs/agents/local-model.md]
---

**Fact.** Model weights may only enter this repository through `scripts/semantic/models.manifest.json`.
`sha256: null` is schema-legal and **means unusable**: `verify` reports `unpinned` and `install`
refuses, even with `--allow-network`. A human pins the digest after verifying the artifact
independently; the rule is "if the hashes disagree, stop".

**Why.** Trust-on-first-use would ship exactly the failure the guard exists to prevent. The manifest
is the only route because a download path outside it would be an undeclared egress.

**How to verify.** `node scripts/semantic/model.mjs status` (must print `unpinned` and the missing
runtime) · `bash scripts/check-repo.sh` §11 (no weights tracked, ceiling ≤ 100 MiB).
