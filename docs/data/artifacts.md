# Artifacts & Dataset State

Large binaries — model weights, embeddings, datasets, design source files — do not belong in a
Git object database, and they must not be invisible either. This document defines where they live,
how they are referenced, and how reproducibility is proven.

## 1. The rule of three lanes

| Lane | What | Where | Tracked how |
| --- | --- | --- | --- |
| **Code & text** | source, docs, configs | repository | normal Git |
| **Binary artifacts** | weights, `.parquet`, `.psd`, `.fig`, video | Git LFS | pointer file (134 bytes) |
| **Derived state** | semantic index, build output | local / CI artifact | never committed |

A file enters the binary lane only if it is **large, non-diffable, and needed to reproduce a
result**. Everything else stays in Git.

## 2. Git LFS configuration

`.gitattributes` declares the tracked patterns (`*.bin`, `*.onnx`, `*.safetensors`, `*.parquet`,
`*.psd`, `*.fig`, …). The order of operations matters:

```bash
git lfs install                       # once per machine
# add the extension to .gitattributes BEFORE the first commit of that type
git add models/encoder.onnx           # stored as a pointer, bytes go to LFS
```

If a binary is committed without LFS, the guard fails on the size rule (§4) — the fix is
`git lfs migrate import --include="<pattern>"` in a dedicated PR, never a silent force-push.

## 3. Dataset state (`artifacts.manifest.json`)

The manifest is the *ledger* of artifact state: path, byte size, SHA-256, and whether the entry is
an LFS pointer. It is committed, so a checkout at commit `N` can be verified against the data that
produced result `N`.

```bash
node scripts/artifact-manifest.mjs            # what is here now
node scripts/artifact-manifest.mjs --write    # regenerate after an intentional data change
node scripts/artifact-manifest.mjs --check    # fail on drift (guard + CI run this)
```

`--check` catches three failure modes that Git alone cannot:

1. **New artifact** added but not declared → the ledger is incomplete.
2. **Content drift** — same path, different bytes → results are no longer reproducible.
3. **Missing artifact** — declared but absent → a checkout is silently incomplete.

At L0 the manifest is empty (`entries: []`) because no data exists yet. The tooling is verified:
adding, tampering with, and deleting a file each produce the expected failure.

## 4. Guard rules

| Rule | Why |
| --- | --- |
| No tracked file > 1 MB unless it is an LFS pointer | keeps clone size and CI checkout time honest |
| `artifacts.manifest.json` must match disk | reproducibility with no silent drift |
| LFS patterns live in `.gitattributes`, not in docs | one source of truth |

## 5. Honest limits

- The manifest records **what**, not **why**: provenance of a dataset (who collected it, under what
  consent) needs a second document when real data arrives.
- SHA-256 over a plain file is not a signature; it detects accidents, not sabotage.
- Git LFS has quota and bandwidth costs on GitHub — the size rule exists partly to keep those
  predictable.
- There is no automatic retention policy yet; add one before the first multi-hundred-MB artifact.

## 6. When this changes

If the practice moves to a dataset registry (Hugging Face datasets, DVC remote, or an object store),
keep `artifacts.manifest.json` as the pointer ledger and record the remote URI per entry. The guard
rules and the `--check` contract stay valid.
