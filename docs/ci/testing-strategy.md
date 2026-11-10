# Testing Strategy — Property-Based and Mocked

Example-based tests check the cases you thought of. Properties check the cases you did not.
This repository ships a zero-dependency property runner and a deterministic mock server, so both
run offline, in CI, with no service account and no model call.

## 1. Layers

| Layer | Tool | Status |
| --- | --- | --- |
| **Properties** (invariants over generated input) | `scripts/property-test.mjs` | ✅ active |
| **Unit / component** | framework chosen with the stack (D1) | ⏸ dormant |
| **Service mocks** | `scripts/mock-server.mjs` | ✅ active, used by CI smoke test |
| **Visual / a11y** | Playwright + axe when a runtime exists | ⏸ dormant |
| **End-to-end preview** | `preview.yml` in an ephemeral runner | ⏸ dormant (ADR-0002) |

## 2. Properties in this repository

```bash
node scripts/property-test.mjs                 # 19 properties × 100 runs
node scripts/property-test.mjs --runs 1000     # deeper
node scripts/property-test.mjs --seed 42       # reproduce a failure exactly
node scripts/property-test.mjs --only semantic
```

A property is a claim that must hold for **every** generated input:

```js
export default [
  {
    name: "Arabic definite article is normalised away",
    generators: { bare: gen.pick(["صلاحيات", "أسرار", "مستودع"]) },
    property: ({ bare }) => normalizeToken(`ال${bare}`) === normalizeToken(bare),
  },
];
```

The runner is deterministic (seeded `mulberry32`), shrinks failures to a minimal counterexample,
and prints the seed needed to reproduce. It has already earned its place: the first run found an
off-by-one in `chunkMarkdown` — line numbers started at 0 for documents without headings — which
example-based checks had missed.

## 3. Mock server

```bash
node scripts/mock-server.mjs --port 4010
curl -s localhost:4010/health
curl -s "localhost:4010/v1/embeddings?q=provenance"
curl -s "localhost:4010/repos/o/r/issues"
curl -s "localhost:4010/health?status=503&delay=250"   # fault injection
```

| Property | Why it matters |
| --- | --- |
| Fixtures are files, not code | the same request always returns the same bytes |
| OpenAI-shaped embeddings | the real client can be tested without a key or egress |
| `?status=` / `?delay=` | retry, backoff, and error-path tests are exercisable |
| Bound to `127.0.0.1` | nothing is exposed beyond the sandbox |

## 4. What must never happen

1. A test calling a production API or a paid model endpoint.
2. A property that is vacuously true (`|| true`, comparing a value with itself).
3. A mock that drifts from the real contract without a contract note in the test.
4. A test that depends on the current date, locale, or network latency.

## 5. Honest limits

- Property tests prove consistency with **stated invariants**, not correctness of intent. The
  invariants are the design; review them as carefully as code.
- Shrinking is greedy — it finds *a* minimal input, not necessarily the smallest in all cases.
- The mock server covers HTTP-shaped services only; queues and websockets need their own fixtures.
- Coverage is not measured yet: without a runtime there is nothing to cover, and a vanity number
  would be dishonest. Add real coverage with the stack.

## 6. Adding a property

1. Put it in `tests/properties/<topic>.mjs` and default-export an array.
2. Use `gen.*` generators; never a fixed literal where a generator is possible.
3. Assert an invariant a reviewer can argue about in one sentence.
4. Run `--runs 1000` before opening the PR; CI runs the default depth.
