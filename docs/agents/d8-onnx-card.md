# The D8 Card — What a Cross-Encoder Would Actually Cost

> **Status: closed.** The owner reviewed this card and closed D8 as a numeric target under the current
> constraints — [ADR-0023](../adr/0023-close-d8.md). It is kept because the *pricing* is what makes the
> closure defensible, and because reopening needs these numbers, not a new opinion.

Decision **D8** asked whether to add a neural reranker to reach R@1 ≥ 0.85. This is the approval card the
owner asked for: **research only**. Nothing here is installed, downloaded, or approved; there are no
weights in the repository and no dependency in any manifest. Every figure is labelled either
**verified** (read from a registry or model index on 2026-11-10) or **estimate** (derived, assumption
stated).

## 1. The finding that reframes D8

> `onnxruntime-node` is **307,626,018 bytes unpacked** (verified, MIT, 3 direct dependencies, one
> `postinstall` that extracts native binaries). The smallest credible cross-encoder is **23 MB**. The
> runtime is **13× the model**.

So D8 is a **runtime decision** before it is a model decision, and the 100 MiB artifact ceiling
(ADR-0013) governs the cheap half. The second finding points the same way from the other side: after
Path B was measured and exhausted (ADR-0022), the missing rank-1 hits turned out to be lost in
**ordering**, not recall — the answer is already inside the top-20 for 57 of 58 cases.

## 2. What the repository already declares

`scripts/semantic/models.manifest.json` carries one entry, written when the loader was built:

| field | declared | reality (verified 2026-11-10) |
| --- | --- | --- |
| name | `ms-marco-MiniLM-L-6-v2 (int8 quantized, ONNX)` | correct model family |
| url | `huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2/resolve/main/onnx/model_quantized.onnx` | file exists; **community mirror**, not the author's repo |
| bytes | 22,972,000 | **23,143,499** (+0.75 %) — the manifest calls it an estimate |
| sha256 | `null` | still `null`, so the loader **refuses** the entry by design |
| license | `Apache-2.0` | correct for the weights and for the mirror |
| runtime | `onnxruntime-node` | correct name; the cost was never priced |
| maxTokens | 256 | reasonable (the model accepts 512) |

The official author repository publishes its own int8 ONNX at **23,200,716 bytes**
(`onnx/model_qint8_avx512.onnx`, `model_qint8_arm64.onnx`, `model_quint8_avx2.onnx` share one object id —
one file under three architecture-specific names). If this ever proceeds, pin the **author's** file, with
the CPU features the verifying machine actually has, and take `bytes` from the file, not from the
estimate.

## 3. Runtime card — ONNX Runtime

| | `onnxruntime-node@1.31.1` | `onnxruntime-web@1.31.1` |
| --- | --- | --- |
| Licence | MIT | MIT |
| Unpacked size (verified, npm registry) | **307,626,018 B (~293 MiB)** | **150,622,959 B (~144 MiB)** |
| Direct dependencies | `adm-zip ^0.6.0`, `global-agent ^4.1.3`, `onnxruntime-common 1.31.1` | `long`, `platform`, `protobufjs`, `flatbuffers`, `guid-typescript`, `onnxruntime-common` (6) |
| Install hooks | **`postinstall: node ./script/install`** (extracts binaries with `adm-zip`) | none |
| Platforms | `win32`, `darwin`, `linux` | any (WASM) |
| `engines` | not declared | not declared |

In this repository's terms: ADR-0004 treats install hooks as a reviewable risk, and `global-agent` reads
proxy environment configuration at import time. 293 MiB is 2.9× the weight ceiling — it passes the
*letter* of the policy (which governs weights, not `node_modules`) while dwarfing its intent. The guard
must never install it; an experiment belongs in a manual workflow, not per-PR CI.

## 4. Candidates (verified from the model index)

| # | Model | Licence | Params | Languages | ONNX shipped | int8 file |
| --- | --- | --- | --- | --- | --- | --- |
| A | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Apache-2.0 | 22.7 M | **en** | yes | **23.2 MB** |
| B | `jinaai/jina-reranker-v1-turbo-en` | Apache-2.0 | 37.8 M | **en** | yes | **38.3 MB** |
| C | `Alibaba-NLP/gte-multilingual-reranker-base` | Apache-2.0 | 306.0 M | 80+, incl. **ar/fa** | **no** | — (fp16 ≈ 612 MB) |
| D | `BAAI/bge-reranker-v2-m3` | Apache-2.0 | 567.8 M | multilingual | **no** | — (fp32 ≈ 2.27 GB) |
| — | `jinaai/jina-reranker-v2-base-multilingual` | **CC-BY-NC-4.0** | 278.4 M | multilingual | yes | 278 MB |

Three vetoes, each sufficient on its own:

- **Licence.** The one multilingual model that ships ONNX int8 is **CC-BY-NC-4.0** (non-commercial). The
  convenient option is the forbidden one.
- **Size.** C and D are 306 M and 568 M parameters: 3× to 6× the 100 MiB ceiling even quantized, so
  adopting them amends the artifact policy first.
- **Capability.** A and B are English-only. On the 15 Arabic gold cases they must be gated off (no gain)
  or run anyway (an English model reordering Arabic results).

## 5. Hidden work the card must include

1. **Tokenizer.** BERT WordPiece for A/B: `tokenizer.json` is parseable with local code (a few hundred
   lines, property-tested) or you add `@huggingface/transformers` — a *second* large dependency.
2. **Plumbing.** `input_ids` / `attention_mask` / `token_type_ids`, fixed-length padding, batching.
   Silent shape bugs produce plausible-looking scores.
3. **Output.** One logit per pair; a stable sort with a deterministic tiebreak, because determinism is a
   guarantee the current engine keeps.
4. **Caching.** Without an LRU keyed by (query, chunk), one eval run pays 58 × 20 = 1,160 forward passes.
5. **Configuration.** Top-K window (`RERANK_TOP = 20`), a per-language policy, and a refusal — not a
   silent downgrade — when weights are absent (ADR-0013).

Estimate: 400–700 lines including tests. Days, not hours.

## 6. What "0.85" requires — and the correction this card owes

50 of 58 cases at rank 1. **An earlier draft of this section claimed the ceiling of a top-20 re-scorer
was R@5 = 0.776. That was wrong by twelve cases.** Measured (705 chunks, `k = 200`):

| Cut | R@k | Cases |
| --- | --- | --- |
| R@1 | 0.621 | 36/58 |
| R@3 | 0.759 | 44/58 |
| R@5 | 0.776 | 45/58 |
| R@10 | 0.879 | 51/58 |
| R@20 | **0.983** | **57/58** |
| R@50 | 0.983 | 57/58 |
| R@100 | 1.000 | 58/58 |

A perfect re-scorer over the existing top-20 is bounded by **0.983**, not 0.776, so 0.85 is arithmetically
reachable without touching retrieval depth. Widening the window still buys nothing (R@20 = R@50); the one
case outside it (`guard-ar`) sits at rank 90.

What Path B measured on the same corpus (ADR-0022): a 27-config chunk-window grid spans R@1 0.552–0.690
with no plateau, and file-level aggregation reads 0.638 / 0.586 / 0.310. **Retrieval tuning is
exhausted; ordering is the remaining lever.**

## 7. Measurement design (if approved)

Pre-registered, so a disappointing result cannot be re-blessed afterwards.

1. **Fixed inputs.** Index at a pinned commit, scope `docs`, gold set unchanged, one machine for both arms.
2. **Arms.** `deterministic` (today's fused order) vs `deterministic + rerank@20`, model A first.
3. **Metrics.** R@1, R@3, MRR for all/en/ar/v1/v2; per-case ranks in both arms; a **flips matrix**
   (fixed vs broken), not just averages.
4. **Statistics.** One case = 1.7 points, so: exact **McNemar** on rank-1 correctness, a paired bootstrap
   over cases (10,000 resamples, fixed seed) for MRR, and the flip list in the PR body.
5. **Cost metrics.** Model load time, rerank p50/p95, peak RSS, eval wall time, artifact bytes and sha256.
6. **Acceptance thresholds.** Arabic R@1 must not fall below 0.467; overall R@1 must rise ≥ 3 cases with
   McNemar p < 0.05 *or* a flip list showing no compensating losses; MRR +0.02; p95 ≤ 300 ms/query;
   reranking off by default; weights pinned; unpinned weights refused; no network at inference.
7. **Outcome policy.** Pass → opt-in flag, CI stays deterministic. Fail → an ADR recording a negative
   result (the ADR-0011 pattern) and no dependency.

## 8. Governance checklist

- [ ] Runtime licence and install hooks reviewed under ADR-0004; entry in `dependency-audit.mjs`.
- [ ] Weights pinned by sha256; `bytes` from the verified file; URL at the **author's** repository.
- [ ] `maxBytes` respected, or an ADR supersedes it.
- [ ] No automatic download; `--allow-network` required; refusal when absent.
- [ ] CI never installs the runtime; the experiment runs in a manual workflow.
- [ ] Determinism: two eval runs produce identical per-case ranks.
- [ ] No egress: queries and passages are processed locally. (Hosted rerank APIs are out of scope.)

## 9. Options, and the recommendation

| Option | Cost | Question it answers |
| --- | --- | --- |
| **A. Bounded experiment** (model A, English-gated, manual workflow) | ~1 day, 293 MiB runtime in a throwaway branch, 23 MB weights | whether an English re-scorer is worth a runtime 13× the model |
| **B. Deterministic path** | no dependencies | **measured and exhausted** (ADR-0022): chunking, path weighting and window widening all fail to move the metric |
| **C. Multilingual now** (C or D) | policy amendment + Python export + >300 MB weights | a product decision about Arabic quality, not an engineering one |

**Resolved (owner decision, [ADR-0023](../adr/0023-close-d8.md)):** B is done and did not work; **C is
rejected** (non-commercial licence on the only multilingual int8 ONNX, and a runtime that contradicts the
size ceiling); **A is rejected** because English-only reranking would serve 43 cases and leave the 15
Arabic ones unreranked — a parity break, not a trade-off. **D8 is closed**, and the gate floors
(R@1 ≥ 0.60 · R@3 ≥ 0.72 · MRR ≥ 0.66) are the standard. Reopening requires a new *constraint* — a
licence-clean multilingual ONNX from its author, ≤ 100 MiB, carried by a runtime of a small fraction of
that size — not a new experiment.

## 10. Open questions (owner)

1. Is **Arabic** quality a product requirement or a courtesy? It decides whether English-only models are
   candidates at all.
2. Is the **100 MiB** ceiling still the intent, or should it be revisited before a model is chosen?
3. Is a **293 MiB** runtime acceptable in a repository with no `package.json` and no dependencies today?
   If not, D8 is not achievable with a local cross-encoder, and that should be written down as the answer.

## 11. Sources

| Read on 2026-11-10 | What was taken |
| --- | --- |
| `registry.npmjs.org/onnxruntime-node`, `…/onnxruntime-web` | version, MIT, unpacked sizes, dependencies, `postinstall` |
| `huggingface.co/api/models/cross-encoder/ms-marco-MiniLM-L-6-v2` (+ onnx tree) | Apache-2.0, 22.7 M params, English, official ONNX sizes |
| `…/api/models/Xenova/ms-marco-MiniLM-L-6-v2/tree/main/onnx` | the file the manifest URL points at: 23,143,499 B |
| `…/api/models/jinaai/jina-reranker-v1-turbo-en` (+ onnx tree) | Apache-2.0, 37.8 M, English, int8 38,295,104 B |
| `…/api/models/Alibaba-NLP/gte-multilingual-reranker-base` | Apache-2.0, 306 M, ar/fa, no ONNX, custom code |
| `…/api/models/BAAI/bge-reranker-v2-m3` | Apache-2.0, 568 M, no ONNX |
| `…/api/models/jinaai/jina-reranker-v2-base-multilingual` | **CC-BY-NC-4.0** — licence veto |
| this repository | `models.manifest.json`, `model.mjs` policy, ADR-0011/0013/0018/0022, measured rank distribution |
