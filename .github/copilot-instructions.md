# GitHub Copilot instructions

The normative agent charter for this repository is **[AGENTS.md](../AGENTS.md)**.
Read it before generating suggestions, code, or pull request text.

## Always

- Follow `AGENTS.md` §2 (non-negotiable rules) and §6 (definition of done).
- Prefer the smallest diff that satisfies the request; keep changes reviewable.
- Write commit messages in Conventional Commits form (`feat(scope): …`).
- Treat `CONTEXT.md` as the source of truth for structure, invariants, and vocabulary.
- Respect the bilingual requirement: user-facing text is Arabic + English, RTL-aware.

## Never

- Suggest committing secrets, `.env` values, tokens, or customer data.
- Suggest pushes to `main`, force-pushes, or history rewrites.
- Invent APIs, benchmarks, screenshots, or "already implemented" claims.
- Add a dependency or scaffold a framework — the stack is an open decision (`AGENTS.md` §9).

## Review tone

When reviewing a pull request, report only findings you can point to in the diff, each with
severity (`blocker` / `warn` / `nit`), file, line, and a concrete fix. If you find nothing
substantive, say so plainly instead of padding the review.
