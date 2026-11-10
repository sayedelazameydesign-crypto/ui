#!/usr/bin/env node
// Append-only, hash-chained audit ledger.
//
//   node scripts/ledger.mjs verify            # check the chain end-to-end
//   node scripts/ledger.mjs tail -n 10        # most recent entries
//   node scripts/ledger.mjs append --kind note --message "…"
//
// Each entry commits to the previous one:
//     entryHash = sha256(prevHash + canonicalJSON(entry))
// so removing, reordering or editing a line breaks every later hash. That is what
// "tamper-evident" means here — not "nobody can write", but "nobody can change
// history without the chain saying so".
//
// The ledger is local runtime state (.agent/ledger.jsonl, git-ignored): it records
// this machine's actions, not a central authority. Integrity is checked by the
// repository guard whenever the file exists.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const LEDGER_PATH = ".agent/ledger.jsonl";
export const ANCHOR_PATH = ".agent/ledger.anchor.json";

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

export const hashEntry = (entry) =>
  createHash("sha256").update(`${entry.prev ?? ""}${canonical(entry)}`).digest("hex");

export function readLedger(root) {
  const path = join(root, LEDGER_PATH);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * @returns {{ ok: boolean, entries: number, brokenAt: number|null, reason: string }}
 */
export function verifyLedger(root) {
  const entries = readLedger(root);
  let prev = "";
  for (const [index, entry] of entries.entries()) {
    if (entry.seq !== index + 1) {
      return { ok: false, entries: entries.length, brokenAt: index + 1, reason: `sequence gap: expected ${index + 1}, found ${entry.seq}` };
    }
    if ((entry.prev ?? "") !== prev) {
      return { ok: false, entries: entries.length, brokenAt: index + 1, reason: "previous-hash mismatch (an entry was removed or reordered)" };
    }
    // Recompute over the entry *without* its hash field. `{...entry, hash: undefined}`
    // would keep the key and hash a different string — the difference between
    // "absent" and "present but undefined" is exactly what canonical JSON must not hide.
    const { hash, ...rest } = entry;
    const expected = hashEntry(rest);
    if (expected !== hash) {
      return { ok: false, entries: entries.length, brokenAt: index + 1, reason: "entry hash does not match its content (edited in place)" };
    }
    prev = entry.hash;
  }
  const anchor = readAnchor(root);
  if (anchor && entries.length < anchor.entries) {
    return {
      ok: false,
      entries: entries.length,
      brokenAt: entries.length + 1,
      reason: `truncated: anchor commits to ${anchor.entries} entries, ledger has ${entries.length}`,
    };
  }
  if (anchor && entries[anchor.entries - 1] && entries[anchor.entries - 1].hash !== anchor.hash) {
    return { ok: false, entries: entries.length, brokenAt: anchor.entries, reason: "anchored entry hash no longer matches the anchor" };
  }
  return { ok: true, entries: entries.length, brokenAt: null, reason: entries.length ? `chain intact${anchor ? " · anchored" : ""}` : "ledger is empty" };
}

/**
 * An anchor is an external commitment (tracked in git) to the chain's length and
 * head hash. Without one, deleting the last N entries is undetectable — a hash
 * chain cannot prove that it was not truncated. `verify` refuses to go below it.
 */
export function readAnchor(root) {
  const path = join(root, ANCHOR_PATH);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function writeAnchor(root) {
  const entries = readLedger(root);
  const anchor = { entries: entries.length, hash: entries.at(-1)?.hash ?? "", at: new Date().toISOString() };
  writeFileSync(join(root, ANCHOR_PATH), `${JSON.stringify(anchor, null, 2)}\n`);
  return anchor;
}

export function appendEntry(root, { kind, ...payload }) {
  const path = join(root, LEDGER_PATH);
  mkdirSync(dirname(path), { recursive: true });
  const entries = readLedger(root);
  const prev = entries.length ? entries[entries.length - 1].hash : "";
  const entry = {
    seq: entries.length + 1,
    at: new Date().toISOString(),
    kind,
    ...payload,
    prev,
  };
  entry.hash = hashEntry(entry);
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
  return entry;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function main() {
  const argv = process.argv.slice(2);
  const command = argv.find((arg) => !arg.startsWith("--")) ?? "verify";
  const value = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at !== -1 && argv[at + 1] ? argv[at + 1] : fallback;
  };
  const root = process.cwd();

  if (command === "verify") {
    const result = verifyLedger(root);
    if (argv.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ledger: ${result.reason} (${result.entries} entries)`);
      if (!result.ok) console.log(`    first broken entry: ${result.brokenAt}`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "tail") {
    const count = Number(value("n", 10));
    for (const entry of readLedger(root).slice(-count)) {
      console.log(`#${entry.seq} ${entry.at} ${entry.kind} ${JSON.stringify({ ...entry, seq: undefined, at: undefined, kind: undefined, prev: undefined, hash: undefined })}`);
    }
    return;
  }

  if (command === "anchor") {
    const anchor = writeAnchor(root);
    console.log(`anchored ${anchor.entries} entr${anchor.entries === 1 ? "y" : "ies"} at ${anchor.hash.slice(0, 12)}…`);
    return;
  }

  if (command === "append") {
    const entry = appendEntry(root, { kind: value("kind", "note"), message: value("message", "") });
    console.log(`appended #${entry.seq} (${entry.kind}) · hash ${entry.hash.slice(0, 12)}…`);
    return;
  }

  console.error(`unknown command: ${command} (verify | tail | append | anchor)`);
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("ledger.mjs")) main();
