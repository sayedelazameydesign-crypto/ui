# 0017 — Extractive context packing with measured citation retention

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [context packing](../agents/context-packing.md), [ADR-0009](0009-hybrid-retrieval.md), [ADR-0014](0014-playground-and-benchmarks.md)

## Context

The repository holds 484 KiB of text (~124k estimated tokens). Any agent or human reading it must
choose a subset. Two failure modes dominate:

1. **Send everything retrieved.** Ten to twelve thousand tokens per question, most of it irrelevant.
2. **Summarise it.** Fluent, plausible, unverifiable — and without a local model, fabricated.

The useful middle is extraction: keep the sentences that answer the question, verbatim, with their line
numbers, and say honestly what was left out.

## Decision

1. **Extractive only.** Sentences are selected by IDF-weighted query overlap and kept in source order.
   Nothing is rewritten; every line in a pack exists verbatim in the source.
2. **Citations are ranges re-read from disk.** A pack entry is `path:line`, resolved at pack time, so a
   citation cannot silently diverge from the file.
3. **Gaps are explicit.** Non-contiguous selections are joined with ` … `; the contract is property-tested
   ("a gap marker appears exactly when kept sentences are not contiguous").
4. **Budgets are estimates and say so.** 4 characters ≈ 1 token; a real tokenizer is a per-model
   dependency and is deliberately not in scope.
5. **Quality is measured as answer retention, not brevity.** `--eval` reports, per budget, whether the
   gold file is still cited, against two baselines: the whole corpus and the unpacked candidate set.

## Consequences

**Positive**
- At **400 tokens** the answering file is cited for **94%** of queries, and the pack is **~31× smaller**
  than sending the retrieved candidates; at **800 tokens** it is **100%** and still 15× smaller.
- Every claim is checkable in one step: follow the citation, read the line.
- Six properties (50 total) hold the contract: budget, citation resolution, determinism, dedupe,
  no-expansion, gap marking.

**Negative**
- Information is lost, deliberately: 94% is not 100%, and the missing 6% is a real risk for a question
  that needed the dropped passage.
- Sentence scoring is lexical (IDF overlap), so a passage that answers the question in different words
  can be compressed down to its opening sentence.
- Tables and code blocks are kept whole, so one large table can consume an entire small budget.
- The 18-case gold set is thin, and one of its cases (the known Arabic merge query) is already a miss for
  retrieval — packing cannot recover what retrieval never ranked.

**Neutral**
- The packer is stateless and pure apart from reading sources, so it can be reused by the playground, a
  future CLI agent, or CI without change.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| LLM summarisation | Best compression per token, but needs a model, sends text off-machine (ADR-0010), and invents prose nobody wrote. |
| Sliding-window chunking with truncation | Cheap, but drops the answer silently and keeps whatever happened to be first. |
| Full-file inclusion for the top hit | Predictable, but a single file can exceed the whole budget. |
| Embedding-based redundancy clustering | Better dedupe, but needs clustering parameters nobody can justify on 18 cases. |
| Tokenizer-accurate budgeting | Correct, at the cost of a model-specific dependency for a ±15% estimate. |

## References

- `scripts/context-pack.mjs` · `tests/properties/context.mjs` · `--eval` table in
  [`context-packing.md`](../agents/context-packing.md)
