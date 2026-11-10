---
date: 2026-11-10
kind: result
confidence: high
sources: [docs/benchmarks.md, scripts/semantic/core.mjs, scripts/bench.mjs]
---

**Fact.** The first honest benchmark showed BM25 costing 1.57 ms of a 2.12 ms hybrid query: it scanned
every chunk (445) for every query token, with a linear `find` inside each chunk's term list. Caching
postings (`token → [[chunk, tf]]`) in a `WeakMap` cut the hybrid path to 0.378 ms p50 (5.6×) with
**identical** ranking (R@1 0.722 · R@3 0.944 · MRR 0.815 before and after).

**Lesson.** Measure before optimizing, and require the quality gate to be unchanged afterwards. A
speed-up that changes results is a different system, not a faster one.

**How to verify.** `node scripts/bench.mjs --repeat 25` · `node scripts/semantic/eval.mjs`.
