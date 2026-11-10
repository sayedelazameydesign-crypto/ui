#!/usr/bin/env node
// Fail-closed schema validation for the repository's machine-readable files.
//
//   node scripts/validate-json.mjs          # human report
//   node scripts/validate-json.mjs --json   # machine report
//
// Every structural file this repository depends on is validated against an
// explicit schema. Unknown keys are errors, not warnings: a silent typo in
// .mcp.json is a security-relevant surprise, not a cosmetic one.
// Docs: docs/security/data-sovereignty.md

import { readFileSync, existsSync } from "node:fs";
import { validate } from "./lib/schema.mjs";

const JSON_OUT = process.argv.includes("--json");

const stringArray = { type: "array", items: { type: "string", minLength: 1 } };

/** Schemas are intentionally co-located with the check they protect. */
const TARGETS = [
  {
    file: ".mcp.json",
    schema: {
      type: "object",
      required: ["mcpServers"],
      properties: {
        $schema: { type: "string" },
        mcpServers: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["type"],
            properties: {
              type: { type: "string", enum: ["stdio", "http", "sse"] },
              command: { type: "string" },
              args: stringArray,
              url: { type: "string", pattern: "^https://" },
              headers: { type: "object" },
              env: { type: "object" },
              cwd: { type: "string" },
              description: { type: "string", minLength: 10 },
            },
          },
        },
        _policy: { type: "object" },
      },
    },
  },
  {
    file: "artifacts.manifest.json",
    schema: {
      type: "object",
      required: ["version", "roots", "totals", "entries"],
      properties: {
        version: { type: "integer", minimum: 1 },
        description: { type: "string" },
        roots: stringArray,
        lfs: { type: "boolean" },
        totals: {
          type: "object",
          required: ["files", "bytes"],
          properties: { files: { type: "integer", minimum: 0 }, bytes: { type: "integer", minimum: 0 } },
        },
        entries: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "bytes", "sha256", "lfs"],
            properties: {
              path: { type: "string", minLength: 1 },
              bytes: { type: "integer", minimum: 0 },
              sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
              lfs: { type: "boolean" },
            },
          },
        },
      },
    },
  },
  {
    file: "docs/architecture/graph.json",
    schema: {
      type: "object",
      required: ["version", "generator", "stats", "components", "edges"],
      properties: {
        version: { type: "integer", minimum: 1 },
        generator: { type: "string" },
        note: { type: "string" },
        stats: {
          type: "object",
          required: ["files", "components", "edges"],
          properties: {
            files: { type: "integer", minimum: 0 },
            components: { type: "integer", minimum: 0 },
            edges: { type: "integer", minimum: 0 },
          },
        },
        components: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "label", "files"],
            properties: {
              id: { type: "string", minLength: 1 },
              label: { type: "string", minLength: 1 },
              files: { type: "integer", minimum: 0 },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to", "links"],
            properties: {
              from: { type: "string", minLength: 1 },
              to: { type: "string", minLength: 1 },
              links: { type: "integer", minimum: 1 },
            },
          },
        },
      },
    },
  },
  {
    file: ".pii-allowlist.json",
    schema: {
      type: "object",
      required: ["version", "allow"],
      properties: {
        version: { type: "integer", minimum: 1 },
        note: { type: "string" },
        allow: {
          type: "array",
          items: {
            type: "object",
            required: ["file", "rule", "reason"],
            properties: {
              file: { type: "string", minLength: 3 },
              prefix: { type: "string", minLength: 3 },
              rule: { type: "string", pattern: "^[a-z-]+$" },
              // A reason shorter than 10 chars is not a reason.
              reason: { type: "string", minLength: 10 },
            },
          },
        },
      },
    },
  },
  {
    file: "tests/semantic-gold.json",
    schema: {
      type: "object",
      required: ["version", "cases"],
      properties: {
        version: { type: "integer", minimum: 1 },
        description: { type: "string" },
        note: { type: "string" },
        cases: {
          type: "array",
          minItems: 5,
          items: {
            type: "object",
            required: ["id", "query", "expect"],
            properties: {
              id: { type: "string", pattern: "^[a-z0-9-]+$" },
              query: { type: "string", minLength: 3 },
              expect: { type: "array", minItems: 1, items: { type: "string", minLength: 3 } },
              lang: { type: "string", enum: ["ar", "en"] },
            },
          },
        },
      },
    },
  },
];

const results = [];
for (const { file, schema } of TARGETS) {
  if (!existsSync(file)) {
    results.push({ file, ok: false, errors: ["file is missing"] });
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    results.push({ file, ok: false, errors: [`invalid JSON: ${error.message}`] });
    continue;
  }
  const errors = validate(parsed, schema);
  results.push({ file, ok: errors.length === 0, errors });
}

// Mocks are contract fixtures: arrays or objects are both acceptable.
for (const file of ["mocks/fixtures/github-issues.json", "mocks/fixtures/embeddings.json"]) {
  if (!existsSync(file)) continue;
  try {
    JSON.parse(readFileSync(file, "utf8"));
    results.push({ file, ok: true, errors: [] });
  } catch (error) {
    results.push({ file, ok: false, errors: [`invalid JSON: ${error.message}`] });
  }
}

const failed = results.filter((r) => !r.ok);

if (JSON_OUT) {
  console.log(JSON.stringify({ checked: results.length, failed: failed.length, results }, null, 2));
} else {
  for (const r of results) {
    console.log(`${r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${r.file}`);
    for (const error of r.errors) console.log(`    ${error}`);
  }
  console.log(
    failed.length
      ? `\n\x1b[31m${failed.length} of ${results.length} document(s) failed validation\x1b[0m`
      : `\n\x1b[32m${results.length} document(s) valid\x1b[0m (fail-closed)`,
  );
}

if (failed.length) process.exit(1);
