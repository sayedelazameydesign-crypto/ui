# CLAUDE.md — Claude Code entry point

This file is intentionally thin. There is **one** normative agent charter in this repository:

👉 **[AGENTS.md](AGENTS.md)** — read it in full before acting.

Then:

1. **[CONTEXT.md](CONTEXT.md)** — architecture, invariants, vocabulary (normative).
2. **[docs/agents/permissions.md](docs/agents/permissions.md)** — what you may and may not do.
3. **`scripts/check-repo.sh`** — the guard you must pass before reporting done.

## Repository-specific reminders

- **Baseline state (L0):** no application stack exists yet. Do not scaffold a framework;
  see the open decisions in `AGENTS.md` §9.
- **Never commit to `main`.** Branch → commit → PR. `main` is human-merged only.
- **Never commit secrets.** Configuration comes from the environment.
- **Bilingual product:** user-facing docs and UI copy are Arabic + English with RTL support.
- **Skills available:** `.claude/skills/repo-guard`, `doc-sync`, `security-review`.
- **MCP:** declared in `.mcp.json` without credentials; secrets are injected at runtime.

If instructions here ever conflict with `AGENTS.md`, **`AGENTS.md` wins** — and please open a PR
fixing this file.
