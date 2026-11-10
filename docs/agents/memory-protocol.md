# Memory Protocol — Session Continuity

How an agent persists context across sessions without turning the repository into a junk drawer.

## 1. Three tiers

| Tier | Location | Lifetime | Committed |
| --- | --- | --- | --- |
| **Session scratch** | `.agent/tasks/<yyyy-mm-dd>-<slug>.md` | one session | ❌ gitignored |
| **Durable memory** | `.agent/memory/<yyyy-mm-dd>-<slug>.md` | until superseded | ✅ yes |
| **Normative docs** | `AGENTS.md`, `CONTEXT.md`, `docs/adr/` | permanent | ✅ yes |

**Promotion path:** scratch → reviewed memory → normative doc. Never skip straight from scratch
to an ADR without a human decision.

## 2. What belongs in durable memory

- Non-obvious environment facts (e.g. "CI has no `package.json`; guard runs without installs").
- Gotchas that cost time once and would cost it again.
- Pointers to where a fact lives, not duplicates of the fact.
- Conventions confirmed by a human, with the date and the source.

## 3. What never belongs there

- Secrets, tokens, `.env` values, private URLs.
- Personal or client data.
- Guesses dressed as facts — mark `confidence: low` and state how to verify.
- Task notes, TODOs, or a diary of your session.
- Contradictions of `AGENTS.md` / `CONTEXT.md`.

## 4. Session workflow

1. **Start:** read `AGENTS.md`, `CONTEXT.md`, then the newest files in `.agent/memory/`.
2. **During:** keep running notes in `.agent/tasks/…` (untracked, disposable).
3. **End:** promote at most 1–3 durable facts; delete the rest. Update `CONTEXT.md` if structure
   changed.
4. **Handoff:** the PR body must state what changed, what was verified, what remains, and any
   assumption a fresh session would otherwise have to rediscover.

## 5. Hygiene

- One fact per file; kebab-case names; front matter as in [`.agent/memory/README.md`](../../.agent/memory/README.md).
- Review memory monthly: delete stale entries, supersede rather than append.
- Memory that conflicts with the code is a bug — fix one of them in a PR.

## 6. Memory and the semantic index

Durable memory is **not** in the default retrieval corpus. It is knowledge about sessions, not about
the repository, and notes phrased as instructions ("regenerate the artifacts after staging") read like
documentation and outrank the script they describe. Measured on the 58-case gold set: with memory
indexed, memory notes took rank 1 on two cases — **both wrong** — and appeared in the top 5 of ten.

Nothing is deleted and nothing is hidden: the files stay tracked, and

```bash
node scripts/semantic/cli.mjs index --with-memory   # scope: docs+memory
```

restores the previous behaviour, with the choice recorded inside the index. Policy:
[ADR-0021](../adr/0021-index-scope.md).
