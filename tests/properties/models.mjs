// Properties for the opt-in model loader (ADR-0013).
// The security claims here are absolute — "never installs unpinned", "never escapes
// .models/", "never accepts a wrong digest" — so they are tested as invariants, not
// as examples.

import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFrom, modelPath, planSteps, verifyModel } from "../../scripts/semantic/model.mjs";
import { gen } from "../../scripts/lib/property.mjs";

const root = mkdtempSync(join(tmpdir(), "model-props-"));
mkdirSync(join(root, ".models"), { recursive: true });

const manifestFor = (sha256, extra = {}) => ({
  version: 1,
  policy: { storageDir: ".models", maxBytes: 1024 * 1024, requiresChecksum: true, networkAllowedByDefault: false },
  models: [{ id: "probe", role: "rerank", name: "probe model", file: "probe.onnx", bytes: 32, license: "Apache-2.0", runtime: "onnxruntime-node", sha256, ...extra }],
});

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

export default [
  {
    name: "a manifest entry can never write outside the storage directory",
    generators: { name: gen.text({ maxLength: 12, alphabet: "abcdefghij./-" }) },
    property: ({ name }) => {
      const file = `../${name}`;
      try {
        modelPath(root, { policy: { storageDir: ".models" } }, { id: "probe", file });
        return false; // traversal was accepted — that is the bug
      } catch {
        return true;
      }
    },
  },
  {
    name: "an unpinned model is unusable and uninstallable, whatever else is true",
    generators: { bytes: gen.arrayOf(gen.pick([0, 1, 2, 3]), { maxLength: 8 }) },
    property: ({ bytes }) => {
      const payload = Buffer.from(bytes);
      const manifest = manifestFor(null);
      const source = join(root, "unpinned.bin");
      writeFileSync(source, payload);
      const check = verifyModel(root, manifest, manifest.models[0]);
      let threw = false;
      try {
        installFrom(root, manifest, manifest.models[0], source);
      } catch {
        threw = true;
      }
      return check.ok === false && check.reason === "unpinned" && threw;
    },
  },
  {
    name: "a wrong digest is always rejected, a right digest always accepted",
    generators: { a: gen.text({ maxLength: 16 }), b: gen.text({ maxLength: 16 }) },
    property: ({ a, b }) => {
      const payload = Buffer.from(a || "x");
      const source = join(root, "digest.bin");
      writeFileSync(source, payload);

      const good = manifestFor(sha(payload), { bytes: payload.length });
      const badDigest = sha(Buffer.from(b + "z"));
      const bad = manifestFor(badDigest === sha(payload) ? "0".repeat(64) : badDigest, { bytes: payload.length });

      let rejected = false;
      try {
        installFrom(root, bad, bad.models[0], source);
      } catch {
        rejected = true;
      }

      const installed = installFrom(root, good, good.models[0], source);
      const verified = verifyModel(root, good, good.models[0]);
      return rejected && Boolean(installed) && verified.ok === true;
    },
  },
  {
    name: "an artifact above the declared ceiling is refused before it lands",
    generators: { size: gen.pick([1, 2, 4]) },
    property: ({ size }) => {
      const manifest = manifestFor(null);
      const entry = { ...manifest.models[0], bytes: size * 1024 * 1024 };
      const small = { ...manifest, policy: { ...manifest.policy, maxBytes: 1024 } };
      const payload = Buffer.alloc(size * 1024 * 1024, 7);
      const source = join(root, `big-${size}.bin`);
      writeFileSync(source, payload);
      const pinned = { ...small, models: [{ ...entry, sha256: sha(payload) }] };
      try {
        installFrom(root, pinned, pinned.models[0], source);
        return false; // oversized file was written
      } catch {
        return true;
      }
    },
  },
  {
    name: "the plan blocks installation until a checksum is pinned",
    generators: { name: gen.text({ maxLength: 8, alphabet: "abcdef" }) },
    property: () => {
      const manifest = manifestFor(null, { file: "unpinned-plan.onnx" });
      const plan = planSteps(root, manifest);
      const install = plan.steps.find((s) => s.id === "install");
      const pin = plan.steps.find((s) => s.id === "pin");
      return pin.state === "pending" && install.state === "blocked" && plan.ready === false;
    },
  },
  {
    name: "with weights verified, the only remaining blocker is the runtime",
    generators: { payload: gen.text({ maxLength: 12, alphabet: "abcdefgh" }) },
    property: ({ payload }) => {
      const bytes = Buffer.from(payload || "weights");
      const manifest = manifestFor(sha(bytes), { bytes: bytes.length, file: "plan-progress.onnx" });
      const source = join(root, "plan-progress.bin");
      writeFileSync(source, bytes);
      installFrom(root, manifest, manifest.models[0], source);

      const plan = planSteps(root, manifest);
      const state = (id) => plan.steps.find((s) => s.id === id).state;
      // No node_modules/onnxruntime-node in the fixture root, so the runtime step
      // must be the thing standing between us and a measured comparison.
      return state("pin") === "done" && state("install") === "done" && state("runtime") === "pending" && state("measure") === "blocked" && plan.ready === false;
    },
  },
  {
    name: "verify reports the failure that actually applies",
    generators: { reason: gen.pick(["absent", "pinned-file-passes"]) },
    property: ({ reason }) => {
      const payload = Buffer.from("weights");
      const manifest = manifestFor(sha(payload), { bytes: payload.length, file: `probe-${reason}.onnx` });
      if (reason === "absent") {
        const result = verifyModel(root, manifest, manifest.models[0]);
        return result.ok === false && result.reason === "absent";
      }
      const source = join(root, "pinned.bin");
      writeFileSync(source, payload);
      installFrom(root, manifest, manifest.models[0], source);
      return verifyModel(root, manifest, manifest.models[0]).ok === true;
    },
  }
];
