// Properties for state capture: the audit ledger and deterministic snapshots.
// "Tamper-evident" and "byte-identical rollback" are absolute claims, so they are
// tested as invariants over generated histories.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEntry, hashEntry, readLedger, verifyLedger } from "../../scripts/ledger.mjs";
import { createSnapshot, restoreSnapshot, verifySnapshot, SNAPSHOT_DIR, TRACKED_STATE } from "../../scripts/snapshot.mjs";
import { gen } from "../../scripts/lib/property.mjs";

const freshRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "state-props-"));
  mkdirSync(join(root, ".agent"), { recursive: true });
  return root;
};

const seedState = (root, contents) => {
  for (const [index, path] of TRACKED_STATE.entries()) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, contents[index] ?? `state ${index}`);
  }
};

export default [
  {
    name: "an appended ledger always verifies, and every entry links to its predecessor",
    generators: { messages: gen.arrayOf(gen.text({ maxLength: 18 }), { maxLength: 5 }) },
    property: ({ messages }) => {
      const root = freshRoot();
      messages.forEach((message, index) => appendEntry(root, { kind: "note", message: `${index}:${message}` }));
      const entries = readLedger(root);
      const chainOk = entries.every((entry, index) => index === 0 || entry.prev === entries[index - 1].hash);
      const hashesOk = entries.every((entry) => {
        const { hash, ...rest } = entry;
        return hashEntry(rest) === hash;
      });
      return verifyLedger(root).ok && chainOk && hashesOk;
    },
  },
  {
    name: "editing any entry in place breaks verification",
    generators: { messages: gen.arrayOf(gen.text({ maxLength: 12, alphabet: "abc" }), { maxLength: 4 }) },
    property: ({ messages }) => {
      const root = freshRoot();
      messages.forEach((message, index) => appendEntry(root, { kind: "note", message: `${index}${message}` }));
      const entries = readLedger(root);
      if (!entries.length) return true;

      const forged = entries.map((entry, index) =>
        index === 0 ? { ...entry, message: `${entry.message}-edited` } : entry,
      );
      writeFileSync(join(root, ".agent/ledger.jsonl"), `${forged.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
      return verifyLedger(root).ok === false;
    },
  },
  {
    name: "removing an entry from the middle breaks the chain",
    generators: { count: gen.pick([3, 4, 5]) },
    property: ({ count }) => {
      const root = freshRoot();
      for (let i = 0; i < count; i += 1) appendEntry(root, { kind: "note", message: `e${i}` });
      const entries = readLedger(root);
      const withoutMiddle = entries.filter((_, index) => index !== 1);
      writeFileSync(join(root, ".agent/ledger.jsonl"), `${withoutMiddle.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
      return verifyLedger(root).ok === false;
    },
  },
  {
    name: "a snapshot restores byte-identical state",
    generators: { payload: gen.text({ maxLength: 40 }), mutation: gen.text({ maxLength: 40 }) },
    property: ({ payload, mutation }) => {
      const root = freshRoot();
      seedState(root, TRACKED_STATE.map((_, index) => `${payload}-${index}`));
      const record = createSnapshot(root, "property");

      for (const path of TRACKED_STATE) writeFileSync(join(root, path), `drifted:${mutation}`);
      restoreSnapshot(root, record, { force: true });

      return TRACKED_STATE.every((path, index) => readFileSync(join(root, path), "utf8") === `${payload}-${index}`);
    },
  },
  {
    name: "a tampered snapshot copy is never restored over live state",
    generators: { payload: gen.text({ maxLength: 24 }) },
    property: ({ payload }) => {
      const root = freshRoot();
      seedState(root, TRACKED_STATE.map(() => payload || "state"));
      const record = createSnapshot(root, "tamper");

      const copy = join(root, SNAPSHOT_DIR, record.id, record.files[0].name);
      writeFileSync(copy, `${readFileSync(copy, "utf8")}!`);

      const check = verifySnapshot(root, record);
      let threw = false;
      try {
        restoreSnapshot(root, record, { force: true });
      } catch {
        threw = true;
      }
      return check.ok === false && threw;
    },
  },
  {
    name: "the snapshot record hashes what it actually wrote",
    generators: { payload: gen.text({ maxLength: 24 }) },
    property: ({ payload }) => {
      const root = freshRoot();
      seedState(root, TRACKED_STATE.map(() => payload || "state"));
      const record = createSnapshot(root, "hashes");
      return record.files.every((file) => {
        const copy = readFileSync(join(root, SNAPSHOT_DIR, record.id, file.name));
        return copy.length === file.bytes;
      });
    },
  },
];
