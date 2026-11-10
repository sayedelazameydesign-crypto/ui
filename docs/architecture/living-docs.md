# Living Documentation

Documentation rots when it is written once and read rarely. This repository treats the architecture
picture as a **build artifact**: generated from the files that exist, committed, and verified in CI.
If the structure changes and the picture does not, the pipeline fails.

## 1. What is generated

| File | Content | Generator |
| --- | --- | --- |
| [`graph.md`](graph.md) | Mermaid component map, component table, heaviest links | `scripts/architecture-graph.mjs` |
| `graph.json` | The same graph as data, for tooling | `scripts/architecture-graph.mjs` |
| `artifacts.manifest.json` | Artifact ledger (sizes, hashes) | `scripts/artifact-manifest.mjs` |

**Nothing in these files is hand-written.** Each carries a "generated — do not edit" banner.

## 2. How the graph is derived

1. **Nodes** are components (directory-level): workflows, agent harness, skills, semantic engine,
   tooling library, tests, mocks, ADRs, and the docs families.
2. **Edges** are real references only:
   - relative markdown links between tracked files,
   - module imports in `.mjs`/`.js` files,
   resolved to a target file, then collapsed to its component (self-edges dropped, duplicates
     counted).
3. **Determinism**: no timestamps, sorted nodes and edges, so two runs produce identical bytes.

It is a *navigation* map, not a UML model: it answers "what talks to what, and how much" without
inventing layers that do not exist.

## 3. The drift gate

```bash
node scripts/architecture-graph.mjs --write    # after a structural change
node scripts/architecture-graph.mjs --check    # fails if the committed files are stale
```

| Where | Behaviour |
| --- | --- |
| `scripts/check-repo.sh` | `--check` runs in section 8 — a stale graph fails the guard locally |
| `.github/workflows/architecture.yml` | regenerates and fails the PR if the diff is non-empty |
| `.github/workflows/guard.yml` | same script, same verdict |

This is the mechanism that makes the documentation "live": it cannot silently disagree with the
repository, because the disagreement is a red check.

## 4. Markdown, not a service

The visualisation is Mermaid inside a markdown file. That means:

- it renders on GitHub with no build step, no JavaScript bundle, no external service;
- it diffs in review (a changed edge is a visible line, not a binary blob);
- it survives tool churn — Mermaid is widely supported and easy to replace.

An interactive canvas (clickable nodes, drill-down) is deliberately **not** built: without real
UI surfaces, it would be a demo, not documentation.

## 5. Honest limits

- Component granularity hides file-level coupling; use the semantic index when you need the file.
- The graph reflects **static** references. Runtime call paths, data flows, and deployed topology
  are not represented — and claiming otherwise would be misleading.
- Generated docs verify *freshness*, not *clarity*. A current diagram can still be a bad diagram;
  that is a review question.
- Regeneration is manual by design on a branch: auto-committing from CI would let a bot push
  unreviewed content, which violates `AGENTS.md` §2.

## 6. When to extend this

Add a sequence diagram (Mermaid `sequenceDiagram`) for a flow once a real request path exists, and
a deployment diagram when hosting is chosen (D3/D6). Both should be generated from source of truth
(config, route table, workflow files) rather than hand-drawn, for the same reason as above.
