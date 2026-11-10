# 0010 — Fail-closed boundaries and declared egress

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —
- **Related:** [data sovereignty](../security/data-sovereignty.md), [ADR-0004](0004-zero-trust-dependencies.md), [ADR-0006](0006-testing-strategy.md)

## Context

Two classes of failure do not announce themselves:

1. **Config drift that fails open.** A typo in `.mcp.json` (`url` → `uurl`, a misspelled `headers`)
   is accepted by permissive validators; the server starts with defaults nobody reviewed. The
   failure is silent until it matters.
2. **Undeclared egress.** A helper script, a dependency, or a copy-pasted example introduces a URL.
   Nothing in the repository notices, and "we don't send data anywhere" remains a belief.

Both are *design* problems rather than bugs: the system has no boundary that rejects the unexpected.
Defence-in-depth requires the boundary to default to **no**.

## Decision

1. **Schema validation is closed by default.** `scripts/lib/schema.mjs` + `scripts/validate-json.mjs`
   validate `.mcp.json`, `artifacts.manifest.json`, `docs/architecture/graph.json`, and
   `tests/semantic-gold.json`. Unknown keys are errors with a JSON path, at every level — including
   inside map-style objects such as `mcpServers`.
2. **Egress is an allowlist with reasons.** `scripts/check-egress.mjs` fails on any `http(s)://`
   destination not declared with (a) a justification and (b) the files permitted to mention it.
   Loopback is declared separately from the internet.
3. **Both run in the guard**, so they are enforced locally and in CI by the same code path a
   contributor runs.
4. **Local-first stays the default.** The only internet-capable code path is the opt-in embedding
   provider, which is restricted to one file and refuses to run without an explicit key.

## Consequences

**Positive**
- Config typos fail loudly, with the offending key named.
- Adding a new external service requires a reviewed change to the allowlist — a natural forcing
  function for a data-handling decision.
- The guarantees are testable: both checks have negative tests (a probe URL, an injected key).
- Nothing new to install; the validator is ~90 lines and readable in one sitting.

**Negative**
- Closed schemas add friction: every new field needs a schema edit.
- The allowlist is textual; a URL assembled at runtime would evade it (documented gap).
- Guard runtime grows slightly (sub-second).
- Schema drift between the validator and real-world specs is possible; the schemas here cover only
  the fields this repository actually uses.

**Neutral**
- Both checks are language-agnostic and will keep working when the application stack arrives.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| JSON Schema library (ajv) | Correct and complete, but adds a dependency tree to validate dependency policy. |
| Permissive validation + warnings | Warnings are ignored; the failure mode is exactly the silent one. |
| Network egress proxy | The real enforcement layer, but needs infrastructure; the allowlist is the intent, a proxy is the runtime control. |
| Rely on review | Review is necessary, not sufficient — a reviewer cannot grep for every new host. |

## References

- [`docs/security/data-sovereignty.md`](../security/data-sovereignty.md)
- `scripts/lib/schema.mjs` · `scripts/validate-json.mjs` · `scripts/check-egress.mjs`
