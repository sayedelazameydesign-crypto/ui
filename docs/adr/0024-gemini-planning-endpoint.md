# 0024 — Gemini planning endpoint (Vercel Function)

- **Status:** accepted
- **Date:** 2026-11-12
- **Deciders:** repository owner
- **Supersedes:** —

## Context

The first user-facing slice of the AI website builder needs to turn a natural-language brief into a reviewable project plan. The app currently has no general application framework, and no generated project code may be executed until a separate sandbox decision is made.

The owner selected Gemini and approved a server-side Vercel Function for this planning flow. The available `GEMINI_API_KEY` GitHub Actions secret is scoped to Actions; it is not automatically available to a deployed function. The browser must never receive the provider key.

## Decision

- Use a small, dependency-free Node.js Vercel Function at `POST /api/plan` for the first planning slice.
- Call Gemini only after the user checks an explicit consent box and submits a brief. Send the brief and requested language only; do not persist the request in this app.
- Keep the API key on the server as `GEMINI_API_KEY`; require `GEMINI_PLANNER_ENABLED=true` as a second, fail-closed runtime switch. An optional `GEMINI_MODEL` selects the model; the default is `gemini-2.5-flash`.
- Return a bounded, validated JSON plan only. Do not generate source code, execute commands, install dependencies, or publish projects in this slice.
- Use the same-origin endpoint, enforce JSON/body/field limits, do not log request bodies or provider credentials, and map provider failures to generic client-safe errors.
- Declare `generativelanguage.googleapis.com` in the egress allowlist, scoped only to `api/plan.js`.
- Keep CI offline: tests mock `fetch`; no GitHub Actions workflow receives `GEMINI_API_KEY` or calls Gemini.

## Consequences

**Positive**
- The API credential stays out of browser JavaScript and generated plans are validated before display.
- Consent, data flow, payload limits, and provider egress are explicit and testable.
- No new package or framework is needed for this first vertical slice.

**Negative / limitations**
- The user must add `GEMINI_API_KEY` and `GEMINI_PLANNER_ENABLED=true` separately to the Vercel runtime environment; the Actions secret does not populate it.
- The route does not yet provide durable rate limiting, authentication, or abuse protection. Do not enable it on an unrestricted production deployment until those controls and a budget/usage policy are approved.
- Google processes the brief under its own applicable terms. The UI warns users not to submit personal or confidential data; this app does not claim control over provider retention.
- Code generation, preview execution, project persistence, and publishing remain unimplemented and require separate decisions, especially a per-project sandbox.

## Alternatives considered

| Alternative | Why not selected |
| --- | --- |
| Call Gemini directly from the browser | Would expose the API key to every visitor. |
| Use a GitHub Actions workflow as the runtime | Actions secrets do not power an interactive website request; CI must remain deterministic and make no model calls. |
| Add a full framework/backend now | Larger, harder-to-review choice while D1 remains open; unnecessary for a plan-only endpoint. |
| Generate and execute application code immediately | No approved sandbox, isolation policy, or deployment/abuse controls exist yet. |
