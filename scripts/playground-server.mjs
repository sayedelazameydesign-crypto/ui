#!/usr/bin/env node
// Zero-dependency static server for the playground.
//
//   node scripts/playground-server.mjs            # binds 0.0.0.0:8080, serves /playground/
//   node scripts/playground-server.mjs --port 3000
//
// It runs the *static* page, not a proxy: the point of the playground is that the
// retrieval itself happens in the browser, against an index exported from the same
// code the CLI uses (scripts/semantic/core.mjs).

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gitRoot } from "./semantic/lib.mjs";

const argv = process.argv.slice(2);
const portAt = argv.indexOf("--port");
const PORT = Number(portAt !== -1 ? argv[portAt + 1] : process.env.PORT ?? 8080);
const HOST = "0.0.0.0"; // reachable from the preview proxy, not just localhost

const root = resolve(gitRoot());
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "") pathname = "/playground/";
  if (pathname.endsWith("/")) pathname += "index.html";

  // Path traversal guard: resolve, then require the result to stay inside the repo.
  const target = resolve(join(root, normalize(pathname)));
  if (!target.startsWith(root + sep)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("forbidden");
    return;
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }

  response.writeHead(200, {
    "content-type": MIME[extname(target)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(target).pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`playground → http://${HOST}:${PORT}/playground/`);
  console.log(`serving    ${root} (static; retrieval runs in the browser)`);
});
