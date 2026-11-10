#!/usr/bin/env node
// Egress allowlist — data sovereignty enforced mechanically.
//
//   node scripts/check-egress.mjs            # fail on any undeclared external destination
//   node scripts/check-egress.mjs --list     # show the allowlist
//   node scripts/check-egress.mjs --json
//
// Every outbound destination this repository can reach must be declared here,
// with the files allowed to mention it and the reason it exists. A new URL that
// is not declared fails the guard, which turns "we would never send data there"
// from a promise into a check.
// Docs: docs/security/data-sovereignty.md

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const JSON_OUT = process.argv.includes("--json");
const LIST = process.argv.includes("--list");

/**
 * host → { why, files?: [regex as string] }
 * `files` narrows the destination to specific files; omit only for read-only
 * public references that may legitimately appear anywhere.
 */
const ALLOWLIST = {
  "github.com": {
    why: "canonical repository links and CI badges (read-only, no data sent)",
  },
  "raw.githubusercontent.com": {
    why: "devcontainer JSON schema reference",
    files: ["^\\.devcontainer/"],
  },
  "modelcontextprotocol.io": {
    why: "MCP configuration $schema (documentation only)",
    files: ["^\\.mcp\\.json$"],
  },
  "api.githubcopilot.com": {
    why: "MCP server endpoint; credentials come from the environment at runtime",
    files: ["^\\.mcp\\.json$"],
  },
  "mcr.microsoft.com": {
    why: "dev container base image",
    files: ["^\\.devcontainer/"],
  },
  "ghcr.io": {
    why: "dev container features",
    files: ["^\\.devcontainer/"],
  },
  "127.0.0.1": {
    why: "loopback only — the deterministic mock server and its CI health checks never leave the sandbox",
    files: ["^scripts/mock-server\.mjs$", "^\.github/workflows/property-tests\.yml$"],
  },
  "git-lfs.github.com": {
    why: "LFS pointer spec identifier read from pointer files — a string format, not a request",
    files: ["^scripts/artifact-manifest\.mjs$"],
  },
  "huggingface.co": {
    why: "opt-in model weights only — requires --allow-network and a checksum pinned in the manifest; never used by CI",
    files: ["^scripts/semantic/model\\.mjs$", "^scripts/semantic/models\\.manifest\\.json$", "^docs/agents/local-model\\.md$"],
  },
  "api.openai.com": {
    why: "OPT-IN embedding provider — refuses to run without an explicit key and is never used by CI",
    files: ["^scripts/semantic/lib\\.mjs$"],
  },
};

// Generated mirrors of already-scanned sources: they copy text (and therefore URLs)
// from files this check reads directly, so scanning them adds only false positives.
const GENERATED = [/^playground\/index\.json$/, /^docs\/architecture\/graph\.json$/, /^artifacts\.manifest\.json$/];

const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".js", ".cjs", ".ts", ".yml", ".yaml", ".json", ".sh", ".html", ".css", ".txt", ".jsonc",
]);

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const violations = [];
const seenHosts = new Map();

for (const file of files) {
  if (!TEXT_EXTENSIONS.has(extname(file)) || GENERATED.some((pattern) => pattern.test(file))) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  content.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/https?:\/\/([a-z0-9.-]+)(?::\d+)?/gi)) {
      const host = match[1].toLowerCase();
      seenHosts.set(host, (seenHosts.get(host) ?? 0) + 1);

      const rule = ALLOWLIST[host];
      if (!rule) {
        violations.push({ file, line: index + 1, host, reason: "host is not in the allowlist" });
        continue;
      }
      if (rule.files && !rule.files.some((pattern) => new RegExp(pattern).test(file))) {
        violations.push({
          file,
          line: index + 1,
          host,
          reason: `host is only allowed in ${rule.files.map((f) => f.replace(/[\^$\\]/g, "")).join(", ")}`,
        });
      }
    }
  });
}

const summary = [...seenHosts.entries()].sort((a, b) => b[1] - a[1]);

if (LIST) {
  console.log("declared egress destinations:\n");
  for (const [host, rule] of Object.entries(ALLOWLIST).sort()) {
    const scope = rule.files ? `files: ${rule.files.join(", ")}` : "any file";
    console.log(`  ${host.padEnd(28)} ${scope}`);
    console.log(`    ${rule.why}`);
  }
  console.log(`\nobserved in repository: ${summary.map(([h, n]) => `${h} (${n})`).join(", ") || "none"}`);
  process.exit(0);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ allowlist: ALLOWLIST, observed: summary, violations }, null, 2));
} else {
  for (const v of violations) {
    console.log(`\x1b[31m✗\x1b[0m ${v.file}:${v.line} → ${v.host} — ${v.reason}`);
  }
  console.log(
    `\negress: ${summary.length} declared host(s) observed · ${violations.length} violation(s)`,
  );
  if (violations.length) {
    console.log("declare the destination in scripts/check-egress.mjs with a reason, or remove the call.");
    console.log("policy: docs/security/data-sovereignty.md");
  }
}

if (violations.length) process.exit(1);
