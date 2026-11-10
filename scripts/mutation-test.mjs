#!/usr/bin/env node
// Mutation testing for the guards themselves.
//
//   node scripts/mutation-test.mjs            # every mutant
//   node scripts/mutation-test.mjs --quick    # the two fastest (used by the guard)
//   node scripts/mutation-test.mjs --json
//
// A test suite that passes is not evidence that it *can* fail. Each mutant below
// disables one protection in the code; the suite must then fail. A mutant that
// survives is a blind spot — either the test is too weak or the protection was
// never exercised.
//
// Safety: every file is restored from an in-memory copy in a `finally` block, and
// the restore is verified by SHA-256. If a restore ever fails, the process exits
// non-zero with the backup path rather than leaving a mutated repository behind.
//
// Decision record: docs/adr/0016-mutation-testing.md

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitRoot } from "./semantic/lib.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");

/**
 * detect:
 *   { cmd: [args], expect: "fail" }  run a node script; nonzero means "killed"
 *   { tamperedLedger: true }         build a temp root with a broken chain first
 */
const MUTANTS = [
  {
    id: "schema-unknown-keys",
    file: "scripts/lib/schema.mjs",
    find: '} else if (additional !== true && declaresShape) {',
    replace: '} else if (false && declaresShape) {',
    breaks: "closed-object validation: unknown config keys stop being errors",
    detect: { kind: "property", only: "boundaries" },
    quick: true,
  },
  {
    id: "pii-mask-disabled",
    file: "scripts/check-pii.mjs",
    find: 'export const maskValue = (value) => {',
    replace: 'export const maskValue = (value) => {\n  if (value) return String(value); // MUTANT: no masking',
    breaks: "masking of PII findings: scans would print the secret they found",
    detect: { kind: "property", only: "boundaries" },
    quick: true,
  },
  {
    id: "ledger-chain-ignored",
    file: "scripts/ledger.mjs",
    find: '    if (expected !== hash) {',
    replace: '    if (false && expected !== hash) {',
    breaks: "tamper-evidence: an edited entry would pass verification",
    detect: { kind: "tampered-ledger" },
    quick: false,
  },
  {
    id: "packer-budget-ignored",
    file: "scripts/context-pack.mjs",
    find: '    if (tokens + nodeTokens > budgetTokens) {',
    replace: '    if (false && tokens + nodeTokens > budgetTokens) {',
    breaks: "the token budget: packs would grow past what the caller asked for",
    detect: { kind: "property", only: "context" },
    quick: false,
  },
  {
    id: "bm25-idf-sign",
    file: "scripts/semantic/core.mjs",
    find: '    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));\n    for (const [i, tf] of list) {',
    replace: '    const idf = -Math.log(1 + (N - df + 0.5) / (df + 0.5));\n    for (const [i, tf] of list) {',
    breaks: "BM25 weighting: rarer terms would count less than common ones",
    detect: { kind: "property", only: "semantic" },
    quick: false,
  },
  {
    id: "sanitiser-disabled",
    file: "scripts/security/adversarial.mjs",
    find: '    if (cls && CLASSES[cls].severity === "block") {',
    replace: '    if (false && cls && CLASSES[cls].severity === "block") {',
    breaks: "neutralisation: invisible and bidi codepoints would reach the packed context",
    detect: { kind: "property", only: "adversarial" },
    quick: false,
  },
  {
    id: "joiner-flagged-everywhere",
    file: "scripts/security/adversarial.mjs",
    find: '      if (cls === "joiner-codepoint" && !/[A-Za-z]/.test(line[i - 1] ?? "") && !/[A-Za-z]/.test(line[i + 1] ?? "")) cls = null;',
    replace: '      // MUTANT: flag joiners regardless of script',
    breaks: "the joiner exemption: every Persian word with a ZWNJ would be reported",
    detect: { kind: "property", only: "adversarial" },
    quick: false,
  },
  {
    id: "excerpt-raw-bytes",
    file: "scripts/security/adversarial.mjs",
    find: '  return slice.replace(/[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069\\u00ad]/gu, (c) => escapeForReport(c));',
    replace: '  return slice; // MUTANT: report the raw bytes',
    breaks: "report escaping: a finding would print the codepoint it is reporting on",
    detect: { kind: "property", only: "adversarial" },
    quick: false,
  },
  {
    id: "negation-ignored",
    file: "scripts/security/adversarial.mjs",
    find: '        if (!match || negated(line, match.index)) continue;',
    replace: '        if (!match) continue; // MUTANT: no negation suppression',
    breaks: "negation suppression: a policy saying \"never reveal your API keys\" would be an injection",
    detect: { kind: "property", only: "adversarial" },
    quick: false,
  },
];

function runDetector(mutant, root) {
  if (mutant.detect.kind === "tampered-ledger") {
    // Two independent forgeries, because a single one can be caught by a single
    // check: (a) an entry edited in place, (b) an entry removed from the middle.
    // A ledger that survives either is not tamper-evident.
    const forgeries = {
      "edited in place": [
        { seq: 1, at: "2026-01-01T00:00:00.000Z", kind: "note", message: "ok", prev: "" },
        { seq: 2, at: "2026-01-01T00:00:01.000Z", kind: "note", message: "edited later", prev: "PLACEHOLDER" },
      ],
      "entry removed": [
        { seq: 1, at: "2026-01-01T00:00:00.000Z", kind: "note", message: "ok", prev: "" },
        { seq: 3, at: "2026-01-01T00:00:02.000Z", kind: "note", message: "third", prev: "PLACEHOLDER" },
      ],
    };

    const escaped = [];
    for (const [name, entries] of Object.entries(forgeries)) {
      const scratch = mkdtempSync(join(tmpdir(), "mutant-ledger-"));
      mkdirSync(join(scratch, ".agent"), { recursive: true });
      // Chain the hashes honestly, so the only thing wrong is the forgery itself.
      let prev = "";
      const chained = entries.map((entry, index) => {
        const record = { ...entry, seq: entry.seq ?? index + 1, prev };
        const hash = sha(`${prev}${JSON.stringify(record)}`); // deliberately not the real hashEntry: the forgery must look plausible
        prev = hash;
        return { ...record, hash };
      });
      writeFileSync(join(scratch, ".agent/ledger.jsonl"), `${chained.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
      try {
        execFileSync("node", [join(root, "scripts/ledger.mjs"), "verify"], { cwd: scratch, encoding: "utf8", stdio: "pipe" });
        escaped.push(name);
      } catch {
        /* rejected, as it must be */
      }
    }

    return {
      holds: escaped.length === 0,
      detail: escaped.length ? `accepted a forged ledger (${escaped.join(", ")})` : "both forgeries rejected",
    };
  }

  try {
    const output = execFileSync(
      "node",
      ["scripts/property-test.mjs", "--only", mutant.detect.only, "--quiet", "--runs", "20"],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    );
    return { holds: true, detail: `property suite passed: ${output.trim().split("\n").filter(Boolean).at(-1) ?? ""}` };
  } catch (error) {
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const failing = text.split("\n").find((line) => line.includes("✗")) ?? "";
    return { holds: false, detail: (failing || text.split("\n").filter(Boolean).at(-1) || "suite failed").replace(/\x1b\[[0-9;]*m/g, "").trim().slice(0, 120) };
  }
}

function main() {
  const argv = process.argv.slice(2);
  const QUICK = argv.includes("--quick");
  const JSON_OUT = argv.includes("--json");
  const root = gitRoot();

  const selected = QUICK ? MUTANTS.filter((mutant) => mutant.quick) : MUTANTS;
  const results = [];

  for (const mutant of selected) {
    const path = join(root, mutant.file);
    if (!existsSync(path)) {
      results.push({ id: mutant.id, status: "skipped", detail: `${mutant.file} is missing` });
      continue;
    }

    const original = readFileSync(path, "utf8");
    const originalHash = sha(original);
    if (!original.includes(mutant.find)) {
      results.push({ id: mutant.id, status: "stale-mutant", detail: "the code no longer contains this pattern — update the mutant, do not delete it" });
      continue;
    }

    // Baseline: the protection must hold *before* mutating, otherwise "the mutant was
    // caught" would be indistinguishable from "the suite was already broken".
    const baseline = runDetector(mutant, root);
    if (!baseline.holds) {
      results.push({ id: mutant.id, status: "broken-baseline", detail: baseline.detail });
      continue;
    }

    let outcome;
    try {
      writeFileSync(path, original.replace(mutant.find, mutant.replace));
      outcome = runDetector(mutant, root);
    } finally {
      writeFileSync(path, original);
      const restoredHash = sha(readFileSync(path, "utf8"));
      if (restoredHash !== originalHash) {
        console.error(`\x1b[31m✗ FATAL\x1b[0m ${mutant.file} was not restored — original hash ${originalHash}`);
        process.exit(3);
      }
    }

    results.push({
      id: mutant.id,
      status: outcome.holds ? "survived" : "killed",
      breaks: mutant.breaks,
      detail: outcome.holds ? `behaviour unchanged: ${outcome.detail}` : `behaviour changed: ${outcome.detail}`,
    });
  }

  const survived = results.filter((r) => r.status === "survived");
  const stale = results.filter((r) => r.status === "stale-mutant" || r.status === "broken-baseline");

  if (JSON_OUT) {
    console.log(JSON.stringify({ mutants: results.length, killed: results.filter((r) => r.status === "killed").length, survived: survived.length, results }, null, 2));
  } else {
    console.log(`mutation testing · ${results.length} mutant(s) · every file restored and verified\n`);
    for (const result of results) {
      const mark = result.status === "killed" ? "\x1b[32m✓\x1b[0m" : result.status === "survived" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m!\x1b[0m";
      console.log(`${mark} ${result.id.padEnd(22)} ${result.status}`);
      if (result.breaks) console.log(`    disables: ${result.breaks}`);
      if (result.detail) console.log(`    ${result.detail}`);
    }
    console.log(`\n${results.filter((r) => r.status === "killed").length}/${results.length} mutants killed`);
    if (survived.length) console.log("a surviving mutant is a blind spot: strengthen the test, not the mutant.");
    if (stale.length) console.log("a stale mutant means the guard changed shape: update the mutant.");
  }

  if (survived.length || stale.length) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("mutation-test.mjs")) main();
