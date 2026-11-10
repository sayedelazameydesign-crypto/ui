# 0015 — Snapshots for derived state, and a tamper-evident ledger

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [state and rollback](../agents/state-and-rollback.md), [ADR-0005](0005-artifact-storage.md), [ADR-0010](0010-fail-closed-boundaries.md)

## Context

The repository now generates state it cannot cheaply reconstruct: a 480-chunk semantic index, a
quantised playground export, an architecture graph, an artifact manifest. When a change goes wrong, the
failure is not "the source is broken" — Git already covers that — it is **derived state that no longer
matches its source**, which is exactly the class of bug that survives a checkout.

Separately, actions (index rebuilds, restores, model installs) have no history beyond terminal
scrollback. Logs answer "what did the tool print"; nothing answered "what happened to this checkout".

## Decision

1. **Snapshot the derived state, not the source.** `.index/`, `playground/index.json`, the graph and
   the manifest are captured with per-file SHA-256 and the Git tree hash; source stays in Git.
2. **Refuse unsafe restores.** A snapshot whose copies no longer match their hashes is refused; a
   restore into a different Git tree is refused unless `--force`, which is recorded.
3. **Append-only, hash-chained ledger.** `entryHash = sha256(prevHash + canonicalJSON(entry))`, with a
   sequence check, so edits, reordering and middle deletions are detectable.
4. **Anchor the chain.** `ledger anchor` commits the entry count and head hash to a tracked file, so
   truncating the tail is detectable too.
5. **No automatic rollback.** Capture and restore are explicit commands; nothing reverts a working
   tree on its own.

## Consequences

**Positive**
- A failed experiment costs one command, and the restored bytes are verified rather than hoped for.
- The restore guard rejects the subtle mistake — yesterday's index over today's sources.
- Tamper detection is property-tested: edited, reordered and truncated histories all break verification.
- Actions leave a durable, self-verifying trail instead of scrollback.

**Negative**
- Snapshots duplicate derived data on disk (the index is ~1.2 MB; a long session accumulates them;
  `snapshot prune --keep N` exists).
- Capture is not atomic across files: a concurrent write is captured as-is, and the hash then flags it
  rather than silently accepting it.
- The anchor only protects what has been committed; an un-anchored session can end with a shorter chain
  and no proof.
- This is not a distributed log or a state machine — a second machine cannot verify the first.

**Neutral**
- The ledger is local and git-ignored; the anchor is tracked. Both are small.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| `git stash` / branches for everything | Covers tracked files only; derived state is git-ignored by design. |
| Copy the whole repo per snapshot | Hundreds of MB for data Git already stores. |
| SQLite with WAL for the ledger | Better concurrency, one more dependency for a single-writer file. |
| Plain JSONL log (no hashes) | Cannot distinguish "no incidents" from "history edited". |
| Automatic rollback on test failure | Deletes work silently; a human decision is the correct gate. |

## References

- `scripts/snapshot.mjs` · `scripts/ledger.mjs` · `tests/properties/state.mjs` (6 properties)
- [`docs/agents/state-and-rollback.md`](../agents/state-and-rollback.md) · guard §13
