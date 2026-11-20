#!/usr/bin/env node
// Dependency-free local preview for the builder. Gemini remains disabled unless the
// explicit runtime environment variables are configured; tests never call this server.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const planHandler = require("../api/plan.js");
const ROOT = resolve(".");
const PORT = Number(process.env.PORT || 4173);
const HOST = "0.0.0.0";
const MAX_BODY_BYTES = 10 * 1024;
const STATIC_FILES = new Map([
  ["/", "showcase/index.html"],
  ["/builder", "builder/index.html"],
  ["/builder/", "builder/index.html"],
  ["/builder/index.html", "builder/index.html"],
  ["/builder/app.js", "builder/app.js"],
  ["/builder/styles.css", "builder/styles.css"],
  ["/tokens.json", "tokens.json"],
  ["/playground/", "playground/index.html"],
  ["/playground/index.json", "playground/index.json"],
  ["/playground/engine.mjs", "playground/engine.mjs"],
  ["/playground/graph.html", "playground/graph.html"],
  ["/scripts/semantic/core.mjs", "scripts/semantic/core.mjs"],
  ["/docs/architecture/graph.json", "docs/architecture/graph.json"],
]);
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function respond(res, status, value) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return { tooLarge: true };
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return { body: JSON.parse(raw) }; }
  catch { return { invalid: true }; }
}

async function handleApi(req, res) {
  if (req.method !== "POST") return respond(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const parsed = await readJsonBody(req);
  if (parsed.tooLarge) return respond(res, 413, { error: "INVALID_REQUEST" });
  if (parsed.invalid) return respond(res, 400, { error: "INVALID_REQUEST" });

  const request = { method: req.method, headers: req.headers, body: parsed.body };
  const response = {
    status(status) { res.statusCode = status; return this; },
    setHeader(name, value) { res.setHeader(name, value); },
    json(value) {
      if (res.writableEnded) return this;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(value));
      return this;
    },
  };

  try { await planHandler(request, response); }
  catch { respond(res, 500, { error: "INTERNAL_ERROR" }); }
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://preview.invalid").pathname;
  if (pathname === "/api/plan") return handleApi(req, res);

  const file = STATIC_FILES.get(pathname);
  if (!file) return respond(res, 404, { error: "NOT_FOUND" });
  try {
    const content = await readFile(resolve(ROOT, file));
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": CONTENT_TYPES.get(file.slice(file.lastIndexOf("."))) || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(content);
  } catch {
    respond(res, 404, { error: "NOT_FOUND" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AI website builder preview listening on http://${HOST}:${PORT}/builder`);
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_PLANNER_ENABLED === "true") {
    console.log("Gemini planning is enabled for this local server; prompts require user consent.");
  } else {
    console.log("Gemini planning is disabled until GEMINI_API_KEY and GEMINI_PLANNER_ENABLED=true are configured.");
  }
});
