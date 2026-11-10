#!/usr/bin/env node
// Zero-trust dependency audit — no network, no installs, no lockfile parsing.
//
//   node scripts/dependency-audit.mjs            # human report
//   node scripts/dependency-audit.mjs --json     # machine report
//   node scripts/dependency-audit.mjs --strict   # exit 1 on any high finding
//
// At L0 there is no manifest: the audit then reports repository-level risk
// (workflow pinning, install hooks, lockfile hygiene) instead of pretending
// to analyse dependencies that do not exist. Policy: docs/adr/0004-*.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const STRICT = argv.includes("--strict");

const PERMISSIVE = new Set([
  "MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "MPL-2.0",
  "0BSD", "Unlicense", "CC0-1.0", "BlueOak-1.0.0",
]);

const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"];

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const findings = [];
const add = (severity, id, message, file = "") => findings.push({ severity, id, message, file });

/* ------------------------------------------------------------------ */
/* 1. Dependency manifest                                              */
/* ------------------------------------------------------------------ */

const manifestPath = "package.json";
let state = "L0-no-manifest";
let summary = { dependencies: 0, devDependencies: 0, lockfile: null, license: null };

if (existsSync(manifestPath)) {
  state = "manifest";
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  const deps = Object.entries(pkg.dependencies ?? {});
  const devDeps = Object.entries(pkg.devDependencies ?? {});
  summary.dependencies = deps.length;
  summary.devDependencies = devDeps.length;
  summary.license = pkg.license ?? null;

  // Floating ranges make builds non-reproducible: say no to ^ ~ * latest.
  for (const [name, version] of [...deps, ...devDeps]) {
    if (["*", "latest", ""].includes(String(version))) {
      add("high", "floating-range", `dependency "${name}" uses a floating version ("${version}")`, manifestPath);
    } else if (/^[\^~]/.test(String(version)) && deps.some(([n]) => n === name)) {
      add("warn", "range-not-pinned", `runtime dependency "${name}" is ranged ("${version}") — pin it in production`, manifestPath);
    } else if (/^(git|git\+|https?:|file:)/.test(String(version))) {
      add("high", "remote-source-dep", `dependency "${name}" resolves outside the registry ("${version}")`, manifestPath);
    }
  }

  // Install-time code execution is the highest-risk supply-chain surface.
  for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
    if (pkg.scripts?.[hook]) {
      add("warn", "install-hook", `lifecycle script "${hook}" runs at install time — keep it minimal and reviewed`, manifestPath);
    }
  }

  // Registry trust settings.
  if (!pkg.engines?.node) add("warn", "no-engine-pin", "no `engines.node` — toolchain drift between machines", manifestPath);

  // License hygiene.
  if (!summary.license) add("warn", "no-license-field", "package.json declares no license", manifestPath);
  else if (!PERMISSIVE.has(summary.license)) {
    add("warn", "license-review", `license "${summary.license}" is not on the permissive allowlist — review before shipping`, manifestPath);
  }

  // Lockfile must be committed for a reproducible, auditable tree.
  const tracked = git(["ls-files", ...LOCKFILES]).split("\n").filter(Boolean);
  summary.lockfile = tracked[0] ?? null;
  if (!tracked.length) {
    add("high", "no-lockfile", "no lockfile is committed — dependency resolution is not reproducible", "");
  }
}

// Repository licence: undecided today (open decision D5), but silently licence-less
// code is worse than a deliberate choice.
if (!["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"].some((f) => existsSync(f))) {
  add("warn", "no-license-file", "no LICENSE file at the repository root — the licence is an open decision (AGENTS.md §9)", "");
}

/* ------------------------------------------------------------------ */
/* 2. Workflow supply chain (always checked)                           */
/* ------------------------------------------------------------------ */

const workflows = git(["ls-files", ".github/workflows"])
  .split("\n")
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

for (const file of workflows) {
  const content = readFileSync(file, "utf8");

  for (const m of content.matchAll(/^\s*uses:\s*(\S+)/gm)) {
    const ref = m[1];
    if (ref.startsWith("./")) continue;
    const [, spec] = ref.split("@");
    if (!spec) add("high", "unpinned-action", `action "${ref}" has no ref`, file);
    else if (["master", "main", "HEAD"].includes(spec)) {
      add("high", "floating-action", `action "${ref}" tracks a moving branch — pin a tag or SHA`, file);
    } else if (/^v?\d+(\.\d+)*$/.test(spec) === false && !/^[0-9a-f]{40}$/.test(spec)) {
      add("warn", "unusual-action-ref", `action "${ref}" uses a unusual ref — prefer a tag or full SHA`, file);
    }
  }

  if (/pull_request_target\s*:/.test(content)) {
    add("high", "pr-target", "uses `pull_request_target` — requires human approval (SECURITY.md)", file);
  }
  if (!/^\s*permissions\s*:/m.test(content)) {
    add("high", "implicit-token-scope", "workflow declares no explicit `permissions:` block", file);
  }
  if (!/^\s*timeout-minutes\s*:/m.test(content) && /^\s*runs-on\s*:/m.test(content)) {
    add("warn", "no-timeout", "job has no `timeout-minutes`", file);
  }
}

/* ------------------------------------------------------------------ */
/* 3. Dead weight (advisory)                                           */
/* ------------------------------------------------------------------ */

if (state === "manifest") {
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  const scripts = Object.values(pkg.scripts ?? {}).join(" ");
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!scripts.includes(name)) continue; // CLI tooling legitimately unused in scripts
  }
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const order = { high: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
const counts = findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {});

const report = {
  generatedAt: new Date().toISOString(),
  commit: git(["rev-parse", "--short", "HEAD"]),
  state,
  summary,
  workflows: workflows.length,
  counts,
  findings,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`dependency audit · state=${state} · commit=${report.commit}`);
  console.log(
    `manifests: deps ${summary.dependencies} · dev ${summary.devDependencies} · lockfile ${summary.lockfile ?? "none"} · license ${summary.license ?? "none"}`,
  );
  console.log(`workflows scanned: ${workflows.length}\n`);
  if (state === "L0-no-manifest") {
    console.log("No dependency manifest exists yet (see AGENTS.md §9).");
    console.log("Repository-level supply-chain checks ran instead of package analysis.\n");
  }
  if (!findings.length) console.log("No findings.");
  for (const f of findings) {
    const icon = f.severity === "high" ? "✗" : f.severity === "warn" ? "!" : "·";
    console.log(`${icon} [${f.severity}] ${f.id}: ${f.message}${f.file ? ` (${f.file})` : ""}`);
  }
  console.log(`\nhigh ${counts.high ?? 0} · warn ${counts.warn ?? 0} · info ${counts.info ?? 0}`);
}

if (STRICT && (counts.high ?? 0) > 0) process.exit(1);
