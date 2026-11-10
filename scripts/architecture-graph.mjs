#!/usr/bin/env node
// Living architecture graph — generated from the repository, verified in CI.
//
//   node scripts/architecture-graph.mjs --write    # regenerate docs/architecture/*
//   node scripts/architecture-graph.mjs --check    # fail if the committed graph is stale
//   node scripts/architecture-graph.mjs --json
//
// Nodes are components (directory-level, not file-level) and edges are the links
// that actually exist: markdown cross-references and module imports. Output is
// deterministic (sorted, no timestamps) so --check is a real drift gate.
// Docs: docs/architecture/living-docs.md

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const GRAPH_JSON = "docs/architecture/graph.json";
const GRAPH_MD = "docs/architecture/graph.md";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const CHECK = argv.includes("--check");
const JSON_OUT = argv.includes("--json");

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

const COMPONENTS = [
  { id: "root", label: "Root docs & config", match: (f) => !f.includes("/") },
  { id: "agent-harness", label: "Agent harness (.agent)", match: (f) => f.startsWith(".agent/") },
  { id: "skills", label: "Agent skills (.claude/skills)", match: (f) => f.startsWith(".claude/skills/") },
  { id: "workflows", label: "CI workflows", match: (f) => f.startsWith(".github/workflows/") },
  { id: "github-config", label: "GitHub config & templates", match: (f) => f.startsWith(".github/") },
  { id: "sandbox", label: "Dev container", match: (f) => f.startsWith(".devcontainer/") },
  { id: "adr", label: "Decision records", match: (f) => f.startsWith("docs/adr/") },
  { id: "docs-agents", label: "Agent docs", match: (f) => f.startsWith("docs/agents/") },
  { id: "docs-ci", label: "CI docs", match: (f) => f.startsWith("docs/ci/") },
  { id: "docs-data", label: "Data docs", match: (f) => f.startsWith("docs/data/") },
  { id: "docs-arch", label: "Architecture docs", match: (f) => f.startsWith("docs/architecture/") },
  { id: "semantic", label: "Semantic engine", match: (f) => f.startsWith("scripts/semantic/") },
  { id: "tooling-lib", label: "Tooling library", match: (f) => f.startsWith("scripts/lib/") },
  { id: "scripts", label: "Repository scripts", match: (f) => f.startsWith("scripts/") },
  { id: "tests", label: "Property tests", match: (f) => f.startsWith("tests/") },
  { id: "mocks", label: "Service mocks", match: (f) => f.startsWith("mocks/") },
  { id: "data", label: "Data & artifacts", match: (f) => /^(data|models|public|assets)\//.test(f) },
];

const componentOf = (file) => (COMPONENTS.find((c) => c.match(file)) ?? { id: "other" }).id;

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

function tracked() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean).sort();
}

const files = tracked();
const components = COMPONENTS.filter((c) => files.some((f) => c.match(f)));

const edges = new Map(); // "from→to" -> { from, to, links }
const addEdge = (from, to) => {
  if (!from || !to || from === to) return;
  const key = `${from}→${to}`;
  const existing = edges.get(key);
  if (existing) existing.links++;
  else edges.set(key, { from, to, links: 1 });
};

const resolveRelative = (fromFile, target) => {
  if (!target || /^(https?:|mailto:|tel:|\/|#)/.test(target)) return null;
  const clean = target.split("#")[0].trim();
  if (!clean) return null;
  const base = dirname(fromFile) === "." ? "" : `${dirname(fromFile)}/`;
  const parts = `${base}${clean}`.split("/");
  const stack = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part !== "." && part !== "") stack.push(part);
  }
  return stack.join("/");
};

for (const file of files) {
  const ext = extname(file);
  if (ext !== ".md" && ext !== ".mjs" && ext !== ".js") continue;
  const source = componentOf(file);
  const text = readFileSync(file, "utf8");

  if (ext === ".md") {
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = resolveRelative(file, match[1]);
      if (target && files.includes(target)) addEdge(source, componentOf(target));
    }
  } else {
    for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = resolveRelative(file, match[1]);
      if (target && files.includes(target)) addEdge(source, componentOf(target));
    }
  }
}

const sortedEdges = [...edges.values()].sort((a, b) =>
  a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
);

const graph = {
  version: 1,
  generator: "scripts/architecture-graph.mjs",
  note: "Generated from tracked files — do not edit by hand. Regenerate with --write.",
  stats: {
    files: files.length,
    components: components.length,
    edges: sortedEdges.length,
  },
  components: components.map((c) => ({
    id: c.id,
    label: c.label,
    files: files.filter((f) => c.match(f)).length,
  })),
  edges: sortedEdges,
};

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const idOf = (componentId) => componentId.replace(/[^a-z0-9]/gi, "_");

function renderMarkdown() {
  const lines = [];
  lines.push("# Architecture Graph");
  lines.push("");
  lines.push("> **Generated file — do not edit by hand.**");
  lines.push("> Regenerate with `node scripts/architecture-graph.mjs --write`.");
  lines.push("> `guard` and the `architecture` workflow fail when this file is stale.");
  lines.push("");
  lines.push(
    `**${graph.stats.files} tracked files · ${graph.stats.components} components · ${graph.stats.edges} directed links**`,
  );
  lines.push("");
  lines.push("## Component map");
  lines.push("");
  lines.push("```mermaid");
  lines.push("graph LR");
  for (const c of graph.components) lines.push(`  ${idOf(c.id)}["${c.label}"]`);
  for (const e of graph.edges) lines.push(`  ${idOf(e.from)} -->|${e.links}| ${idOf(e.to)}`);
  lines.push("```");
  lines.push("");
  lines.push("## Components");
  lines.push("");
  lines.push("| Component | Files |");
  lines.push("| --- | --- |");
  for (const c of [...graph.components].sort((a, b) => b.files - a.files || a.id.localeCompare(b.id))) {
    lines.push(`| \`${c.id}\` — ${c.label} | ${c.files} |`);
  }
  lines.push("");
  lines.push("## Heaviest links");
  lines.push("");
  lines.push("| From | To | References |");
  lines.push("| --- | --- | --- |");
  for (const e of [...graph.edges].sort((a, b) => b.links - a.links || a.from.localeCompare(b.from)).slice(0, 15)) {
    lines.push(`| \`${e.from}\` | \`${e.to}\` | ${e.links} |`);
  }
  lines.push("");
  lines.push("## How this stays alive");
  lines.push("");
  lines.push("1. The graph is derived from the files that exist — links and imports, nothing invented.");
  lines.push("2. `--check` compares the committed output to a fresh render, byte for byte.");
  lines.push("3. Structural changes therefore cannot land without updating the picture (no doc drift).");
  lines.push("");
  return lines.join("\n");
}

const renderedJson = `${JSON.stringify(graph, null, 2)}\n`;
const renderedMd = renderMarkdown();

if (JSON_OUT) {
  console.log(renderedJson);
  process.exit(0);
}

if (CHECK) {
  const problems = [];
  if (!existsSync(GRAPH_JSON)) problems.push(`${GRAPH_JSON} is missing`);
  else if (readFileSync(GRAPH_JSON, "utf8") !== renderedJson) problems.push(`${GRAPH_JSON} is stale`);
  if (!existsSync(GRAPH_MD)) problems.push(`${GRAPH_MD} is missing`);
  else if (readFileSync(GRAPH_MD, "utf8") !== renderedMd) problems.push(`${GRAPH_MD} is stale`);

  if (problems.length) {
    for (const p of problems) console.log(`\x1b[31m✗\x1b[0m ${p}`);
    console.log("run: node scripts/architecture-graph.mjs --write  (and commit the result)");
    process.exit(1);
  }
  console.log(`architecture graph is current (${graph.stats.components} components, ${graph.stats.edges} links)`);
  process.exit(0);
}

if (WRITE) {
  mkdirSync(dirname(GRAPH_JSON), { recursive: true });
  writeFileSync(join(GRAPH_JSON), renderedJson);
  writeFileSync(join(GRAPH_MD), renderedMd);
  console.log(`wrote ${GRAPH_JSON} and ${GRAPH_MD}`);
  console.log(`  components: ${graph.stats.components} · links: ${graph.stats.edges} · files: ${graph.stats.files}`);
  process.exit(0);
}

console.log(renderedMd);
