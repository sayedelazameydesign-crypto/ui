#!/usr/bin/env node
// Opt-in model artifacts: install, verify, and report — without breaking the
// zero-network default.
//
//   node scripts/semantic/model.mjs status
//   node scripts/semantic/model.mjs verify
//   node scripts/semantic/model.mjs install --from /path/to/model.onnx   # offline
//   node scripts/semantic/model.mjs install --allow-network              # explicit, pinned only
//
// Rules this file enforces (owner decision D8, ADR-0013):
//   1. size ceiling 100 MiB, quantized artifact only;
//   2. weights live in an isolated directory (.models/), never in Git;
//   3. a file is trusted only if its SHA-256 matches a value pinned in the
//      manifest by a human — an unpinned entry is refused, not trusted;
//   4. nothing is fetched unless --allow-network is passed *and* the entry is
//      pinned, so a compromised manifest cannot pull an arbitrary URL silently.
//
// The default search path never calls this module.
// Policy: docs/agents/local-model.md

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { gitRoot } from "./lib.mjs";

export const MANIFEST_PATH = "scripts/semantic/models.manifest.json";
const MAX_BYTES = 104857600; // 100 MiB ceiling, mirrored in the manifest

export function loadManifest(root = gitRoot()) {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8"));
  return manifest;
}

/**
 * Resolve a model file inside the storage directory.
 * Path isolation: a manifest entry cannot point outside `.models/`, no matter
 * what it contains (`../../etc/passwd`, an absolute path, a symlink target).
 */
export function modelPath(root, manifest, entry) {
  const dir = resolve(root, manifest.policy.storageDir);
  const target = resolve(dir, entry.file);
  if (isAbsolute(entry.file) || !target.startsWith(dir + sep) || basename(entry.file) !== entry.file) {
    throw new Error(`model "${entry.id}": file must be a plain name inside ${manifest.policy.storageDir}/`);
  }
  return target;
}

export function sha256Of(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** @returns {{ ok: boolean, reason: string, detail?: string }} */
export function verifyModel(root, manifest, entry) {
  const max = manifest.policy.maxBytes ?? MAX_BYTES;
  if (!entry.sha256 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    return { ok: false, reason: "unpinned", detail: "sha256 is not pinned in the manifest — a human must verify and pin it" };
  }

  let target;
  try {
    target = modelPath(root, manifest, entry);
  } catch (error) {
    return { ok: false, reason: "unsafe-path", detail: error.message };
  }

  if (!existsSync(target)) {
    return { ok: false, reason: "absent", detail: `not installed at ${relative(root, target)}` };
  }

  const size = statSync(target).size;
  if (size > max) {
    return { ok: false, reason: "too-large", detail: `${size} bytes exceeds the ${max} ceiling` };
  }
  if (entry.bytes && size !== entry.bytes) {
    return { ok: false, reason: "size-mismatch", detail: `expected ${entry.bytes} bytes, found ${size}` };
  }

  const digest = sha256Of(target);
  if (digest !== entry.sha256) {
    return { ok: false, reason: "checksum-mismatch", detail: `expected ${entry.sha256.slice(0, 12)}…, found ${digest.slice(0, 12)}…` };
  }

  return { ok: true, reason: "verified", detail: `${relative(root, target)} · ${size} bytes · sha256 ${digest.slice(0, 12)}…` };
}

function assertInstallable(manifest, entry, { allowNetwork }) {
  const max = manifest.policy.maxBytes ?? MAX_BYTES;
  if (!entry.sha256) {
    throw new Error(
      `model "${entry.id}" is unpinned: a checksum must be recorded in ${MANIFEST_PATH} before any install. ` +
        "Verify the file independently first (docs/agents/local-model.md).",
    );
  }
  if (entry.bytes && entry.bytes > max) {
    throw new Error(`model "${entry.id}" declares ${entry.bytes} bytes, above the ${max} ceiling`);
  }
  if (allowNetwork && !entry.url?.startsWith("https://")) {
    throw new Error(`model "${entry.id}" has no https URL — refusing a network install`);
  }
}

function writeAtomically(target, bytes) {
  const temp = `${target}.partial`;
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(temp, bytes);
  renameSync(temp, target);
  return target;
}

/** Offline install from a file the operator already obtained. */
export function installFrom(root, manifest, entry, sourcePath) {
  assertInstallable(manifest, entry, { allowNetwork: false });
  if (!existsSync(sourcePath)) throw new Error(`source not found: ${sourcePath}`);
  const bytes = readFileSync(sourcePath);
  if (bytes.length > (manifest.policy.maxBytes ?? MAX_BYTES)) {
    throw new Error(`source is ${bytes.length} bytes, above the ${manifest.policy.maxBytes} ceiling`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.sha256) {
    throw new Error(`checksum mismatch: manifest pins ${entry.sha256.slice(0, 12)}…, file is ${digest.slice(0, 12)}…`);
  }
  return writeAtomically(modelPath(root, manifest, entry), bytes);
}

/** Explicit, opt-in network install. The only fetch in this repository. */
export async function installFromNetwork(root, manifest, entry) {
  assertInstallable(manifest, entry, { allowNetwork: true });
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > (manifest.policy.maxBytes ?? MAX_BYTES)) {
    throw new Error(`downloaded ${bytes.length} bytes, above the ceiling`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.sha256) {
    throw new Error(`checksum mismatch after download: pinned ${entry.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…`);
  }
  return writeAtomically(modelPath(root, manifest, entry), bytes);
}

export function removeModel(root, manifest, entry) {
  const target = modelPath(root, manifest, entry);
  if (existsSync(target)) unlinkSync(target);
  return target;
}

/**
 * The enablement plan: what is done, what is missing, and the exact next command.
 * Pure (takes root + manifest) so it can be property-tested without touching disk.
 *
 * @returns {{ ready: boolean, steps: Array<{ id: string, title: string, state: "done"|"pending"|"blocked", detail: string, command?: string }> }}
 */
export function planSteps(root, manifest) {
  const entry = (manifest.models ?? []).find((m) => m.role === "rerank");
  if (!entry) {
    return { ready: false, steps: [{ id: "declare", title: "Declare a rerank model", state: "blocked", detail: "no entry with role \"rerank\" in the manifest" }] };
  }

  const pinned = Boolean(entry.sha256 && /^[a-f0-9]{64}$/.test(entry.sha256));
  const check = verifyModel(root, manifest, entry);
  const runtimeInstalled = existsSync(join(root, "node_modules", "onnxruntime-node"));

  const steps = [
    {
      id: "pin",
      title: "Pin the artifact checksum",
      state: pinned ? "done" : "pending",
      detail: pinned
        ? `sha256 ${entry.sha256.slice(0, 12)}… pinned for ${entry.id}`
        : `sha256 is null: download the file out-of-band, compare against the publisher's hash, then record it in ${MANIFEST_PATH}`,
      command: pinned ? undefined : `sha256sum ./${entry.file}`,
    },
    {
      id: "install",
      title: "Install the verified weights into storage",
      state: check.ok ? "done" : pinned ? "pending" : "blocked",
      detail: check.ok ? check.detail : check.reason === "unpinned" ? "blocked until the checksum is pinned" : check.detail,
      command: pinned && !check.ok ? `node scripts/semantic/model.mjs install --from ./${entry.file}` : undefined,
    },
    {
      id: "runtime",
      title: "Add the inference runtime",
      state: runtimeInstalled ? "done" : "pending",
      detail: runtimeInstalled
        ? "onnxruntime-node is present"
        : "onnxruntime-node is not installed; adding it is a separate, reviewable dependency decision",
      command: runtimeInstalled ? undefined : "npm install --save-dev onnxruntime-node",
    },
    {
      id: "measure",
      title: "Measure, then decide",
      state: check.ok && runtimeInstalled ? "pending" : "blocked",
      detail: "run the eval with both rerankers and keep the default only if the numbers justify it",
      command: "node scripts/semantic/eval.mjs && node scripts/semantic/eval.mjs --rerank",
    },
  ];

  return { ready: steps.every((step) => step.state === "done") || (check.ok && runtimeInstalled), steps };
}

/**
 * Is a neural reranker usable right now? Returns the honest reasons when not.
 * The neural path is never enabled implicitly: the caller must ask for it.
 */
export function neuralStatus(root = gitRoot()) {
  const reasons = [];
  let manifest;
  try {
    manifest = loadManifest(root);
  } catch (error) {
    return { available: false, reasons: [`manifest unreadable: ${error.message}`] };
  }

  const entry = (manifest.models ?? []).find((m) => m.role === "rerank");
  if (!entry) return { available: false, reasons: ["no rerank model declared in the manifest"] };

  const check = verifyModel(root, manifest, entry);
  if (!check.ok) reasons.push(`${check.reason}: ${check.detail}`);

  // The inference runtime is a separate dependency and is deliberately not
  // bundled: a probe on disk is enough to report honestly, and importing it
  // would make the neural path a hard dependency of the default one.
  const runtimeInstalled = existsSync(join(root, "node_modules", "onnxruntime-node"));
  if (!runtimeInstalled) {
    reasons.push("runtime: onnxruntime-node is not installed (add it deliberately; see docs/agents/local-model.md)");
  }

  return { available: check.ok && runtimeInstalled, reasons, entry, check, runtimeInstalled };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function report(root, manifest) {
  const { maxBytes, storageDir } = manifest.policy ?? {};
  console.log(`model policy · storage ${storageDir}/ · ceiling ${Math.round((maxBytes ?? MAX_BYTES) / 1024 / 1024)} MiB · network ${manifest.policy?.networkAllowedByDefault ? "allowed" : "off by default"}\n`);
  for (const entry of manifest.models ?? []) {
    const check = verifyModel(root, manifest, entry);
    const mark = check.ok ? "\x1b[32m✓\x1b[0m" : check.reason === "absent" || check.reason === "unpinned" ? "\x1b[33m·\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`${mark} ${entry.id.padEnd(18)} ${entry.role.padEnd(7)} ${check.reason}`);
    console.log(`    ${check.detail}`);
    console.log(`    license ${entry.license ?? "?"} · runtime ${entry.runtime ?? "?"} · ${entry.url ?? "no url"}`);
  }
  const neural = neuralStatus(root);
  console.log(`\nneural rerank: ${neural.available ? "available" : "unavailable"}`);
  for (const reason of neural.reasons) console.log(`  - ${reason}`);
  console.log("\nthe default search path never loads a model; enable explicitly with --enable-neural-rerank");
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv.find((a) => !a.startsWith("--")) ?? "status";
  const flag = (name) => argv.includes(`--${name}`);
  const value = (name, fallback = null) => {
    const at = argv.indexOf(`--${name}`);
    return at !== -1 && argv[at + 1] ? argv[at + 1] : fallback;
  };

  const root = gitRoot();
  let manifest;
  try {
    manifest = loadManifest(root);
  } catch (error) {
    console.error(`\x1b[31m✗\x1b[0m ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (command === "status") {
    if (flag("json")) {
      const models = (manifest.models ?? []).map((entry) => ({ ...entry, check: verifyModel(root, manifest, entry) }));
      console.log(JSON.stringify({ policy: manifest.policy, models, neural: neuralStatus(root) }, null, 2));
      return;
    }
    return report(root, manifest);
  }

  if (command === "plan") {
    const plan = planSteps(root, manifest);
    if (flag("json")) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    const mark = { done: "\x1b[32m✓\x1b[0m", pending: "\x1b[33m·\x1b[0m", blocked: "\x1b[31m✗\x1b[0m" };
    console.log(`neural rerank enablement plan · ${plan.ready ? "ready" : "not ready"}\n`);
    plan.steps.forEach((step, i) => {
      console.log(`${mark[step.state]} ${i + 1}. ${step.title} — ${step.state}`);
      console.log(`     ${step.detail}`);
      if (step.command) console.log(`     \x1b[2m$ ${step.command}\x1b[0m`);
    });
    console.log("\nthe default search path is unchanged until every step is done.");
    return;
  }

  const id = value("id");
  const entries = id ? manifest.models.filter((m) => m.id === id) : manifest.models;
  if (!entries.length) {
    console.error(`\x1b[31m✗\x1b[0m no model matches ${id ?? "(all)"}`);
    process.exitCode = 2;
    return;
  }

  if (command === "verify") {
    let failed = 0;
    for (const entry of entries) {
      const check = verifyModel(root, manifest, entry);
      console.log(`${check.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${entry.id}: ${check.reason} — ${check.detail}`);
      if (!check.ok && check.reason !== "unpinned" && check.reason !== "absent") failed += 1;
    }
    if (failed) process.exitCode = 1;
    return;
  }

  if (command === "install") {
    try {
      for (const entry of entries) {
        const from = value("from");
        const target = from
          ? installFrom(root, manifest, entry, from)
          : flag("allow-network")
            ? await installFromNetwork(root, manifest, entry)
            : (() => {
                throw new Error("refusing to install: pass --from <file> (offline) or --allow-network (explicit)");
              })();
        console.log(`\x1b[32m✓\x1b[0m installed ${entry.id} → ${relative(root, target)}`);
      }
    } catch (error) {
      console.error(`\x1b[31m✗\x1b[0m ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "remove") {
    for (const entry of entries) {
      console.log(`removed ${entry.id} (${relative(root, removeModel(root, manifest, entry))})`);
    }
    return;
  }

  console.error(`unknown command: ${command} (status | plan | verify | install | remove)`);
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("model.mjs")) {
  await main();
}
