#!/usr/bin/env node
// Deterministic mock server for external services — zero dependencies, no network egress.
//
//   node scripts/mock-server.mjs                       # http://127.0.0.1:4010
//   node scripts/mock-server.mjs --port 4011 --fixtures mocks/fixtures
//   MOCK_PORT=0 node scripts/mock-server.mjs           # ephemeral port, printed on start
//
// Routes
//   GET  /health                    liveness + fixture inventory
//   GET  /mock/<name>               serve mocks/fixtures/<name>.json
//   GET  /v1/embeddings?q=<text>    deterministic pseudo-embedding (OpenAI-shaped)
//   GET  /repos/:owner/:repo/issues GitHub-shaped issue list
//   POST /echo                      echo the JSON body back
//   ANY  ?status=503&delay=250      fault injection for retry/backoff tests
//
// Fixtures are static files, so the same request always returns the same bytes.
// Docs: docs/ci/testing-strategy.md

import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

const PORT = Number(value("port", process.env.MOCK_PORT ?? 4010));
const HOST = String(value("host", "127.0.0.1"));
const FIXTURES = String(value("fixtures", "mocks/fixtures"));
const QUIET = argv.includes("--quiet");

const fixture = (name) => {
  const path = join(FIXTURES, `${name}.json`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
};

const inventory = () => (existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((f) => f.endsWith(".json")) : []);

/** Same shape as an embeddings response, but derived from the query — stable per input. */
function pseudoEmbedding(text, dims = 16) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const vector = Array.from({ length: dims }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2246822519) >>> 0;
    return (h % 2000) / 1000 - 1;
  });
  const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0)) || 1;
  return vector.map((x) => Number((x / norm).toFixed(5)));
}

const send = (res, status, body) => {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const fault = url.searchParams.get("status");
  const delay = Number(url.searchParams.get("delay") ?? 0);

  if (delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 5000)));

  if (fault) {
    return send(res, Number(fault), {
      error: { type: "injected_fault", status: Number(fault), message: `injected ${fault} via query parameter` },
    });
  }

  if (url.pathname === "/health") {
    return send(res, 200, { status: "ok", fixtures: inventory(), deterministic: true });
  }

  if (url.pathname === "/v1/embeddings") {
    const input = url.searchParams.get("q") ?? "";
    return send(res, 200, {
      object: "list",
      model: "mock-embedding-16",
      data: [{ object: "embedding", index: 0, embedding: pseudoEmbedding(input) }],
      usage: { prompt_tokens: input.length, total_tokens: input.length },
    });
  }

  const issuesMatch = /^\/repos\/([^/]+)\/([^/]+)\/issues$/.exec(url.pathname);
  if (issuesMatch) {
    const canned = fixture("github-issues");
    if (!canned) return send(res, 500, { error: { message: "fixture github-issues.json missing" } });
    return send(res, 200, canned);
  }

  if (url.pathname.startsWith("/mock/")) {
    const name = url.pathname.slice("/mock/".length);
    const canned = fixture(name);
    if (!canned) return send(res, 404, { error: { message: `no fixture named ${name}`, available: inventory() } });
    return send(res, 200, canned);
  }

  if (url.pathname === "/echo" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return send(res, 400, { error: { message: "body is not valid JSON" } });
    }
    return send(res, 200, { received: body, method: req.method, deterministic: true });
  }

  return send(res, 404, {
    error: {
      message: "no route",
      routes: ["/health", "/mock/<name>", "/v1/embeddings?q=", "/repos/:o/:r/issues", "POST /echo", "?status=&delay="],
    },
  });
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : PORT;
  if (!QUIET) {
    console.log(`mock server listening on http://${HOST}:${actualPort}`);
    console.log(`fixtures: ${inventory().join(", ") || "(none)"}`);
    console.log(`deterministic: yes · no network egress · faults via ?status=500&delay=250`);
  } else {
    console.log(String(actualPort));
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
