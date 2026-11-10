# Green Builds — Cost-Aware Routing and Caching

CI is the largest avoidable cost and energy draw of a small repository: a documentation typo
should not spin up a container scanner, and a cancelled run should not keep burning minutes.

This document describes what is **implemented** here, and deliberately separates it from what is
only **planned** (because no build system exists yet).

## 1. Implemented today

| Control | Where | Effect |
| --- | --- | --- |
| **Change classification** | `scripts/change-classifier.mjs` | docs-only diffs skip build, scan, and sandbox jobs |
| **Path filters** | `security.yml`, `dependency-audit.yml` | markdown-only pushes do not trigger heavy scanners |
| **Concurrency cancellation** | every workflow | a new push cancels the superseded run — the single biggest saving |
| **Timeouts** | every job (`timeout-minutes`) | a hung job cannot burn the default six-hour budget |
| **Artifact retention** | 7 days (index, preview) / 30 days (reports) | storage does not grow unbounded |
| **No installed dependencies** | by design (L0) | nothing to download, nothing to cache, nothing to keep warm |

### The classifier

```bash
node scripts/change-classifier.mjs --files "README.md,docs/ci/x.md"
#   class      : docs  (docs-only: heavy jobs skipped)

node scripts/change-classifier.mjs --files "scripts/a.mjs"
#   class      : tooling
#   run  build · run  securityScan · run  dependencyAudit · run  semanticIndex · run  propertyTests

node scripts/change-classifier.mjs --github-output    # exports steps to $GITHUB_OUTPUT
```

Every file gets exactly one class (`docs`, `ci`, `tooling`, `data`, `deps`, `code`) — a property
test asserts the partition is total, so a new file type can never fall through unclassified.

## 2. Caching strategy for the future stack

When D1 lands, the cache keys must be **content-addressed, not time-addressed**:

| Layer | Key | Stored by |
| --- | --- | --- |
| package manager | `hashFiles('**/package-lock.json')` | `actions/setup-node` cache |
| compiler / bundler | `hashFiles('src/**', 'package-lock.json')` | framework cache dir (`.next/cache`, `.turbo`) |
| property-test corpus | seed + commit | unnecessary — runs in ~1s |

Rules:

1. **Never cache `node_modules` directly**; cache the package manager's own store.
2. A cache miss must be a performance event, never a correctness event.
3. Caches are scoped per branch for writes, restored across branches for reads.
4. If a cache ever produces a different result on a hit versus a miss, delete the cache — that is a
   correctness bug wearing a performance costume.

## 3. Routing policy (decided, not aspirational)

| Change class | Build | Security scan | Dependency audit | Semantic index | Property tests |
| --- | --- | --- | --- | --- | --- |
| `docs` | skip | skip | skip | run | skip |
| `ci` | run | run | run | run | skip |
| `tooling` | run | run | run | run | run |
| `data` | run | run | run | run | skip |
| `deps` | run | run | run | run | run |
| `code` | run | run | run | run | run |

The conservative direction is explicit: **any doubt resolves to "run"**. Skipping is only allowed
when the classification proves it is safe (`docs_only`), and guard, provenance, and PR hygiene
always run regardless — a broken README should still fail loudly.

## 4. Honest limits

- **No carbon accounting.** Claiming "X grams of CO₂ saved" without a measurement source would be
  fabrication. What is measured is runner-minutes avoided, which is proxy enough to be defensible.
- **No cross-repository cache sharing.** GitHub scopes caches per repository; sharing across repos
  needs an external store and a trust model this project does not have.
- **No spot/preemptible runner routing.** GitHub-hosted runners offer no such control; self-hosted
  routing is a decision for when there is a real workload (D6 territory).
- The savings are small at this size (seconds per run). The value is the **habit and the shape**:
  when the stack arrives, routing is already in place rather than retrofitted.

## 5. How to verify the claim

```bash
node scripts/change-classifier.mjs --files "README.md"      # expect: docs-only, all heavy jobs skipped
node scripts/change-classifier.mjs --files "scripts/x.mjs"  # expect: tooling, all jobs run
node scripts/property-test.mjs --only tooling               # routing invariants, not anecdotes
```
