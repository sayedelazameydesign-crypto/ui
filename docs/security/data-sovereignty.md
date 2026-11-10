# Data Sovereignty & Fail-Closed Boundaries

Two promises are cheap to make and expensive to keep: *"no data leaves this machine"* and *"invalid
input is rejected"*. This document describes how both are enforced **mechanically**, and exactly
where the guarantees stop.

## 1. Declared egress

`scripts/check-egress.mjs` scans every tracked text file for `http(s)://` destinations and compares
them against an allowlist that requires, per host, **a reason** and — where appropriate — **the only
files allowed to mention it**.

```bash
node scripts/check-egress.mjs          # fails on any undeclared host
node scripts/check-egress.mjs --list   # the current contract
```

| Host | Scope | Why |
| --- | --- | --- |
| `github.com` | any file | canonical links and CI badges (read-only) |
| `raw.githubusercontent.com` | `.devcontainer/` | devcontainer JSON schema |
| `modelcontextprotocol.io` | `.mcp.json` | MCP `$schema` documentation |
| `api.githubcopilot.com` | `.mcp.json` | MCP endpoint; token injected at runtime |
| `mcr.microsoft.com`, `ghcr.io` | `.devcontainer/` | base image and features |
| `api.openai.com` | `scripts/semantic/lib.mjs` | **opt-in** embeddings; refuses without a key, never used by CI |
| `127.0.0.1` | mock server + its workflow | loopback only |
| `huggingface.co` | model loader + manifest + local-model doc | **opt-in weights only**: `--allow-network` plus a pinned checksum; never in CI |
| `git-lfs.github.com` | `scripts/artifact-manifest.mjs` | LFS pointer format string, not a request |
| `collect.example.net` | `tests/adversarial/cases.json` | an attack fixture the scanner must flag; never fetched |
| `example.com` | `tests/adversarial/cases.json` | a data-carrying markdown link in the same fixture; never fetched |
| `www.apache.org` | `LICENSE`, `NOTICE` | the canonical licence reference, as text; never requested |

Adding a destination is a code change with a written reason — reviewed like any other. A new URL
that appears by accident fails the guard, so "we would never send data there" becomes a check
instead of a promise.

## 2. Fail-closed validation

`scripts/validate-json.mjs` validates every structural file against an explicit schema with
**unknown keys rejected** (`.mcp.json`, `artifacts.manifest.json`, `docs/architecture/graph.json`,
`tests/semantic-gold.json`). Validation is closed at every level, including inside map-style objects
such as `mcpServers`:

```
$.mcpServers.github.unexpectedField: unknown key (fail-closed — add it to the schema or remove it)
$.mcpServers.github.type: expected one of [stdio, http, sse], got "carrier-pigeon"
```

Why closed rather than open: a typo in a security-relevant config (`url` → `uurl`, `headers` →
`header`) is silently ignored by permissive validators, and a server then loads with defaults nobody
reviewed. Errors carry a JSON path, so the message points at the key, not at the file.

## 3. Where data can move today

| Boundary | Direction | Control |
| --- | --- | --- |
| Repository → developer machine | in | `git clone`, no telemetry |
| Developer → repository | in | pre-commit PII/secret scan ([`pii-guard.md`](pii-guard.md)) |
| Tooling → network | **none by default** | all scripts are offline; egress allowlist |
| CI → GitHub APIs | metadata only | explicit `permissions:` per workflow |
| Agent → MCP server | declared endpoints only | `.mcp.json` + `mcp-policy.md` |
| Artifacts → storage | Git LFS | `.gitattributes` + hashed manifest |
| Model weights → disk | in (opt-in) | `.models/` (git-ignored) + SHA-256 pinned in the manifest; unpinned means unusable |

## 4. Arabic and local-context considerations

- **Language is not a reason to leave the machine.** The retrieval layer normalises Arabic
  (diacritics, alef forms, definite article) and expands queries through a **local** glossary rather
  than calling a translation API — the Arabic capability adds no egress.
- **No cloud NLP by default.** Any Arabic-language model use is an explicit, declared decision, not
  a side effect of installing a library.
- **Residency expectations.** If client data from a regulated market ever enters this repository, the
  relevant requirement is a *region-scoped* store; the allowlist and the artifact ledger are the two
  places that decision must be recorded.

## 5. What is **not** covered

| Gap | Risk | Mitigation path |
| --- | --- | --- |
| PII detection exists, classification does not | a pasted address or phone number is caught; a person's name in prose or in a screenshot is not | [`pii-guard.md`](pii-guard.md) — patterns at the commit boundary, no data inventory or retention policy |
| No key management | secrets live in the environment, not in a vault | adopt a vault when a service exists |
| Devcontainer network policy is advisory | the container can reach the internet unless Docker restricts it | enforce with `--network=none` for offline tasks |
| Allowlist is textual, not runtime-enforced | a script could build a URL at runtime | review + `code-review` skill; a proxy is the next real control |
| No penetration testing | unknown unknowns | out of scope for a solo practice at L0 |
| Logs may contain paths | minor information disclosure | never log request bodies; audit logging arrives with a service |

## 6. Reporting

A sovereignty violation (undeclared egress, secret exposure, validation bypass) is a security issue:
report it privately per [`SECURITY.md`](../../SECURITY.md) rather than opening a public issue.
