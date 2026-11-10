# Opt-In Local Model Artifacts

The default search path is **offline, deterministic, and model-free**. Neural reranking is available
only by explicit request, with weights the operator verified — and the machinery refuses to pretend
otherwise.

```bash
node scripts/semantic/model.mjs status     # what is declared, what is installed, what is missing
node scripts/semantic/model.mjs verify     # checksum / size / path checks
node scripts/semantic/model.mjs install --from ./model.onnx     # offline, verified
node scripts/semantic/model.mjs install --allow-network         # explicit, pinned only
node scripts/semantic/cli.mjs search "..." --enable-neural-rerank
```

## 1. The three governing constraints (owner decision, 2026-11-10)

| Constraint | Enforced by |
| --- | --- |
| **≤ 100 MiB, quantized only** | `policy.maxBytes` in the manifest, checked at install *and* verify, plus a guard check |
| **Isolated, checksum-verified storage** | `.models/` (git-ignored) + SHA-256 pinned in the manifest + `modelPath()` path isolation |
| **Network off by default** | the default search path never touches this module; installation needs `--from` or an explicit `--allow-network` |

Nothing in CI downloads a model. `check-egress.mjs` allows exactly one host
(`huggingface.co`) for exactly three files, so an accidental import cannot become a silent fetch.

## 2. The manifest is the contract

`scripts/semantic/models.manifest.json` is schema-validated (fail-closed) and is the **only** place a
model may be declared:

```json
{
  "id": "minilm-l6-rerank",
  "role": "rerank",
  "file": "minilm-l6-v2-rerank.onnx",
  "url": "https://huggingface.co/.../model_quantized.onnx",
  "bytes": 22972000,
  "sha256": null,
  "license": "Apache-2.0",
  "runtime": "onnxruntime-node"
}
```

`sha256: null` means **unpinned**, and an unpinned entry is refused at install time. That is not a
placeholder to fill in casually: the checksum is what makes the file trustworthy, and it can only be
pinned by someone who downloaded the artifact and verified it independently.

### How to pin a checksum (operator runbook)

```bash
# 1. Obtain the artifact out-of-band (browser, vendor CDN, colleague) — not through this repo.
sha256sum ./model_quantized.onnx          # macOS: shasum -a 256
stat -c %s ./model_quantized.onnx         # byte size, must be <= 104857600
# 2. Compare against the publisher's published hash, and record who verified it and when.
# 3. Put the digest and byte count in the manifest, then:
node scripts/semantic/model.mjs install --from ./model_quantized.onnx
node scripts/semantic/model.mjs verify
```

If the two hashes disagree, **stop** — do not "fix" the manifest to match the file.

## 3. What is enforced, and what is not

| Enforced | How |
| --- | --- |
| Unpinned entries never install | `assertInstallable()` in `scripts/semantic/model.mjs` |
| Path traversal cannot escape `.models/` | `modelPath()` rejects absolute, nested, or `..` names |
| Oversized artifacts are refused before writing | size check at install and at verify |
| A corrupt or swapped file stops working | SHA-256 compared on every `verify` and on neural search |
| Weights never enter Git | `.gitignore` + guard section 11 |
| The neural path fails loudly, not quietly | `--enable-neural-rerank` throws with the missing reasons |

| Not enforced (stated plainly) | Consequence |
| --- | --- |
| The **runtime** (`onnxruntime-node`) is not installed | neural scoring cannot run yet; the probe reports this honestly |
| The model file is not scanned for malicious content | a checksum proves identity, not safety — provenance matters |
| No sandbox around inference | a hostile model file is an untrusted parser input; run it in a container if that risk matters |
| Nothing prevents a future manifest edit from changing a pinned hash | that is a security-relevant diff and must be reviewed as one |
| `--allow-network` trusts the URL | the URL is pinned in the manifest, but a compromised manifest can point elsewhere |

## 4. The enablement plan (machine-readable)

```bash
node scripts/semantic/model.mjs plan          # four steps, each with its state and next command
node scripts/semantic/model.mjs plan --json   # same, for tooling
node scripts/semantic/model.mjs status --json # artifact + neural availability, machine-readable
```

```
neural rerank enablement plan · not ready

· 1. Pin the artifact checksum — pending
     sha256 is null: download the file out-of-band, compare against the publisher's hash,
     then record it in scripts/semantic/models.manifest.json
     $ sha256sum ./minilm-l6-v2-rerank.onnx
✗ 2. Install the verified weights into storage — blocked
     blocked until the checksum is pinned
· 3. Add the inference runtime — pending
     onnxruntime-node is not installed; adding it is a separate, reviewable dependency decision
     $ npm install --save-dev onnxruntime-node
✗ 4. Measure, then decide — blocked
     run the eval with both rerankers and keep the default only if the numbers justify it
     $ node scripts/semantic/eval.mjs && node scripts/semantic/eval.mjs --rerank
```

The plan is a **pure function** of the manifest and the filesystem, and it is property-tested against
the progression it describes: unpinned blocks installation; once weights verify, the only remaining
blocker is the runtime. A plan that claims "ready" without both is a test failure, not a surprise in
production.

## 5. Why the neural path is still not enabled

Two of the three prerequisites are met by this phase: the **policy** exists and is enforced, and the
**loader** is implemented and tested. What is missing is (a) a pinned checksum — nobody has verified
an artifact in this environment — and (b) the inference runtime, a native dependency that would
change the default install footprint.

That is why the measured `R@1` is still **0.64** over 58 cases, and why the only honest statement about 0.85 is:
*the machinery is ready; the artifact is not.*

## 6. Related decisions

- [ADR-0011](../adr/0011-local-reranker-experiment.md) — the lexical reranker that lost
- [ADR-0013](../adr/0013-opt-in-model-load.md) — this opt-in load policy
- [`data-sovereignty.md`](../security/data-sovereignty.md) — why egress is declared, not implied
