# 0025 — Deterministic optimization and verification boundary

- **Status:** accepted (architecture and safety boundary only)
- **Date:** 2026-11-12
- **Deciders:** repository owner
- **Supersedes:** —

## Context

A proposed workflow uses a language model to interpret natural-language requests, a mathematical solver to optimize numerical decisions, and conventional code to validate results. This repository must not treat probabilistic model output as an authoritative price, schedule, allocation, or other operational decision. No solver library, general application stack, or domain model has been selected.

The referenced two-product factory example gives only 60 labor hours, 50 kg of raw material, and a reported result of 12,400 EGP. Without per-product coefficients, demand bounds, and a precise objective, that result cannot be independently reproduced or accepted as a test oracle.

## Decision

Adopt a **protocol boundary**, not an implementation or dependency choice:

1. LLMs may optionally propose a versioned, schema-constrained problem description and explain already-verified results. They never own numeric decisions and may not emit executable code or alter approved values.
2. A deterministic, bounded model contract is the only input to a solver. Unknown fields, unsupported expressions, missing units/coefficients, invalid ranges, and ambiguity with material consequences fail closed.
3. Every solve has pre-solve validation and an independent post-solve verification gate. Only an explicitly accepted optimal status that passes constraint, domain, and numeric-tolerance checks may be presented as a decision.
4. Infeasible, unbounded, timed-out, unknown, malformed, or unverifiable results yield no operational answer. Constraints are never relaxed silently; changes require an explicit user decision.
5. The solver path must be usable locally without network access, credentials, or a running LLM; structured input can be entered manually. Cloud interpretation is optional and follows consent and egress policy.
6. Audit and persistence requirements must be defined before real operational data is stored. SQLite is a candidate, not a selected database.
7. A specific solver, runtime, schema version, audit store, and any high-impact operational integration require follow-up ADRs informed by a documented domain case and measured tests.

The protocol is documented in [`docs/architecture/deterministic-optimization-protocol.md`](../architecture/deterministic-optimization-protocol.md).

## Consequences

**Positive**
- Separates language interpretation, optimization, independent verification, and explanation.
- Establishes fail-closed behavior before an engine or dependency is introduced.
- Keeps offline/manual operation possible and prevents a cloud LLM from becoming a hidden decision authority.
- Makes numerical guarantees honest: reproducibility is conditional on model, solver version, configuration, and documented tolerances; it is not a blanket claim of perfect arithmetic.

**Negative / limitations**
- No optimizer engine, user-facing optimization flow, or persistence layer is implemented by this ADR.
- A solver can only optimize the mathematical model it receives; it cannot validate whether business assumptions are complete or appropriate.
- Independent verification reduces model/solver risk but does not establish that a model is legally, financially, or operationally fit for use.
- Exact reproduced factory output remains blocked on missing case coefficients and constraints.

## Alternatives considered

| Alternative | Why not selected |
|---|---|
| Let an LLM return final numerical decisions | Probabilistic output is not a verifiable optimization certificate and can violate constraints. |
| Select PuLP, SciPy, or OR-Tools now | Domain, problem class, supported integer/continuous variables, packaging constraints, and licensing review are not yet specified; selecting now would be premature. |
| Execute model-generated Python/expressions | Creates an unnecessary code-execution and injection boundary; a constrained data contract and fixed solver adapter are safer. |
| Automatically relax constraints when infeasible | Changes the user's requirements without authorization and could produce harmful operational results. |
