# 0002 — Defer the application stack until the design system is specified

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Supersedes:** —

## Context

The repository needs a user interface, and the default reflex is to scaffold a framework
immediately. Three facts argue against that reflex:

1. **The product is bilingual (Arabic RTL + English LTR).** Direction, typography, and logical
   CSS properties drive layout decisions far more than the framework does. Choosing a framework
   first tends to bake in LTR assumptions that are expensive to unwind.
2. **The visual language is not yet defined.** Components written before tokens (colour, space,
   type scale) exist get rewritten once tokens land.
3. **Agents are involved.** A scaffold is a large, opinionated diff that hides many implicit
   decisions; it is the worst possible first change to review.

## Decision

Do **not** adopt an application stack, styling solution, or hosting target yet. Instead:

- Finish L0 governance (see [ADR-0001](0001-agentic-first-baseline.md)).
- Specify the design system first: tokens, typography, spacing, RTL strategy, accessibility floor.
- Record the stack choice in a **new ADR** that supersedes this one, with the alternatives and
  the migration cost stated explicitly.

The `AGENTS.md` §9 table tracks the open decisions (D1 stack, D2 styling, D3 hosting, D4 agent
autonomy). Agents must not pre-empt them by scaffolding.

## Consequences

**Positive**
- No throwaway scaffold, no framework lock-in before requirements are known.
- Reviewable, incremental history: every large decision arrives as its own ADR + PR.
- RTL and accessibility are designed in, not retrofitted.

**Negative**
- The repository looks "empty" for a while; there is nothing to run locally yet.
- Some stakeholders expect visible progress earlier than governance allows.

**Neutral**
- The guard and CI are written to pass without a build system, so adopting one later is additive
  (add steps, do not rewrite them).

## Alternatives considered

| Alternative | Why rejected now |
| --- | --- |
| Next.js + Tailwind immediately | Reasonable end state; premature before tokens and RTL strategy exist. |
| Astro (content-first) | Also plausible; the deciding input is content volume, which is unknown. |
| Vite + React (SPA) | Fine for an app, weak for a content/portfolio surface. |
| No framework (plain HTML/CSS) | Underestimates maintenance; revisit only if scope stays tiny. |

## References

- [CONTEXT.md](../../CONTEXT.md) §2 layers, §6 constraints
- [AGENTS.md](../../AGENTS.md) §9 open decisions
