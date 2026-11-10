# 0005 — Artifact storage: LFS for bytes, a manifest for state

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [artifacts policy](../data/artifacts.md), [ADR-0004](0004-zero-trust-dependencies.md)

## Context

Design work and AI tooling both produce non-text files: model weights, embedding matrices, dataset
exports, `.psd` and `.fig` sources. Git handles them badly — every version is stored whole, clones
become slow, and `git diff` becomes useless.

Three failure modes are common:

1. **Blobs in Git history** — a 200 MB file makes the clone slow forever.
2. **Blobs nowhere** — a result cannot be reproduced because the data lives on someone's laptop.
3. **A ledger that lies** — a manifest lists files that are missing, or omits files that exist.

## Decision

Three lanes, one ledger:

- **Text/code** → normal Git.
- **Binary artifacts** → Git LFS, patterns declared in `.gitattributes` before first commit.
- **Derived state** (index, build output) → never committed.

`artifacts.manifest.json` records path, size, SHA-256, and LFS-pointer status for every file under
`data/`, `models/`, `public/`, `assets/`, and `--check` fails the guard on new, changed, or missing
entries. The guard additionally rejects any tracked file > 1 MB that is not an LFS pointer.

## Consequences

**Positive**
- Reproducibility is verifiable from the repository alone, offline.
- Clone size stays bounded; CI checkout stays fast.
- Adding an artifact is an explicit, reviewed act (manifest diff), not an accident.

**Negative**
- Two steps to add a binary (attribute + manifest) — easy to forget, which is exactly why the guard
  catches it.
- LFS quota and bandwidth are real costs on GitHub.
- The manifest must be regenerated after intentional data changes, adding a review step.

**Neutral**
- Manifest is JSON and diffable; hashes are stable across platforms.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| Everything in Git | Clone time and review quality collapse. |
| LFS only, no manifest | LFS tracks bytes, not *state*; drift and omissions stay invisible. |
| DVC / external remote | Stronger model versioning, but adds a tool and a network dependency — revisit when real datasets exist. |
| Naming convention (`file@v2.bin`) | Humans forget; hashes do not. |

## References

- [`docs/data/artifacts.md`](../data/artifacts.md) · `.gitattributes` · `scripts/artifact-manifest.mjs`
