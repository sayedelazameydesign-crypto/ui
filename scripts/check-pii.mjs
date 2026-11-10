#!/usr/bin/env node
// Privacy guard: PII and secret detection at the boundary where data enters the
// repository — the commit — before it can be pushed anywhere.
//
//   node scripts/check-pii.mjs             # scan every tracked file
//   node scripts/check-pii.mjs --staged    # scan the staged diff (pre-commit hook)
//   node scripts/check-pii.mjs --json
//   node scripts/check-pii.mjs --explain   # list rules and their intent
//
// Findings print a MASKED excerpt: a scanner that echoes the secret it found has
// published it to the terminal and the CI log.
//
// False positives are cleared with .pii-allowlist.json, where every entry needs
// a reason. There is no flag to disable the check: an allowlist entry is
// reviewable, `--no-verify` is not.
// Policy: docs/security/pii-guard.md · docs/adr/0012-pii-dlp-guard.md

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const ALLOWLIST_PATH = ".pii-allowlist.json";

/* ------------------------------------------------------------------ */
/* Rules: name, why it exists, and how to recognise it                 */
/* ------------------------------------------------------------------ */

const luhn = (digits) => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
};

const RULES = [
  {
    id: "private-key",
    why: "a committed private key allows remote authentication",
    test: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
    severity: "critical",
  },
  {
    id: "cloud-token",
    why: "cloud and VCS credentials are directly exploitable",
    test: /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,})\b/,
    severity: "critical",
  },
  { id: "openai-key", why: "API keys are billable and leakable", test: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/, severity: "critical" },
  {
    id: "jwt",
    why: "a bearer token in the repository is a live session",
    test: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    severity: "high",
  },
  {
    id: "card-number",
    why: "payment card data is regulated (PCI-DSS) and never belongs in git",
    test: /\b(?:\d[ -]?){12,18}\d\b/,
    validate: (match) => luhn(match.replace(/[^0-9]/g, "")),
    severity: "critical",
  },
  {
    id: "email",
    why: "personal identifiers are PII; regulated markets require a lawful basis to store them",
    test: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    // Bot addresses, example domains and git's noreply form are not personal data.
    // File conventions such as `file@v2.bin` look like addresses and are not.
    validate: (match) => {
      const [, domain = ""] = match.split("@");
      const tld = domain.split(".").pop()?.toLowerCase() ?? "";
      const fileLike = new Set(["bin", "png", "jpg", "jpeg", "svg", "md", "json", "yaml", "yml", "txt", "lock", "zip", "tar", "gz", "js", "mjs", "ts"]);
      return (
        !fileLike.has(tld) &&
        !/^\d/.test(domain) &&
        !/@example\.(com|org|net)$/i.test(match) &&
        !/^(?:noreply|no-reply|do-not-reply|git|actions|bot|you)@/i.test(match) &&
        !/\.(?:invalid|test|example)$/i.test(match)
      );
    },
    severity: "medium",
  },
  {
    id: "phone-eg",
    why: "Egyptian mobile numbers are personal data (law 151/2020)",
    test: /(?:\+?20[\s-]?|0)1[0125][\s-]?\d{4}[\s-]?\d{4}\b/,
    severity: "high",
  },
  {
    id: "national-id-eg",
    why: "a 14-digit Egyptian national ID identifies a person uniquely",
    test: /(?<!\d)[1-3]\d{13}(?!\d)/,
    severity: "critical",
  },
  {
    id: "iban",
    why: "bank account identifiers are financial PII",
    test: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/,
    validate: (match) => /^EG\d{2}/.test(match) || /\b[A-Z]{2}\d{2}[A-Z]{4}/.test(match),
    severity: "high",
  },
  {
    id: "secret-assignment",
    why: "a hardcoded password or token in source is a leaked credential",
    test: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    validate: (match) => !/(?:process\.env|os\.environ|\$\{|\{\{|<|example|placeholder|redacted|xxx)/i.test(match),
    severity: "high",
  },
];

export const maskValue = (value) => {
  const text = String(value);
  if (text.length <= 6) return "*".repeat(text.length);
  return `${text.slice(0, 3)}${"*".repeat(Math.min(12, text.length - 5))}${text.slice(-2)}`;
};

const excerpt = (line) => (line.length > 140 ? `${line.slice(0, 140)}…` : line);

/* ------------------------------------------------------------------ */
/* Allowlist                                                           */
/* ------------------------------------------------------------------ */

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  const entries = parsed.allow ?? [];
  // Fail-closed: an entry without a reason or a rule is not an exemption.
  for (const [i, entry] of entries.entries()) {
    if (!entry.file || !entry.rule) {
      throw new Error(`${ALLOWLIST_PATH}: allow[${i}] needs both "file" and "rule"`);
    }
    if (!entry.reason || entry.reason.trim().length < 10) {
      throw new Error(`${ALLOWLIST_PATH}: allow[${i}] needs a reason (>= 10 chars) — no silent exemptions`);
    }
  }
  return entries;
}

const isAllowed = (entries, file, rule) =>
  entries.some(
    (entry) =>
      entry.rule === rule &&
      (entry.file === file || (entry.prefix && file.startsWith(entry.prefix))),
  );

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".js", ".cjs", ".ts", ".yml", ".yaml", ".json", ".sh", ".html", ".css", ".txt", ".env", ".toml",
]);

const SKIP = [/^node_modules\//, /^\.index\//, /^\.git\//, /^package-lock\.json$/, /^\.pii-allowlist\.json$/];

function stagedFiles() {
  const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
}

/** For staged mode read the blob as committed, not the working tree. */
function stagedContent(file) {
  return execFileSync("git", ["show", `:${file}`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/** Scan one document. Exported so properties can prove masking never leaks. */
export function scanContent(file, content, exemptions = []) {
  const found = [];
  content.split("\n").forEach((line, index) => {
    // A line can trip several rules (a 14-digit ID also looks like a phone).
    // Report the most severe match, and name the others instead of hiding them.
    const hits = [];
    for (const rule of RULES) {
      const match = line.match(rule.test);
      if (!match) continue;
      if (rule.validate && !rule.validate(match[0])) continue;
      if (isAllowed(exemptions, file, rule.id)) continue;
      hits.push({ rule, match: match[0] });
    }
    if (!hits.length) return;

    const rank = { critical: 3, high: 2, medium: 1 };
    hits.sort((a, b) => rank[b.rule.severity] - rank[a.rule.severity]);
    const [primary] = hits;
    let maskedLine = line;
    for (const hit of hits) maskedLine = maskedLine.split(hit.match).join(maskValue(hit.match));

    found.push({
      file,
      line: index + 1,
      rule: primary.rule.id,
      severity: primary.rule.severity,
      also: hits.slice(1).map((hit) => hit.rule.id),
      why: primary.rule.why,
      masked: maskValue(primary.match),
      excerpt: excerpt(maskedLine),
    });
  });
  return found;
}

function main() {
  const argv = process.argv.slice(2);
  const STAGED = argv.includes("--staged");
  const JSON_OUT = argv.includes("--json");
  const EXPLAIN = argv.includes("--explain");

  if (EXPLAIN) {
    console.log("rules (id · severity · why):\n");
    for (const rule of RULES) {
      console.log(`  ${rule.id.padEnd(20)} ${rule.severity.padEnd(9)} ${rule.why}`);
    }
    console.log(`\nexemptions: ${ALLOWLIST_PATH} (every entry needs a reason)`);
    console.log("bypass: none — use the allowlist, so the exemption is reviewed");
    return;
  }

  let allowlist;
  try {
    allowlist = loadAllowlist();
  } catch (error) {
    // A malformed allowlist is a configuration error, not a reason to scan unscoped.
    console.error(`\x1b[31m✗\x1b[0m ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const files = (STAGED ? stagedFiles() : trackedFiles()).filter(
    (file) => TEXT_EXTENSIONS.has(extname(file)) && !SKIP.some((pattern) => pattern.test(file)),
  );

  const findings = [];
for (const file of files) {
  let content;
  try {
  content = STAGED ? stagedContent(file) : readFileSync(file, "utf8");
  } catch {
  continue; // deleted or binary
  }
  if (content.length > 2 * 1024 * 1024) continue;
  findings.push(...scanContent(file, content, allowlist));
}

const bySeverity = findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {});

if (JSON_OUT) {
  console.log(JSON.stringify({ mode: STAGED ? "staged" : "tracked", files: files.length, findings, bySeverity }, null, 2));
} else {
  for (const f of findings) {
  const also = f.also.length ? ` +${f.also.join("+")}` : "";
  console.log(`\x1b[31m✗\x1b[0m ${f.file}:${f.line} · ${f.rule}${also} (${f.severity}) · \x1b[2m${f.masked}\x1b[0m`);
  console.log(`    ${f.excerpt}`);
  console.log(`    why: ${f.why}`);
  }
  console.log(
  `\nprivacy: ${files.length} file(s) scanned (${STAGED ? "staged" : "tracked"}) · ${findings.length} finding(s)` +
    (findings.length ? ` · ${Object.entries(bySeverity).map(([k, v]) => `${v} ${k}`).join(", ")}` : ""),
  );
  if (findings.length) {
  console.log("remove the data, or add a reviewed exemption to .pii-allowlist.json with a reason.");
  console.log("policy: docs/security/pii-guard.md");
  }
}

  if (findings.length) process.exitCode = 1;
}

// Only run when invoked directly: the property suite imports scanContent().
if (process.argv[1] && process.argv[1].endsWith("check-pii.mjs")) main();
