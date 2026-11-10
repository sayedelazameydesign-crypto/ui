# Durable agent memory

Reviewed, sanitised knowledge that should survive sessions. One fact per file, kebab-case,
front matter required.

```
memory/
├── 2026-11-10-baseline-is-governance-only.md
└── <yyyy-mm-dd>-<slug>.md
```

## File template

```markdown
---
date: 2026-11-10
kind: decision | gotcha | convention | environment
confidence: high | medium | low
sources: [CONTEXT.md, docs/adr/0001-agentic-first-baseline.md]
---

**Fact.** One sentence.

**Why it matters.** Consequence for future work.

**How to verify.** A command or a file to read.
```

## Rules

- No secrets, tokens, personal data, or client-confidential details — this folder is public.
- No speculation: if `confidence` is not `high`, say what would raise it.
- Memory never overrides `AGENTS.md` or `CONTEXT.md`; if it conflicts, the docs win and the
  memory file is corrected or deleted.
- Prune stale entries instead of accumulating them.

See [memory protocol](../../docs/agents/memory-protocol.md).
