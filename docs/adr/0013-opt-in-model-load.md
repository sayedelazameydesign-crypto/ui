# 0013 — Opt-in model loading with pinned checksums

- **Status:** accepted (policy and loader landed; the artifact is not installed)
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [ADR-0009](0009-hybrid-retrieval.md), [ADR-0010](0010-fail-closed-boundaries.md), [ADR-0011](0011-local-reranker-experiment.md), [local model](../agents/local-model.md)

## Context

`R@1 = 0.667` against a target of 0.85. ADR-0011 showed that lexical features cannot close the gap,
so the remaining honest option is a **neural** reranker — which means model weights.

Weights collide with the repository's contract: offline by default, deterministic, zero undeclared
egress (ADR-0010). Three responses were possible: (a) refuse neural ranking permanently, (b) allow an
implicit download "just for search", or (c) allow it as an **explicit, verified, isolated** action
that the default path never performs.

The owner chose (c), with conditions: ≤ 100 MiB quantized artifact; storage in an isolated, documented
location with SHA-256 verification; default runtime unchanged, gated behind an explicit flag.

## Decision

1. **A manifest is the only route to a model.** `scripts/semantic/models.manifest.json` declares id,
   file, size, URL, license, runtime and checksum, is schema-validated fail-closed, and is enforced by
   the guard.
2. **Unpinned means unusable.** `sha256: null` is legal in the schema and refused by the loader. A
   checksum can only be added by someone who verified the artifact independently; the runbook is in
   the doc, and the rule is "if the hashes disagree, stop".
3. **Weights live in `.models/` and never in Git.** `modelPath()` rejects absolute, nested and `..`
   names, so a manifest cannot reach outside the directory; the guard fails if anything under
   `.models/` is tracked.
4. **Installation is explicit and two-way.** `--from <file>` for an artifact obtained out-of-band
   (the offline path), or `--allow-network` for a pinned entry. Both verify size and digest **before**
   the file is moved into place, and a partial write is never renamed over a good one.
5. **Search never falls back silently.** `--enable-neural-rerank` either works or throws with the
   reasons (unpinned / absent / runtime missing). The default path does not import the loader.
6. **One declared host.** `check-egress.mjs` permits `huggingface.co` for exactly three files, so the
   download cannot leak into a code path that was not reviewed.

## Consequences

**Positive**
- The 100 MiB / checksum / offline conditions are enforced by code, not by good intentions.
- The dependency footprint of the default install is unchanged: no runtime, no weights, no network.
- Swapping or corrupting a weight file is detected on every use, not on the next audit.
- The same mechanism serves a future local embedder (`role: "embed"`), not only a reranker.

**Negative**
- Neural reranking still does not run: no checksum is pinned (nobody verified an artifact here) and
  the runtime is not installed. **D8 remains open** — the machinery is ready, the artifact is not.
- A checksum proves identity, not safety; a hostile ONNX file is still an untrusted parser input.
- The manifest is a single point of trust: a careless edit to a pinned digest is a security change
  disguised as a one-line diff, so review discipline is load-bearing.

**Neutral**
- `onnxruntime-node` would add a native dependency when adopted; the policy already anticipates the
  size and provenance questions that come with it.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| No neural ranking, ever | Honest but leaves R@1 at 0.67 with no route forward. |
| Download on first use, transparently | An implicit network dependency and an unreviewed supply chain. |
| Vendor the weights into Git/LFS | 20+ MB binary in history, licence obligations, and no isolation. |
| Trust-on-first-use checksum | Ships the exact failure mode the guard exists to prevent. |
| Remote rerank API | Best quality per effort, but sends repository text off-machine — contradicts ADR-0010. |

## References

- `scripts/semantic/model.mjs` · `scripts/semantic/models.manifest.json` · `.gitignore` (`.models/`)
- [`docs/agents/local-model.md`](../agents/local-model.md) · `scripts/check-repo.sh` §11
