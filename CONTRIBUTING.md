# Contributing

Applies equally to humans and to AI agents. Agents: read [`AGENTS.md`](AGENTS.md) first — it is
normative and stricter than this file.

## 1. Before you start

| Situation | Do this |
| --- | --- |
| Typo, broken link, small doc fix | Open a PR directly from a `docs/…` branch. |
| Structural change (folders, layers, conventions) | Open an issue first; expect an ADR. |
| New dependency / stack piece | Sanity-check `AGENTS.md` §9 — it is probably an open decision. |
| Security issue | **Not** a public issue — see [`SECURITY.md`](SECURITY.md). |

## 2. Workflow

```bash
git fetch --all --prune
git switch main && git pull
git switch -c feat/my-change        # feat/ fix/ docs/ chore/
# … edit …
scripts/check-repo.sh               # must pass
git add -p                          # stage intentionally, not everything
git commit                          # Conventional Commits
git push -u origin HEAD
gh pr create --fill                 # then complete the template honestly
```

## 3. Commit messages

`<type>(<scope>): <imperative summary>` — subject ≤ 72 chars, body explains **why**.

| Type | Use for |
| --- | --- |
| `feat` | new capability or user-visible behaviour |
| `fix` | corrected behaviour |
| `docs` | documentation only |
| `chore` | maintenance, tooling, config |
| `ci` | workflows |
| `refactor` | no behaviour change |
| `test` | tests only |

Example:

```
docs(agents): add memory retention rule

Memory files were accumulating stale task notes. Add a promotion path
(scratch → memory → ADR) so scratch content is deleted each session.
```

## 4. Pull requests

- Keep it **one concern** and reviewable (~≤400 changed lines). Split larger work.
- Fill the template: what, why, how verified, what remains, risks.
- **State what you did not verify.** Honesty beats a clean-looking report.
- A green `guard` check means conventions hold — it does not mean the change is correct.
- Merging is a human decision; `main` is never written directly.

## 5. Documentation is part of the change

| You changed | Update |
| --- | --- |
| Structure, layers, invariants | [`CONTEXT.md`](CONTEXT.md) |
| Agent rules / boundaries / commands | [`AGENTS.md`](AGENTS.md) |
| User-facing onboarding | [`README.md`](README.md) — **both** Arabic and English sections |
| An expensive-to-reverse decision | new ADR in [`docs/adr/`](docs/adr/) (never edit an accepted one) |
| Capabilities / MCP / memory | [`docs/agents/`](docs/agents/) |

## 6. Style

- Markdown only, wrapped sensibly, `-` bullets, tables for mappings.
- English for machine-facing files; Arabic + English for user-facing content.
- RTL is first-class: no hard-coded `left`/`right` in anything user-visible.
- No secrets, no personal data, no synthetic "proof" (fake screenshots, invented benchmarks).

## 7. Code of conduct

Be direct, be kind, assume good faith, critique the change not the person. Harassment or
dismissive behaviour is not tolerated.
