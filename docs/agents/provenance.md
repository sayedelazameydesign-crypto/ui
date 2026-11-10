# Code Provenance — Who Wrote This Line?

Once a repository accepts AI-written changes, "who authored this?" stops being answerable from
`git blame` alone. This document defines how this repository records **human vs. AI authorship**
and how it is verified.

## 1. The rule

Every commit after the provenance baseline carries **exactly one** authorship trailer:

```
AI-Assisted-By: Arena Agent Mode
```

or, for work written by a person with no model involved:

```
Human-Authored: true
```

Recommended additions:

| Trailer | Meaning | Required |
| --- | --- | --- |
| `AI-Assisted-By: <tool>` | an agent produced or co-authored the change | one of the two |
| `Model: <model-id>` | which model, when it matters | when known |
| `Human-Reviewed-By: @handle` | a person read and accepted the diff | for AI commits — **before merge**; CI warns until it is added |
| `Signed-off-by: Name <email>` | DCO assertion | when `--require-dco` is on |

A commit with **both** `Human-Authored: true` and `AI-Assisted-By:` is contradictory and is treated
as undeclared. Pick one.

## 2. Baseline (grandfathering)

Auditing history retroactively punishes commits that predate the policy. The check therefore starts
at the commit that **introduced this file**:

```
git log --diff-filter=A --format=%H -- docs/agents/provenance.md | tail -1
```

Everything before that commit is out of scope automatically — no rewrite, no blame, no drama.

## 3. Verification

```bash
node scripts/provenance.mjs                          # table for origin/main..HEAD
node scripts/provenance.mjs --json                   # machine-readable, for dashboards
node scripts/provenance.mjs --strict                 # exit 1 on any finding
node scripts/provenance.mjs --range A..B --require-dco
```

CI runs the strict form on every pull request
(`.github/workflows/provenance.yml`) and uploads `provenance.json` as an artifact, so the AI/human
ratio of a release is measurable instead of anecdotal.

`--strict` fails on **undeclared** provenance only. A missing `Human-Reviewed-By:` on an AI commit
is reported as a warning: it is real, but it is a merge gate for a human, not a reason to keep an
agent from opening the PR.

## 4. What this is **not**

- **Not a signature.** Trailers are statements by the author, not cryptographic proof. Real
  attestation needs signed commits (`git commit -S`) and a verifiable identity. Trailer +
  `Human-Reviewed-By` + a reviewed diff is the proportionate control for this repository.
- **Not a licence audit.** Provenance says *who*; licensing says *under what terms*. See
  `.github/workflows/license-compliance.yml` and [ADR-0004](../adr/0004-zero-trust-dependencies.md).
- **Not a quality gate.** AI-authored code is not "less good"; it is *less attributable*. The
  control is review, not prohibition.

## 5. Honest limits

| Limit | Consequence |
| --- | --- |
| A human can forget the trailer | CI fails the PR; the fix is a `git commit --amend`, not a retry |
| An agent can write a false trailer | Review is the real control; trailers are an audit trail, not a guarantee |
| Squash merges flatten trailers | The merge commit body must carry the aggregate attribution |
| Shared machines skew `author` | Attribution comes from trailers, not `%an` |

## 6. Adoption checklist for a new agent

1. Add the trailer to every commit; the local hook `scripts/git-hooks/commit-msg` reminds you.
2. Declare `Model:` when the model is known.
3. Ask a human to add `Human-Reviewed-By:` before the PR is merged — agents must not self-approve.
4. Never edit an existing commit's trailers after review to change who did the work.
