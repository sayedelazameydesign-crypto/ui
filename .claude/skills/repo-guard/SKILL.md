---
name: repo-guard
description: Run the deterministic repository guard and interpret its output before reporting any task as done.
---

# Skill — repo-guard

**When to use:** at the end of *every* task, before committing, and when CI fails on the
`guard` workflow. Deterministic, offline, no installs.

## Procedure

1. Run the guard from the repository root:

   ```bash
   scripts/check-repo.sh
   ```

2. Read the output by section:
   - `1/6 Required governance files` — a missing file is a **blocker**; create it or restore it,
     never bypass the check.
   - `2/6 Secret scan` — **stop immediately** if anything matches. Do not attempt to "clean" a
     committed secret by rewriting history. Report it per `SECURITY.md`.
   - `3/6 JSON validity` — fix the syntax; do not reformat unrelated JSON.
   - `4/6 Relative links` — repair the link target; the message names the source doc and target.
   - `5/6 Agent skills` — every skill needs YAML front matter with `name:` and `description:`.
   - `6/6 Documentation conventions` — bilingual entry points must contain Arabic text;
     the commit-message warning is advisory.
3. Re-run until it exits 0. Warnings may remain only if you state them explicitly in the PR body.
4. Report the **exact** final line of output in your summary — do not paraphrase it as "passed"
   if it did not run.

## Failure handling

| Symptom | Action |
| --- | --- |
| `jq not installed` warning | Acceptable; note it. CI installs jq. |
| Broken link to a file you just renamed | Update the referencing doc in the same commit. |
| Guard fails for reasons outside your diff | Report it; do not "fix" unrelated files. |
| Script itself is buggy | Patch it in a dedicated PR with a test case, not as a side effect. |

## Anti-patterns

- Editing the guard to make a failing check pass.
- Committing with `--no-verify`.
- Claiming the guard passed when it was never executed.
