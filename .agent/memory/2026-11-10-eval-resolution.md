---
date: 2026-11-10
kind: convention
confidence: high
sources: [tests/semantic-gold.json, scripts/semantic/eval.mjs, docs/adr/0018-evaluation-resolution.md]
---

**Fact.** An evaluation set of *n* cases cannot resolve a difference smaller than 1/*n*. At 18 cases that
is 5.6 points, and several retrieval decisions in this repository were argued over one or two cases —
inside the instrument's noise.

**What was done.** The gold set grew to 58 bilingual cases (18 `v1` untouched + 40 `v2`), the eval prints
the per-case resolution and a seeded bootstrap interval for R@1 (`[0.52, 0.76]`), and the gate moved to
R@1 ≥ 0.60 / R@3 ≥ 0.72 / MRR ≥ 0.66.

**Measured.** R@1 0.638 on all 58, but 0.778 on the original 18 with the same engine — the `v1`/`v2` gap
is the author bias that used to be only a caveat. Windowed markdown sections (+3.4 points) and 45 glossary
terms (+5.2) were the only two of ten candidates that survived; BM25F weights, bigram terms, min–max
fusion, list floors, evidence tie-breaks, larger embedding dimensions and the lexical reranker all
measured worse.

**Why it matters.** A number that cannot be wrong cannot be right either. Reporting the interval is what
lets 0.85 (D8) be described as *out of reach for this engine* instead of *nearly there*.
