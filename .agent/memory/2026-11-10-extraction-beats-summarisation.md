---
date: 2026-11-10
kind: decision
confidence: high
sources: [docs/adr/0017-context-packing.md, scripts/context-pack.mjs, docs/agents/context-packing.md]
---

**Fact.** Without a local model, "semantic summarisation" is either paraphrase-by-hand (not code) or
invention. Packing therefore extracts: sentences scored by IDF-weighted query overlap, kept verbatim in
source order, cited as `file:line`, with ` … ` wherever sentences were skipped.

**Measured.** 400-token packs keep the answering file for **94%** of gold queries and are **~31× smaller**
than sending the top-40 candidates; at 800 tokens coverage is **100%** at 15×.

**Rule.** Never let an extract read as complete text: mark the gaps, and test that the marker appears
exactly when the kept sentences are not contiguous.
