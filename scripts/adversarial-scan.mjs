#!/usr/bin/env node
// Adversarial-input scanner: what an agent reads, versus what a reviewer sees.
//
//   node scripts/adversarial-scan.mjs                  # every tracked file
//   node scripts/adversarial-scan.mjs --staged         # staged blobs (pre-commit)
//   node scripts/adversarial-scan.mjs --file path      # one file
//   node scripts/adversarial-scan.mjs --text -         # stdin
//   node scripts/adversarial-scan.mjs --sanitize < f   # print neutralised text
//   node scripts/adversarial-scan.mjs --corpus         # the payload fixture suite
//   node scripts/adversarial-scan.mjs --explain        # classes, intent, verdict
//   node scripts/adversarial-scan.mjs --json
//
// Two kinds of finding, on purpose:
//   block  deterministic — no legitimate use in prose or source. Fails the scan.
//   warn   has legitimate uses (a policy doc quoting an attack, a Persian ZWNJ,
//          a tracking pixel in a screenshot). Needs review, which is an allowlist
//          entry with a reason — never a flag that turns the check off.
//
// The detector never claims to understand intent: it recognises shapes, and a
// paraphrase defeats it. That limit is documented rather than engineered away.
//
// Policy: docs/security/adversarial-inputs.md · docs/adr/0019-adversarial-inputs.md

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { CLASSES, scanText, sanitizeText } from "./security/adversarial.mjs";

const ALLOWLIST_PATH = ".adversarial-allowlist.json";
const CORPUS_PATH = "tests/adversarial/cases.json";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const next = argv[at + 1];
  return next && !next.startsWith("--") ? next : true;
};

const JSON_OUT = flag("json");
const COLOR = process.stdout.isTTY && !JSON_OUT;
const paint = (code, text) => (COLOR ? `\x1b[${code}m${text}\x1b[0m` : text);

/* ------------------------------------------------------------------ */
/* Targets and exemptions                                              */
/* ------------------------------------------------------------------ */

const TEXT_EXTENSIONS = new Set([
  ".md", ".mjs", ".js", ".cjs", ".ts", ".yml", ".yaml", ".json", ".sh", ".html", ".css", ".txt", ".toml",
]);

// The corpus is the scanner's own input: it contains payloads *by design*, stored
// escaped so the fixture file can never be the attack. Generated mirrors are
// excluded for the same reason the semantic index excludes them.
const SKIP = [
  /^node_modules\//, /^\.index\//, /^\.git\//, /^package-lock\.json$/,
  /^tests\/adversarial\//, /^playground\/index\.json$/,
  new RegExp(`^${ALLOWLIST_PATH.replace(/\./g, "\\.")}$`),
];

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  const entries = parsed.allow ?? [];
  // Fail-closed: an exemption without a reason is not a review.
  for (const [i, entry] of entries.entries()) {
    if (!entry.file && !entry.prefix) throw new Error(`${ALLOWLIST_PATH}: allow[${i}] needs "file" or "prefix"`);
    if (!entry.class || !CLASSES[entry.class]) throw new Error(`${ALLOWLIST_PATH}: allow[${i}] needs a known "class"`);
    if (!entry.reason || entry.reason.trim().length < 15) {
      throw new Error(`${ALLOWLIST_PATH}: allow[${i}] needs a reason (>= 15 chars) — no silent exemptions`);
    }
  }
  return entries;
}

const exemptionFor = (entries, file, cls) =>
  entries.find((entry) => entry.class === cls && (entry.file === file || (entry.prefix && file.startsWith(entry.prefix)))) ?? null;

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)))
    .filter((file) => !SKIP.some((re) => re.test(file)));
}

function stagedFiles() {
  return execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)))
    .filter((file) => !SKIP.some((re) => re.test(file)));
}

/** Read the blob as staged, not the working tree: the hook must check what is committed. */
const stagedContent = (file) => execFileSync("git", ["show", `:${file}`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

/* ------------------------------------------------------------------ */
/* Modes                                                               */
/* ------------------------------------------------------------------ */

function explain() {
  console.log("adversarial-input classes\n");
  for (const [id, meta] of Object.entries(CLASSES)) {
    console.log(`  ${id.padEnd(20)} ${meta.severity.padEnd(5)} ${meta.why}`);
  }
  console.log("\nblock = fails the scan · warn = needs an allowlist entry with a reason");
}

function corpus() {
  if (!existsSync(CORPUS_PATH)) {
    console.error(`no corpus at ${CORPUS_PATH}`);
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
  const cases = data.cases ?? [];
  const benign = data.benign ?? [];

  const missed = [];
  const byClass = new Map();
  for (const testCase of cases) {
    const { findings } = scanText(testCase.payload, { file: testCase.id });
    const hit = findings.some((f) => f.class === testCase.class);
    const bucket = byClass.get(testCase.class) ?? { total: 0, detected: 0 };
    bucket.total += 1;
    if (hit) bucket.detected += 1;
    else missed.push({ id: testCase.id, class: testCase.class, why: testCase.why });
    byClass.set(testCase.class, bucket);
  }

  const falsePositives = [];
  for (const testCase of benign) {
    const { findings } = scanText(testCase.text, { file: testCase.id });
    if (findings.length) {
      falsePositives.push({ id: testCase.id, findings: findings.map((f) => `${f.class}@${f.line}:${f.column}`) });
    }
  }

  const detected = cases.length - missed.length;
  if (JSON_OUT) {
    console.log(JSON.stringify({
      cases: cases.length,
      detected,
      missed,
      benign: benign.length,
      falsePositives,
      byClass: Object.fromEntries(byClass),
    }, null, 2));
  } else {
    console.log(`adversarial corpus · ${cases.length} payload(s) · ${benign.length} benign sample(s)\n`);
    for (const [cls, bucket] of [...byClass].sort()) {
      const mark = bucket.detected === bucket.total ? paint("32", "✓") : paint("31", "✗");
      console.log(`  ${mark} ${cls.padEnd(20)} ${bucket.detected}/${bucket.total}`);
    }
    for (const miss of missed) console.log(`  ${paint("31", "missed")} ${miss.id} (${miss.class}) — ${miss.why}`);
    for (const fp of falsePositives) console.log(`  ${paint("31", "false positive")} ${fp.id} → ${fp.findings.join(", ")}`);
    console.log(
      `\n  benign samples flagged: ${falsePositives.length}/${benign.length} ` +
        `(a scanner that cries wolf gets switched off, which is worse than no scanner)`,
    );
  }
  process.exit(missed.length === 0 && falsePositives.length === 0 ? 0 : 1);
}

function sanitizeMode(text, label) {
  const { text: clean, removed, total } = sanitizeText(text);
  if (JSON_OUT) {
    console.log(JSON.stringify({ file: label, removed, total, text: clean }, null, 2));
    return;
  }
  process.stdout.write(clean);
  if (COLOR && total) console.error(`\n[neutralised ${total} invisible/bidi/control codepoint(s): ${JSON.stringify(removed)}]`);
}

function scanTargets(targets, { readContent, label }) {
  const allow = loadAllowlist();
  const findings = [];
  const exempt = [];
  let scanned = 0;
  let bytes = 0;

  for (const file of targets) {
    let content;
    try {
      content = readContent(file);
    } catch {
      continue; // deleted between listing and reading: not this check's problem
    }
    if (typeof content !== "string") continue;
    scanned += 1;
    bytes += content.length;
    const result = scanText(content, { file });
    for (const finding of result.findings) {
      const exemption = exemptionFor(allow, file, finding.class);
      if (exemption) exempt.push({ ...finding, file, reason: exemption.reason });
      else findings.push({ ...finding, file });
    }
  }

  const block = findings.filter((f) => f.severity === "block");
  const warn = findings.filter((f) => f.severity === "warn");

  if (JSON_OUT) {
    console.log(JSON.stringify({
      label,
      files: scanned,
      bytes,
      block: block.length,
      warn: warn.length,
      exempt: exempt.length,
      findings,
    }, null, 2));
  } else {
    const show = (list) => {
      for (const finding of list.slice(0, 25)) {
        console.log(`  ${paint("31", "✗")} ${finding.file}:${finding.line}:${finding.column} ${finding.class} — ${finding.detail}`);
        console.log(`      ${finding.excerpt}`);
      }
      if (list.length > 25) console.log(`  … ${list.length - 25} more`);
    };

    console.log(`adversarial scan · ${label} · ${scanned} file(s) · ${(bytes / 1024).toFixed(0)} KiB\n`);
    if (!findings.length) {
      console.log(`  ${paint("32", "✓")} no block or warn findings`);
    } else {
      show(block);
      show(warn);
    }
    if (exempt.length) {
      console.log(`\n  ${exempt.length} reviewed exemption(s):`);
      for (const finding of exempt) console.log(`  · ${finding.file} ${finding.class} — ${finding.reason}`);
    }
    console.log(
      `\n  block ${block.length} · warn ${warn.length} · exempt ${exempt.length}` +
        (block.length ? `\n  block findings are defects: fix the file, not the scanner.` : ""),
    );
  }

  return block.length === 0 && warn.length === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

if (flag("explain")) {
  explain();
  process.exit(0);
} else if (flag("corpus")) {
  corpus();
} else if (value("text") === true || value("text") === "-") {
  const text = readFileSync(0, "utf8");
  if (flag("sanitize")) sanitizeMode(text, "<stdin>");
  else process.exit(scanTargets(["-"], { readContent: () => text, label: "stdin" }));
} else if (typeof value("file") === "string") {
  const file = value("file");
  const text = readFileSync(file, "utf8");
  if (flag("sanitize")) sanitizeMode(text, file);
  else process.exit(scanTargets([file], { readContent: (f) => readFileSync(f, "utf8"), label: file }));
} else if (flag("staged")) {
  process.exit(scanTargets(stagedFiles(), { readContent: stagedContent, label: "staged diff" }));
} else {
  process.exit(scanTargets(trackedFiles(), { readContent: (f) => readFileSync(f, "utf8"), label: "tracked files" }));
}
