#!/usr/bin/env node
// Deterministic state snapshots: capture, verify, roll back.
//
//   node scripts/snapshot.mjs save --label "before refactor"
//   node scripts/snapshot.mjs list
//   node scripts/snapshot.mjs verify [id]
//   node scripts/snapshot.mjs restore <id> [--force]
//
// What is captured: the *generated, derived, and local* state that Git does not
// track — the semantic index, the playground export, the architecture graph and
// the artifact manifest. Source code is already versioned by Git; duplicating it
// here would be a slower, worse copy of `git checkout`.
//
// Rollback is guarded, not automatic:
//   · every file's SHA-256 is recorded, and restore refuses a snapshot that no
//     longer matches its own record;
//   · the Git tree at capture time is recorded, and restore refuses to write into
//     a different tree unless --force is passed — restoring yesterday's index into
//     today's source is a *different* bug, not a recovery;
//   · both actions are appended to the hash-chained audit ledger.
//
// Policy and limits: docs/agents/state-and-rollback.md · ADR-0015

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gitRoot } from "./semantic/lib.mjs";
import { appendEntry, verifyLedger } from "./ledger.mjs";

export const SNAPSHOT_DIR = ".agent/snapshots";
export const TRACKED_STATE = [
  ".index/semantic.json",
  "playground/index.json",
  "docs/architecture/graph.json",
  "docs/architecture/graph.md",
  "artifacts.manifest.json",
];

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const git = (root, args) => {
  try {
    // stderr suppressed: a temp directory is legitimately not a git repository,
    // and the property suite calls this constantly.
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

export function snapshotNames(root) {
  const dir = join(root, SNAPSHOT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => existsSync(join(dir, name, "snapshot.json"))).sort();
}

export function createSnapshot(root, label = "unlabelled") {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = join(root, SNAPSHOT_DIR, id);
  mkdirSync(dir, { recursive: true });

  const files = [];
  for (const path of TRACKED_STATE) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    const bytes = readFileSync(absolute);
    const name = path.replace(/[/]/g, "__");
    copyFileSync(absolute, join(dir, name));
    files.push({ path, name, bytes: bytes.length, sha256: sha(bytes) });
  }

  const record = {
    version: 1,
    id,
    label,
    createdAt: new Date().toISOString(),
    git: { head: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]), dirty: git(root, ["status", "--porcelain"]) !== "" },
    files,
    ledgerSeq: verifyLedger(root).entries + 1,
  };
  writeFileSync(join(dir, "snapshot.json"), `${JSON.stringify(record, null, 2)}\n`);
  appendEntry(root, { kind: "snapshot.save", id, label, files: files.length, tree: record.git.tree.slice(0, 12) });
  return record;
}

/** @returns {{ ok: boolean, reasons: string[] }} */
export function verifySnapshot(root, record) {
  const reasons = [];
  const dir = join(root, SNAPSHOT_DIR, record.id);
  if (!existsSync(dir)) return { ok: false, reasons: ["snapshot directory is missing"] };

  for (const file of record.files) {
    const copy = join(dir, file.name);
    if (!existsSync(copy)) {
      reasons.push(`${file.path}: copy missing`);
      continue;
    }
    const digest = sha(readFileSync(copy));
    if (digest !== file.sha256) reasons.push(`${file.path}: copy altered (sha256 mismatch)`);
  }

  const chain = verifyLedger(root);
  if (!chain.ok) reasons.push(`audit ledger is broken: ${chain.reason}`);

  return { ok: reasons.length === 0, reasons };
}

export function restoreSnapshot(root, record, { force = false } = {}) {
  const check = verifySnapshot(root, record);
  if (!check.ok) throw new Error(`refusing to restore ${record.id}: ${check.reasons.join("; ")}`);

  const currentTree = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (!force && record.git.tree && currentTree && currentTree !== record.git.tree) {
    throw new Error(
      `refusing to restore ${record.id}: it was captured on tree ${record.git.tree.slice(0, 12)}, ` +
        `HEAD is ${currentTree.slice(0, 12)}. Reverting derived state into different sources is not a rollback.`,
    );
  }

  const restored = [];
  for (const file of record.files) {
    const target = join(root, file.path);
    mkdirSync(join(target, ".."), { recursive: true });
    copyFileSync(join(root, SNAPSHOT_DIR, record.id, file.name), target);
    const digest = sha(readFileSync(target));
    if (digest !== file.sha256) throw new Error(`${file.path}: restored bytes do not match the record`);
    restored.push(file.path);
  }

  appendEntry(root, { kind: "snapshot.restore", id: record.id, files: restored.length, forced: Boolean(force) });
  return restored;
}

export function loadSnapshot(root, id) {
  const exact = join(root, SNAPSHOT_DIR, id, "snapshot.json");
  if (existsSync(exact)) return JSON.parse(readFileSync(exact, "utf8"));
  // Allow a unique prefix, because full timestamps are painful to type.
  const matches = snapshotNames(root).filter((name) => name.startsWith(id));
  if (matches.length === 1) return JSON.parse(readFileSync(join(root, SNAPSHOT_DIR, matches[0], "snapshot.json"), "utf8"));
  if (matches.length > 1) throw new Error(`ambiguous id "${id}": ${matches.length} snapshots match`);
  throw new Error(`no snapshot "${id}" — run: node scripts/snapshot.mjs list`);
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function main() {
  const argv = process.argv.slice(2);
  const command = argv.find((arg) => !arg.startsWith("--")) ?? "list";
  const value = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at !== -1 && argv[at + 1] ? argv[at + 1] : fallback;
  };
  const root = gitRoot();

  if (command === "save") {
    const record = createSnapshot(root, value("label", "unlabelled"));
    console.log(`\x1b[32m✓\x1b[0m snapshot ${record.id} · ${record.files.length} file(s) · ${record.label}`);
    console.log(`  git tree ${record.git.tree.slice(0, 12)}${record.git.dirty ? " (working tree was dirty)" : ""}`);
    return;
  }

  if (command === "list") {
    const names = snapshotNames(root);
    if (!names.length) {
      console.log("no snapshots yet — run: node scripts/snapshot.mjs save --label \"before change\"");
      return;
    }
    for (const name of names) {
      const record = JSON.parse(readFileSync(join(root, SNAPSHOT_DIR, name, "snapshot.json"), "utf8"));
      const check = verifySnapshot(root, record);
      console.log(`${check.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${record.id} · ${record.files.length} files · ${record.label} · tree ${record.git.tree.slice(0, 12)}`);
      if (!check.ok) for (const reason of check.reasons) console.log(`    ${reason}`);
    }
    return;
  }

  if (command === "verify") {
    const records = value("id") ? [loadSnapshot(root, value("id"))] : snapshotNames(root).map((name) => JSON.parse(readFileSync(join(root, SNAPSHOT_DIR, name, "snapshot.json"), "utf8")));
    let failed = 0;
    for (const record of records) {
      const check = verifySnapshot(root, record);
      console.log(`${check.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${record.id}: ${check.ok ? "intact" : check.reasons.join("; ")}`);
      if (!check.ok) failed += 1;
    }
    if (!records.length) console.log("nothing to verify");
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (command === "restore") {
    const id = argv.find((arg, index) => index > argv.indexOf("restore") && !arg.startsWith("--"));
    if (!id) {
      console.error("usage: node scripts/snapshot.mjs restore <id> [--force]");
      process.exitCode = 2;
      return;
    }
    try {
      const record = loadSnapshot(root, id);
      const restored = restoreSnapshot(root, record, { force: argv.includes("--force") });
      console.log(`\x1b[32m✓\x1b[0m restored ${record.id} · ${restored.length} file(s): ${restored.join(", ")}`);
      console.log(`  bytes verified against the snapshot record · entry appended to the audit ledger`);
    } catch (error) {
      console.error(`\x1b[31m✗\x1b[0m ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "prune") {
    const keep = Number(value("keep", 10));
    const names = snapshotNames(root);
    for (const name of names.slice(0, Math.max(0, names.length - keep))) {
      rmSync(join(root, SNAPSHOT_DIR, name), { recursive: true, force: true });
      console.log(`removed ${name}`);
    }
    return;
  }

  console.error(`unknown command: ${command} (save | list | verify | restore | prune)`);
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("snapshot.mjs")) main();
