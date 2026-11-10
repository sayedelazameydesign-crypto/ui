---
name: doc-sync
description: Keep README, CONTEXT, AGENTS, and ADRs consistent with the code and with each other after a structural change.
---

# Skill — doc-sync

**When to use:** the change alters folder structure, public behaviour, invariants, vocabulary,
capabilities, or an accepted decision. Documentation is part of the definition of done
(`AGENTS.md` §6) — this skill makes it mechanical.

## Procedure

1. **Diff the structure.** `git diff --stat` and `git status --short`. List added/removed/moved
   paths. Anything that changes the tree shape needs a `CONTEXT.md` §2 layer-table check.
2. **Update the right file — only one source of truth per fact:**

   | Changed | Update |
   | --- | --- |
   | Folder layout, layers, invariants | `CONTEXT.md` (§2, §3) |
   | Agent rules, boundaries, commands | `AGENTS.md` (§2, §4, §7) |
   | Human onboarding, quick commands | `README.md` (AR **and** EN sections) |
   | Expensive-to-reverse decision | new `docs/adr/NNNN-<slug>.md` (never edit an accepted ADR) |
   | Permissions / MCP / memory | `docs/agents/*` |
   | New skill | `.claude/skills/<name>/SKILL.md` + mention in `AGENTS.md` §8 |

3. **Bilingual check.** Every human-facing change lands in both the Arabic and English sections
   of `README.md`. Machine-facing files stay English; keep the Arabic summary block at the top.
4. **Cross-reference check.** `scripts/check-repo.sh` validates relative links; run it.
5. **ADR format:** `# NNNN — Title` · `Status` (proposed/accepted/superseded) · `Context` ·
   `Decision` · `Consequences` · `Alternatives considered`. Number sequentially; never renumber.
6. **State what you did not verify** in the PR body (e.g. rendering, accessibility).

## Anti-patterns

- Duplicating the same fact in two files without a link.
- Editing an accepted ADR to match new behaviour — supersede it with a new one.
- Describing intent as if it were implemented.
