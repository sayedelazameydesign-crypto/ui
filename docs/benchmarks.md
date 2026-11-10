# Benchmarks — what was measured, and the fix it caused

```bash
node scripts/bench.mjs                  # p50/p95/mean per mode, memory, corpus
node scripts/bench.mjs --json           # machine-readable
node scripts/bench.mjs --repeat 40      # more samples
```

## 1. Why a harness instead of a number

A performance claim without a command to reproduce it is marketing. `scripts/bench.mjs` runs the
**same index** and the **same queries** across every retrieval mode, reports percentiles rather than a
best case, and records the environment it ran in.

It also refuses one thing: it does not compare against commercial systems. Running a competitor
honestly requires installing its dependencies and matching its configuration; without that, a "10×
faster" figure would be invented. Any such comparison belongs in a third-party evaluation, not here.

## 2. The measurement that mattered

The first run exposed a hotspot that no amount of staring at the code had:

| Component (before) | p50 | p95 |
| --- | --- | --- |
| tokenize + expand | 0.015 ms | 0.025 ms |
| **BM25** | **1.567 ms** | 2.236 ms |
| embed + cosine | 0.126 ms | 0.168 ms |

BM25 was doing `chunk.terms.find(token)` for every token of every chunk — a linear scan inside a
linear scan (445 chunks × ~10 tokens × up to 60 terms). The fix was structural, not micro-optimized:
build **postings** (`token → [[chunkIndex, tf], …]`) once per index, cached in a `WeakMap`, so a query
touches only the chunks that actually contain its terms.

## 3. Before / after (same corpus, same 18 queries, k=5)

> The gold set has since grown from 18 to 58 cases ([ADR-0018](adr/0018-evaluation-resolution.md)). The
> tables in §3 are a *historical* before/after on one corpus within one sitting, kept because the
> speed-up claim depends on the ranking being identical on the same queries. Current quality numbers
> live in [retrieval quality §3](agents/retrieval-quality.md).

| mode | p50 before | p50 after | throughput before | throughput after |
| --- | --- | --- | --- | --- |
| hybrid | 2.116 ms | **0.375 ms** | 456 q/s | **2 551 q/s** |
| vector | 1.948 ms | 0.262 ms | 502 q/s | 3 654 q/s |
| keyword | 1.922 ms | 0.250 ms | 496 q/s | 3 813 q/s |
| hybrid + lexical rerank | 5.866 ms | 6.371 ms | 165 q/s | 153 q/s |

**5.6× faster on the hybrid path, with the ranking identical**: `R@1 0.722 · R@3 0.944 · MRR 0.815`
before and after. A speed-up that changed the answers would not count. (The corpus has grown since —
480 chunks now v. 445 then — so the two columns are the same measurement taken on the same corpus
within one sitting, not across time.)

## 4. Current numbers (measured, this machine)

```
corpus   110 files · 618 chunks · 256d · 1544 KiB index · 4886 terms
memory   +8.2 MiB heap after load · 56 MiB RSS
runtime  node v22.22.3 · linux/x64 · 58 queries × 25 repeats × 4 modes

mode                      p50 ms    p95 ms    mean ms   queries/s
hybrid                    0.654     0.932     0.680     1471
vector                    0.497     0.572     0.508     1970
keyword                   0.470     0.548     0.480     2084
hybrid+lexical-rerank     8.776    10.816     9.172      109
```

The reranker's cost is now visible for what it is: ~8× the fused path for a **worse** result
(ADR-0011). That is the argument for shipping it off, in one line.

## 5. Caveats, stated rather than buried

| Caveat | Consequence |
| --- | --- |
| Measured on the machine that ran the command | absolute milliseconds do not transfer; ratios do, roughly |
| p95 over ~450 samples | indicative, not a service-level guarantee |
| "Memory" is a heap delta after load | not peak RSS, not a leak profile |
| No cold-start measurement | the harness warms up deliberately (JIT + page cache) |
| No third-party comparison | by choice; see §1 |
| Hash embeddings are cheap | a real model would dominate latency; this table would not apply |

## 6. How to keep it honest

- Re-run the harness in the same PR that changes retrieval code, and put both numbers in the body.
- Never edit a table in this file without the command that produced it.
- If a change improves latency but lowers `R@3`, it is not an improvement — the eval gate decides.
