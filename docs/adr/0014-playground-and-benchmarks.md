# 0014 — A playground that cannot lie, and a benchmark harness

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [benchmarks](../benchmarks.md), [retrieval quality](../agents/retrieval-quality.md), [ADR-0009](0009-hybrid-retrieval.md), [ADR-0011](0011-local-reranker-experiment.md)

## Context

Two claims decide whether anyone outside this repository takes it seriously:

1. **"Try it"** — a demo that requires a toolchain is a demo nobody runs.
2. **"It is fast"** — a number without a harness is an opinion.

Demos and benchmarks are also the two places where projects most often mislead by accident: a demo
that re-implements retrieval drifts from the engine, and a benchmark that compares against an
unconfigured competitor flatters itself.

## Decision

**Playground**

1. **The retrieval primitives live in one file** — `scripts/semantic/core.mjs` — importing nothing from
   Node. The CLI and the browser page both import it, so the demo cannot drift by construction.
2. **The page is static and dependency-free.** `playground/index.html` + `engine.mjs` + a pre-exported
   `index.json`; no bundler, no CDN, no framework. `scripts/playground-server.mjs` is a 60-line static
   server because browsers refuse modules over `file://`.
3. **The index ships quantized** (int8, 127×) to keep the artifact ~676 KiB.
4. **Parity is measured, not assumed** — `scripts/playground-parity.mjs` runs both engines over the gold
   set and fails when recall@3 drifts beyond 0.06. Current: engine 0.94 · playground 0.94 (delta 0.000).

**Benchmark**

5. **Same index, same queries, every mode**, reporting p50/p95/mean and throughput — never a best case.
6. **No third-party comparison.** Running a competitor honestly means installing and configuring it;
   without that, any "N× faster" claim is fabricated. The harness says so in its output.
7. **Caveats print with the numbers**, including that absolute milliseconds do not transfer between
   machines.

## Consequences

**Positive**
- The demo is credible: it is the engine, not a lookalike, and a parity check would fail if it drifted.
- The first benchmark run found a real hotspot (BM25 scanning every chunk for every term) and the fix
  — postings cached in a `WeakMap` — made the hybrid path **5.6× faster** (2.116 → 0.378 ms p50) with
  **identical** ranking (R@1 0.722 · R@3 0.944 · MRR 0.815 before and after).
- The reranker's cost is now a number (3.3 ms vs 0.4 ms) instead of an intuition.

**Negative**
- The quote-based index is ~676 KiB in Git and must be regenerated when the corpus changes; the guard
  fails when it is stale, so the cost is a red build, not a silently wrong demo.
- Refactoring the primitives into `core.mjs` touched the engine's most load-bearing file. The safety
  net was the eval gate plus 37 properties — both unchanged after the move.
- The parity tolerance (0.06) is a judgement call: int8 quantization is the intended difference, and a
  larger tolerance would hide real drift.

**Neutral**
- The harness is deliberately not a CI gate: timings on shared runners are noisy. CI runs it only to
  prove it executes (`check-repo.sh` §12).

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Demo re-implements search independently | Classic drift; the parity test exists because the temptation is real. |
| Bundle with a framework (Vite/React) | Adds a build step to a 3-file page and a dependency tree to a zero-dependency repo. |
| Serve search from an API | Contradicts the point: the retrieval runs in the browser, on the user's machine. |
| Commit float32 vectors | 1.1 MiB → ~4 MB of JSON; int8 costs 0.00 recall@3 here. |
| Benchmark against a hosted vector DB | Requires network, credentials, and their pricing assumptions — unverifiable from CI. |

## References

- `playground/index.html` · `playground/engine.mjs` · `scripts/export-playground.mjs`
- `scripts/playground-parity.mjs` · `scripts/bench.mjs` · [`docs/benchmarks.md`](../benchmarks.md)
- `scripts/semantic/core.mjs` (shared primitives) · `scripts/check-repo.sh` §12
