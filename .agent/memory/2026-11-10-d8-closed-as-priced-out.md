---
date: 2026-11-10
kind: decision
confidence: high
sources: [docs/adr/0023-close-d8.md, docs/agents/d8-onnx-card.md, docs/agents/retrieval-quality.md]
---

**Fact.** Decision D8 (R@1 ≥ 0.85 via a neural cross-encoder) is **closed**, not deferred. The owner
closed it after the card priced the path: a 307,626,018-byte runtime to carry a 23 MB model (13×), the
only multilingual int8 ONNX cross-encoder licensed CC-BY-NC-4.0, Apache-2.0 multilingual candidates that
ship no ONNX and exceed the 100 MiB ceiling by 3–6×, and an English-only re-scorer that would leave 15 of
58 gold cases (all Arabic) unserved.

**What replaces the target.** The gate floors — R@1 ≥ 0.60 · R@3 ≥ 0.72 · MRR ≥ 0.66 against a measured
band of 0.62–0.66 / 0.74–0.76 / 0.67–0.70 — are the standard, ratcheting upward only.

**Reopening rule.** A new *constraint*, not a new sweep: licence-clean multilingual ONNX published by
the author, ≤ 100 MiB quantized, carried by a runtime that is a small fraction of the weights
(target ≤ 25 MiB). Then use the card's §7 pre-registered measurement, not a fresh grid search.

**Why it matters.** An open decision that cannot be met quietly becomes a licence for endless
re-measurement. Closing it converts a wish into a stated limit — and keeps the zero-dependency property.

**How to verify.** `node scripts/semantic/model.mjs status` (declares the path, refuses it: unpinned) ·
`bash scripts/check-repo.sh` (gate at 0.60 / 0.72 / 0.66).
