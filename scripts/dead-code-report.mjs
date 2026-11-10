#!/usr/bin/env node
// Dead-code report — advisory, heuristic, no dependencies, no AST.
//
//   node scripts/dead-code-report.mjs            # human report
//   node scripts/dead-code-report.mjs --json
//   node scripts/dead-code-report.mjs --strict   # exit 1 if orphans exist
//
// A file is considered "referenced" when its name, its basename, or its stem is
// mentioned anywhere else in the repository (imports, docs, workflows, configs).
// That is deliberately conservative: it under-reports rather than nagging about
// files that are in fact used. It is a triage aid, never an auto-deleter.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const STRICT = argv.includes("--strict");

const CODE_EXTENSIONS = new Set([
  ".mjs", ".js", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx",
  ".astro", ".vue", ".svelte", ".py", ".go", ".rs", ".sh", ".css",
]);

// Files that are expected to be unreferenced: entry points and configs.
const ENTRYPOINT_PATTERNS = [
  /(^|\/)(cli|index|main|server|setup|bootstrap)\.[a-z]+$/i,
  /(^|\/)(vite|next|nuxt|astro|tailwind|postcss|eslint|prettier|vitest|jest)\.config\.[a-z]+$/i,
  /^bin\//,
];

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const tracked = git(["ls-files"]).split("\n").filter(Boolean);
const codeFiles = tracked.filter((f) => CODE_EXTENSIONS.has(extname(f)));

/** Everything else that could mention a file: docs, configs, other code. */
const content = new Map();
for (const file of tracked) {
  if (file.startsWith(".index/")) continue;
  try {
    if (statSync(file).size > 400_000) continue;
    content.set(file, readFileSync(file, "utf8"));
  } catch {
    /* deleted between listing and reading */
  }
}

const isEntrypoint = (file) => {
  if (ENTRYPOINT_PATTERNS.some((re) => re.test(file))) return true;
  const text = content.get(file) ?? "";
  return text.startsWith("#!");
};

const aliasesFor = (file) => {
  const base = basename(file);
  const stem = base.slice(0, -extname(base).length);
  return [...new Set([file, base, stem])].filter((a) => a.length > 2);
};

const results = [];
for (const file of codeFiles) {
  const aliases = aliasesFor(file);
  const referrers = [];

  for (const [other, text] of content) {
    if (other === file) continue;
    if (aliases.some((alias) => text.includes(alias))) referrers.push(other);
  }

  const entrypoint = isEntrypoint(file);
  const lastCommit = git(["log", "-1", "--format=%aI", "--", file]);

  results.push({
    file,
    entrypoint,
    referencedBy: referrers.length,
    lastCommit: lastCommit || "uncommitted",
    size: content.get(file)?.length ?? 0,
    orphan: !entrypoint && referrers.length === 0,
  });
}

const orphans = results.filter((r) => r.orphan);
const entrypoints = results.filter((r) => r.entrypoint);

if (JSON_OUT) {
  console.log(
    JSON.stringify({ commit: git(["rev-parse", "--short", "HEAD"]), codeFiles: codeFiles.length, orphans, entrypoints, results }, null, 2),
  );
} else {
  console.log(`dead-code report · ${codeFiles.length} code file(s) · commit ${git(["rev-parse", "--short", "HEAD"])}\n`);
  if (!orphans.length) {
    console.log("No orphaned files detected.");
  } else {
    console.log("Possible orphans (verify before deleting — heuristics under-report, they do not prove):");
    for (const o of orphans) {
      console.log(`  ? ${o.file}  (${o.size}B, last change ${o.lastCommit.slice(0, 10)})`);
    }
  }
  console.log(`\nentry points (never flagged): ${entrypoints.length}`);
  for (const e of entrypoints) console.log(`  · ${e.file}`);
  console.log("\nRemove dead code in its own PR, with the guard green — never as a side effect.");
}

if (STRICT && orphans.length) process.exit(1);
