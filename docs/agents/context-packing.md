# Context Packing — compression with the citations intact

```bash
node scripts/context-pack.mjs "who may merge a pull request" --budget 1200
node scripts/context-pack.mjs "…" --budget 800 --json --out /tmp/context.md
node scripts/context-pack.mjs --eval          # the measured table below
```

## 1. The problem it solves

A repository is 484 KiB of text (~124k estimated tokens). Sending the retrieved candidates in full
costs ~12k tokens per question; sending the whole thing is impossible. Cutting text to fit a budget is
easy — cutting it **without silently deleting the answer** is the actual problem, and it has a measurable
answer.

## 2. The pipeline (local, deterministic, no model)

```
query ──► hybrid retrieval (top 40) ──► near-duplicate drop (cosine > 0.95)
                                              │
                                     extractive compression (IDF-weighted sentences)
                                              │
                                     budget selection (greedy, ≤ 2 passages per file)
                                              │
                                        cited markdown pack
```

Three decisions worth naming:

- **Extractive, never generative.** Rewriting without a model produces fluent sentences nobody wrote.
  Every line in a pack exists verbatim in the source, so it can be checked.
- **Gaps are marked.** When the kept sentences are not contiguous, the pack inserts ` … `. A reader must
  see that text is missing; otherwise an extract reads like a document that was always this short.
- **Citations are ranges.** Each passage is `path:line` → the exact source lines, re-read from disk at
  pack time, so a citation cannot drift from what the file says.

## 3. Measured (18 gold cases, corpus 484 KiB)

| budget | passages | tokens used | answer@budget | vs corpus | vs top-40 |
| --- | --- | --- | --- | --- | --- |
| 400 | 6.6 | 388 | **94%** | 394× | **30.8×** |
| 800 | 13.1 | 788 | **100%** | 194× | 15.2× |
| 1 600 | 25.9 | 1 582 | 100% | 96× | 7.5× |
| 3 200 | 32.6 | 2 018 | 100% | 75× | 5.9× |

`answer@budget` = the gold file for that query is cited somewhere in the pack. `vs top-40` = the
unpacked candidate set most tools send as-is, divided by the pack size. **The honest headline is the
400-token row: ~31× smaller than sending the candidates, and the answering file is still cited 94% of the
time.**

Tokens are estimated at 4 characters per token — a stated approximation, not a tokenizer. A real BPE
count would shift these numbers by ±10–20%.

## 4. What it is not

| Not this | Why it matters |
| --- | --- |
| A summariser | It never paraphrases; there is no model here, and inventing prose would break verification |
| Semantic chunking | Chunk boundaries come from the existing index (headings, size), not from an LLM |
| Token-exact budgeting | `chars / 4` is an estimate; a real tokenizer is a dependency and a per-model concern |
| A retrieval change | Retrieval is untouched — the pack inherits whatever the hybrid engine found |
| Lossless | Information *is* dropped. The metric exists because that is the whole risk |

## 5. Properties that hold (6 of the 50 in the suite)

1. a pack never exceeds its budget;
2. every cited line exists and resolves to non-empty source;
3. packing is deterministic — same query, same pack, byte for byte;
4. no two passages in a pack are near-duplicates (cosine ≤ 0.95);
5. compression never expands a passage;
6. a gap marker appears **exactly** when kept sentences are not contiguous.

## 6. Limits, stated plainly

- **94% is not 100%.** At 400 tokens one case in eighteen loses the answering file; 800 is the smallest
  budget with full coverage on this gold set.
- **The gold set is 18 cases.** It catches regressions; it does not prove generalisation.
- **Duplicate detection is lexical.** Two passages that say the same thing in different words survive.
- **Sentence splitting is punctuation-based.** Arabic and English work; code blocks and tables are kept
  whole rather than scored, so a table can consume a budget on its own.
- **No reader feedback.** Compression is tuned against citations, not against whether a human found the
  result useful.
