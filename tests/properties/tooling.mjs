// Properties for the repository's own tooling: classification and generated artifacts.
// If these regress, CI routing or the living documentation silently drift.

import { execFileSync } from "node:child_process";
import { classify, classifyAll } from "../../scripts/change-classifier.mjs";
import { gen } from "../../scripts/lib/property.mjs";

const CLASSES = new Set(["docs", "ci", "tooling", "data", "deps", "code"]);

const run = (args) => execFileSync("node", args, { encoding: "utf8" });

export default [
  {
    name: "classify is total: every path maps to a known class",
    generators: {
      prefix: gen.pick(["", "docs/", "scripts/", ".github/workflows/", "data/", "src/", "a/b/c/"]),
      name: gen.pick(["README", "notes", "main", "package", "workflow", "x"]),
      ext: gen.pick(["", ".md", ".mjs", ".json", ".yml", ".lock", ".bin", ".csv"]),
    },
    property: ({ prefix, name, ext }) => CLASSES.has(classify(`${prefix}${name}${ext}`)),
  },
  {
    name: "classifyAll partitions the input exactly",
    generators: { files: gen.arrayOf(gen.text({ maxLength: 18, alphabet: "abc/._-md" }), { maxLength: 6 }) },
    property: ({ files }) => {
      const result = classifyAll(files);
      const total = Object.values(result.byClass).reduce((n, list) => n + list.length, 0);
      return total === files.length;
    },
  },
  {
    name: "docs-only changes never request a build or a scan",
    generators: { files: gen.arrayOf(gen.text({ maxLength: 12, alphabet: "abc" }), { maxLength: 4 }) },
    property: ({ files }) => {
      const docs = files.map((f) => `docs/${f || "x"}.md`);
      if (docs.length === 0) return true; // the empty set is covered by the conservative rule
      const result = classifyAll(docs);
      return result.docsOnly && !result.needs.build && !result.needs.securityScan;
    },
  },
  {
    name: "tooling changes always request property tests",
    generators: { name: gen.text({ maxLength: 10, alphabet: "abc-" }) },
    property: ({ name }) => {
      const files = [`scripts/${name || "x"}.mjs`];
      return classifyAll(files).needs.propertyTests === true;
    },
  },
  {
    name: "the change classifier is deterministic for the same input",
    generators: { files: gen.arrayOf(gen.text({ maxLength: 10, alphabet: "abc/." }), { maxLength: 5 }) },
    property: ({ files }) => JSON.stringify(classifyAll(files)) === JSON.stringify(classifyAll(files)),
  },
  {
    name: "the architecture graph renders identically twice (deterministic living docs)",
    runs: 3,
    generators: { unused: gen.bool() },
    property: () => run(["scripts/architecture-graph.mjs", "--json"]) === run(["scripts/architecture-graph.mjs", "--json"]),
  },
  {
    name: "the artifact manifest scan is stable across runs",
    runs: 3,
    generators: { unused: gen.bool() },
    property: () => run(["scripts/artifact-manifest.mjs", "--json"]) === run(["scripts/artifact-manifest.mjs", "--json"]),
  },
  {
    name: "architecture graph has no self-loops and no duplicate edges",
    runs: 2,
    generators: { unused: gen.bool() },
    property: () => {
      const graph = JSON.parse(run(["scripts/architecture-graph.mjs", "--json"]));
      const keys = graph.edges.map((e) => `${e.from}→${e.to}`);
      return (
        graph.edges.every((e) => e.from !== e.to) &&
        new Set(keys).size === keys.length &&
        graph.components.every((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
      );
    },
  },
];
