#!/usr/bin/env node
// Change classifier — routes CI work (and therefore cost and carbon) by what actually changed.
//
//   node scripts/change-classifier.mjs                       # origin/main..HEAD
//   node scripts/change-classifier.mjs --base origin/main --head HEAD
//   node scripts/change-classifier.mjs --files "docs/a.md,scripts/b.mjs"
//   node scripts/change-classifier.mjs --github-output       # writes to $GITHUB_OUTPUT
//
// Output is a total function of the file list: every file gets exactly one class,
// and the pipeline decisions are derived from those classes. Docs: docs/ci/green-builds.md

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RULES = [
  { cls: "docs", test: (f) => /\.(md|mdx|txt)$/i.test(f) },
  { cls: "ci", test: (f) => /^(\.github\/|\.devcontainer\/)/.test(f) },
  { cls: "tooling", test: (f) => /^(scripts\/|tests\/|mocks\/)/.test(f) },
  { cls: "data", test: (f) => /^(data\/|models\/|public\/|assets\/)/.test(f) },
  {
    cls: "deps",
    test: (f) => /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(f),
  },
  { cls: "code", test: () => true },
];

const WEIGHT = { docs: 0, ci: 1, tooling: 2, data: 3, deps: 4, code: 5 };

/** Exactly one class per file — first matching rule wins. */
export function classify(file) {
  return RULES.find((rule) => rule.test(file)).cls;
}

export function classifyAll(files) {
  const byClass = { docs: [], ci: [], tooling: [], data: [], deps: [], code: [] };
  for (const file of files) byClass[classify(file)].push(file);

  const present = Object.keys(byClass).filter((c) => byClass[c].length > 0);
  const heaviest =
    files.length === 0 ? "none" : (present.sort((a, b) => WEIGHT[b] - WEIGHT[a])[0] ?? "docs");
  const docsOnly = files.length > 0 && present.every((c) => c === "docs");

  return {
    files: files.length,
    byClass,
    class: heaviest,
    docsOnly,
    needs: {
      // A docs-only change must not pay for a build, a container scan, or a sandbox.
      build: !docsOnly,
      securityScan: !docsOnly,
      dependencyAudit: ["ci", "tooling", "deps", "code", "data"].some((c) => present.includes(c)),
      semanticIndex: files.length > 0,
      propertyTests: ["tooling", "code", "deps"].some((c) => present.includes(c)),
      preview: ["code", "deps", "data"].some((c) => present.includes(c)),
    },
  };
}

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

function changedFiles() {
  const explicit = value("files");
  if (typeof explicit === "string") {
    return explicit.split(",").map((f) => f.trim()).filter(Boolean).sort();
  }
  const base = value("base", "origin/main");
  const head = value("head", "HEAD");
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" });
    return out.split("\n").map((f) => f.trim()).filter(Boolean).sort();
  } catch {
    return [];
  }
}

function main() {
  const files = changedFiles();
  const result = {
    base: value("base", "origin/main"),
    head: value("head", "HEAD"),
    ...classifyAll(files),
  };

  if (argv.includes("--github-output")) {
    const lines = [
      `class=${result.class}`,
      `docs_only=${result.docsOnly}`,
      ...Object.entries(result.needs).map(([k, v]) => `needs_${k}=${v}`),
    ];
    const target = process.env.GITHUB_OUTPUT;
    if (target) appendFileSync(target, `${lines.join("\n")}\n`);
    console.log(lines.join("\n"));
    return;
  }

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`changed files: ${result.files}`);
  for (const [cls, list] of Object.entries(result.byClass)) {
    if (list.length) console.log(`  ${cls.padEnd(8)} ${list.length}`);
  }
  console.log(`\nclass      : ${result.class}${result.docsOnly ? "  (docs-only: heavy jobs skipped)" : ""}`);
  for (const [job, needed] of Object.entries(result.needs)) {
    console.log(`  ${needed ? "run " : "skip"}  ${job}`);
  }
}

// Only run the CLI when executed directly, so tests can import the pure functions.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
