import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const handler = require("../../api/plan.js");
const plan = {
  projectName: "Clinic booking",
  summary: "A simple booking website for a small clinic.",
  pages: [{ name: "Services", purpose: "Explain treatments and availability." }],
  features: ["Appointment request form"],
  assumptions: ["The clinic has one location."],
  questions: ["Which booking hours should be shown?"],
  firstMilestone: "Confirm the services and appointment request fields.",
};

function makeRequest(overrides = {}) {
  return {
    method: "POST",
    headers: {
      origin: "https://ui.example.test",
      host: "ui.example.test",
      "content-type": "application/json",
    },
    body: { brief: "Build a clinic appointment booking site with a services page and contact form.", language: "en", consent: true },
    ...overrides,
  };
}

function makeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function withEnv(values, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await run(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function mockGeminiResponse(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] };
    },
  };
}

test("rejects non-POST methods before any provider call", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("provider must not be called"); };
  try {
    const response = makeResponse();
    await handler(makeRequest({ method: "GET" }), response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.error, "METHOD_NOT_ALLOWED");
  } finally { globalThis.fetch = previousFetch; }
});

test("rejects cross-origin requests", async () => {
  const response = makeResponse();
  await handler(makeRequest({ headers: { ...makeRequest().headers, origin: "https://attacker.example" } }), response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, "ORIGIN_NOT_ALLOWED");
});

test("requires explicit consent and a valid bounded brief", async () => {
  const noConsent = makeResponse();
  await handler(makeRequest({ body: { brief: "A valid-length website brief for the test.", language: "en", consent: false } }), noConsent);
  assert.equal(noConsent.statusCode, 400);
  assert.equal(noConsent.body.error, "CONSENT_REQUIRED");

  const tooLong = makeResponse();
  await handler(makeRequest({ body: { brief: "x".repeat(4_001), language: "en", consent: true } }), tooLong);
  assert.equal(tooLong.statusCode, 400);
  assert.equal(tooLong.body.error, "INVALID_REQUEST");
});

test("fails closed when the runtime feature flag or key is missing", async () => {
  await withEnv({ GEMINI_API_KEY: undefined, GEMINI_PLANNER_ENABLED: "true" }, async () => {
    const response = makeResponse();
    await handler(makeRequest(), response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, "PLANNER_NOT_CONFIGURED");
  });

  await withEnv({ GEMINI_API_KEY: "not-a-real-test-key", GEMINI_PLANNER_ENABLED: "false" }, async () => {
    const response = makeResponse();
    await handler(makeRequest(), response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, "PLANNER_NOT_CONFIGURED");
  });
});

test("calls Gemini server-side and returns only a validated plan", async () => {
  const previousFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return mockGeminiResponse(plan);
  };

  try {
    await withEnv({ GEMINI_API_KEY: "not-a-real-test-key", GEMINI_PLANNER_ENABLED: "true", GEMINI_MODEL: undefined }, async () => {
      const response = makeResponse();
      await handler(makeRequest(), response);
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body, { plan });
      assert.match(requestUrl, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
      assert.equal(requestOptions.headers["x-goog-api-key"], "not-a-real-test-key");
      assert.match(requestOptions.body, /appointment booking site/);
      assert.equal(requestOptions.body.includes("not-a-real-test-key"), false);
      assert.equal(response.headers["Cache-Control"], "no-store");
      assert.equal(JSON.stringify(response.body).includes("not-a-real-test-key"), false);
    });
  } finally { globalThis.fetch = previousFetch; }
});

test("does not return malformed model output to the browser", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => mockGeminiResponse({ ...plan, pages: [] });
  try {
    await withEnv({ GEMINI_API_KEY: "not-a-real-test-key", GEMINI_PLANNER_ENABLED: "true" }, async () => {
      const response = makeResponse();
      await handler(makeRequest(), response);
      assert.equal(response.statusCode, 502);
      assert.equal(response.body.error, "INVALID_PROVIDER_RESPONSE");
      assert.equal(JSON.stringify(response.body).includes("Clinic booking"), false);
    });
  } finally { globalThis.fetch = previousFetch; }
});
