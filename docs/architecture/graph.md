# Architecture Graph

> **Generated file — do not edit by hand.**
> Regenerate with `node scripts/architecture-graph.mjs --write`.
> `guard` and the `architecture` workflow fail when this file is stale.

**78 tracked files · 16 components · 22 directed links**

## Component map

```mermaid
graph LR
  root["Root docs & config"]
  agent_harness["Agent harness (.agent)"]
  skills["Agent skills (.claude/skills)"]
  workflows["CI workflows"]
  github_config["GitHub config & templates"]
  sandbox["Dev container"]
  adr["Decision records"]
  docs_agents["Agent docs"]
  docs_ci["CI docs"]
  docs_data["Data docs"]
  docs_arch["Architecture docs"]
  semantic["Semantic engine"]
  tooling_lib["Tooling library"]
  scripts["Repository scripts"]
  tests["Property tests"]
  mocks["Service mocks"]
  adr -->|6| docs_agents
  adr -->|3| docs_arch
  adr -->|4| docs_ci
  adr -->|2| docs_data
  adr -->|5| root
  agent_harness -->|4| docs_agents
  agent_harness -->|1| root
  docs_agents -->|1| adr
  docs_agents -->|2| agent_harness
  docs_agents -->|2| root
  github_config -->|1| root
  root -->|18| adr
  root -->|4| agent_harness
  root -->|29| docs_agents
  root -->|3| docs_arch
  root -->|8| docs_ci
  root -->|4| docs_data
  root -->|2| scripts
  scripts -->|1| tooling_lib
  tests -->|1| scripts
  tests -->|1| semantic
  tests -->|2| tooling_lib
```

## Components

| Component | Files |
| --- | --- |
| `github-config` — GitHub config & templates | 17 |
| `scripts` — Repository scripts | 14 |
| `root` — Root docs & config | 11 |
| `workflows` — CI workflows | 10 |
| `adr` — Decision records | 8 |
| `agent-harness` — Agent harness (.agent) | 7 |
| `docs-agents` — Agent docs | 5 |
| `skills` — Agent skills (.claude/skills) | 4 |
| `docs-arch` — Architecture docs | 3 |
| `docs-ci` — CI docs | 3 |
| `mocks` — Service mocks | 2 |
| `semantic` — Semantic engine | 2 |
| `tests` — Property tests | 2 |
| `docs-data` — Data docs | 1 |
| `sandbox` — Dev container | 1 |
| `tooling-lib` — Tooling library | 1 |

## Heaviest links

| From | To | References |
| --- | --- | --- |
| `root` | `docs-agents` | 29 |
| `root` | `adr` | 18 |
| `root` | `docs-ci` | 8 |
| `adr` | `docs-agents` | 6 |
| `adr` | `root` | 5 |
| `adr` | `docs-ci` | 4 |
| `agent-harness` | `docs-agents` | 4 |
| `root` | `agent-harness` | 4 |
| `root` | `docs-data` | 4 |
| `adr` | `docs-arch` | 3 |
| `root` | `docs-arch` | 3 |
| `adr` | `docs-data` | 2 |
| `docs-agents` | `agent-harness` | 2 |
| `docs-agents` | `root` | 2 |
| `root` | `scripts` | 2 |

## How this stays alive

1. The graph is derived from the files that exist — links and imports, nothing invented.
2. `--check` compares the committed output to a fresh render, byte for byte.
3. Structural changes therefore cannot land without updating the picture (no doc drift).
