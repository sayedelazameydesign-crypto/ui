# Architecture Graph

> **Generated file — do not edit by hand.**
> Regenerate with `node scripts/architecture-graph.mjs --write`.
> `guard` and the `architecture` workflow fail when this file is stale.

**146 tracked files · 16 components · 32 directed links**

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
  adr -->|26| docs_agents
  adr -->|3| docs_arch
  adr -->|4| docs_ci
  adr -->|2| docs_data
  adr -->|8| other
  adr -->|5| root
  agent_harness -->|4| docs_agents
  agent_harness -->|1| root
  docs_agents -->|11| adr
  docs_agents -->|2| agent_harness
  docs_agents -->|3| other
  docs_agents -->|2| root
  docs_agents -->|1| tests
  github_config -->|1| root
  other -->|2| adr
  other -->|2| docs_agents
  other -->|1| root
  other -->|1| semantic
  root -->|65| adr
  root -->|4| agent_harness
  root -->|37| docs_agents
  root -->|3| docs_arch
  root -->|8| docs_ci
  root -->|4| docs_data
  root -->|16| other
  root -->|2| scripts
  scripts -->|1| other
  scripts -->|7| semantic
  scripts -->|2| tooling_lib
  tests -->|7| scripts
  tests -->|4| semantic
  tests -->|8| tooling_lib
```

## Components

| Component | Files |
| --- | --- |
| `scripts` — Repository scripts | 33 |
| `adr` — Decision records | 22 |
| `agent-harness` — Agent harness (.agent) | 18 |
| `github-config` — GitHub config & templates | 17 |
| `root` — Root docs & config | 15 |
| `docs-agents` — Agent docs | 10 |
| `workflows` — CI workflows | 10 |
| `tests` — Property tests | 9 |
| `semantic` — Semantic engine | 6 |
| `skills` — Agent skills (.claude/skills) | 4 |
| `docs-arch` — Architecture docs | 3 |
| `docs-ci` — CI docs | 3 |
| `mocks` — Service mocks | 2 |
| `tooling-lib` — Tooling library | 2 |
| `docs-data` — Data docs | 1 |
| `sandbox` — Dev container | 1 |

## Heaviest links

| From | To | References |
| --- | --- | --- |
| `root` | `adr` | 65 |
| `root` | `docs-agents` | 37 |
| `adr` | `docs-agents` | 26 |
| `root` | `other` | 16 |
| `docs-agents` | `adr` | 11 |
| `adr` | `other` | 8 |
| `root` | `docs-ci` | 8 |
| `tests` | `tooling-lib` | 8 |
| `scripts` | `semantic` | 7 |
| `tests` | `scripts` | 7 |
| `adr` | `root` | 5 |
| `adr` | `docs-ci` | 4 |
| `agent-harness` | `docs-agents` | 4 |
| `root` | `agent-harness` | 4 |
| `root` | `docs-data` | 4 |

## How this stays alive

1. The graph is derived from the files that exist — links and imports, nothing invented.
2. `--check` compares the committed output to a fresh render, byte for byte.
3. Structural changes therefore cannot land without updating the picture (no doc drift).
