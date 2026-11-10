---
date: 2026-11-10
kind: decision
confidence: high
sources: [CONTEXT.md, docs/adr/0001-agentic-first-baseline.md, docs/adr/0002-defer-stack-choice.md]
---

**Fact.** This repository is at maturity level L0 (governance only): no application framework,
no `package.json`, no build system.

**Why it matters.** An agent must not scaffold a framework, add dependencies, or assume a test
runner exists. CI is designed to pass without a build step.

**How to verify.** `ls package.json` (absent) and read `CONTEXT.md` §2.
