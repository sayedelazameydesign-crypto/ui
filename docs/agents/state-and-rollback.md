# State, snapshots, and the audit ledger

Two mechanisms, one goal: after something goes wrong, the repository can say **what happened** and
return to **exactly** a previous state — or refuse, loudly, when returning is the wrong move.

```bash
node scripts/snapshot.mjs save --label "before refactor"   # capture derived state
node scripts/snapshot.mjs list                            # what exists, verified on the spot
node scripts/snapshot.mjs verify [id]                     # hashes of every captured file
node scripts/snapshot.mjs restore <id> [--force]          # byte-identical rollback

node scripts/ledger.mjs verify                            # is the audit chain intact?
node scripts/ledger.mjs tail -n 10                         # what happened recently
node scripts/ledger.mjs anchor                             # commit the chain head to git
```

## 1. What is snapshotted, and what is not

| Captured | Why |
| --- | --- |
| `.index/semantic.json` | derived: expensive to rebuild, impossible to reconstruct byte-for-byte |
| `playground/index.json` | derived export; the demo is wrong if it drifts |
| `docs/architecture/graph.json` + `.md` | generated documentation |
| `artifacts.manifest.json` | generated ledger of data files |

**Not captured: source code.** Git already versions it, better and faster. Copying it here would be a
slower `git checkout` that invites people to restore hand-written code from a JSON directory.

## 2. Rollback is guarded, not automatic

Three conditions must hold before a single byte is written back:

1. **The snapshot agrees with itself.** Every captured file's SHA-256 is recorded; a copy altered on
   disk is refused, never restored over live state.
2. **The Git tree still matches.** Restoring yesterday's index into today's sources produces a state
   that never existed — the opposite of recovery. `--force` exists for the deliberate case, and it is
   recorded in the ledger as `forced: true`.
3. **The audit chain is intact.** A broken ledger means history is untrustworthy; the restore stops.

If any check fails, nothing is written and the reason is printed.

## 3. The ledger is tamper-evident, not tamper-proof

Each entry commits to the previous one:

```
entryHash = sha256(prevHash + canonicalJSON(entry))
```

Canonical JSON sorts keys, so the hash does not depend on key order. Editing an entry, reordering
entries, or deleting one from the middle breaks every later hash and the sequence check.

**What that does not cover.** A hash chain cannot prove it was not *truncated*: dropping the last N
entries leaves a shorter, internally consistent chain. The anchor closes that hole — `ledger anchor`
writes the entry count and head hash to `.agent/ledger.anchor.json` (tracked by Git), and `verify`
refuses to go below it. The anchor is a commitment, so it is only as trustworthy as the commit that
carries it.

| Property | Mechanism | Residual risk |
| --- | --- | --- |
| Entry edited in place | content hash mismatch | — |
| Entry removed from the middle | `seq` gap + `prev` mismatch | — |
| Entries appended (normal) | chain verifies | — |
| Tail truncated | anchor (count + head hash) | only as current as the last anchor commit |
| Ledger deleted entirely | guard warns; anchor file survives in Git | detection depends on the anchor being committed |
| Someone with write access rewrites *and* re-anchors | nothing | that is a compromised account, not a ledger bug |

## 4. Enforced in the guard

`check-repo.sh` §13 runs `snapshot verify` over existing snapshots and `ledger verify` when a ledger
exists. The ledger is local runtime state (git-ignored); the anchor is tracked.

## 5. Honest limits

- **Snapshot capture is not atomic across files.** A file written while a snapshot is taken can be
  captured mid-change; the hash still detects it, but the snapshot is not a transaction.
- **No automatic rollback.** A failing test does not revert anything: a human (or an agent deciding
  deliberately) runs `restore`. Automatic reverting of a working tree is how unreviewed work
  disappears.
- **No state machine.** This is snapshot/restore, not a versioned state graph with branches and merges.
- **The ledger is per-machine.** It records this checkout's actions; it is not a distributed log.
