# 0019 — Adversarial input: shapes a scanner can hold, and a stated limit

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [adversarial inputs](../security/adversarial-inputs.md), [context packing](0017-context-packing.md), [PII guard](0012-pii-dlp-guard.md), [fail-closed boundaries](0010-fail-closed-boundaries.md), [mutation testing](0016-mutation-testing.md)

## Context

This repository is read by agents more often than by people. An agent reads the bytes of a file; a
reviewer reads the rendered page. Every difference between those two readings is an attack surface:
zero-width characters that a human never sees, directional overrides that reorder a line without
changing it (Trojan Source), terminal escapes that rewrite the screen after `cat`, control bytes that
break parsers, homoglyphs that turn one word into another, and plain prose addressed at the reader.

Context packing made this concrete rather than theoretical. `context-pack.mjs` quotes passages from
the corpus verbatim and hands them to an agent — which means repository text is now *instructions the
agent reads*, and the packer is the last point where a hidden codepoint can be removed before use.

Two failure modes were available and both were rejected. Doing nothing leaves a class of defect with
no detector at all. Doing everything — a model that classifies intent — replaces a deterministic guard
with a probabilistic one that cannot be reproduced offline, cannot be mutated, and will be wrong in
ways that are hard to attribute. This repository's rules are that a guard must run offline
([ADR-0004](0004-zero-trust-dependencies.md)), be reproducible, and be provably able to fail
([ADR-0016](0016-mutation-testing.md)).

## Decision

1. **Eight classes, split by what a finding means.**
   Four `block` — `invisible-codepoint`, `bidi-control`, `ansi-escape`, `control-char` — because no
   legitimate repository prose or source contains them. Four `warn` — `joiner-codepoint`,
   `mixed-script-word`, `injection-phrase`, `exfil-link` — because each has legitimate uses and needs
   review rather than a verdict.
2. **The detector is pure.** `scripts/security/adversarial.mjs` has no I/O and no dependencies, so the
   CLI, the tests, the packer, and the playground import exactly the same code.
3. **Neutralisation is a contract.** `sanitizeText()` removes block classes only, preserves the line
   count so `file:line` citations survive, is idempotent, leaves printable ASCII untouched, keeps
   ZWNJ/ZWJ, and removes an ANSI sequence whole rather than leaving `[31m` behind. All five claims
   are property-tested.
4. **It runs where the reading happens.** `context-pack.mjs` sanitises every passage before the
   passage is embedded, budgeted, or rendered, and reports the count in the pack header when it is
   non-zero.
5. **The corpus has two halves.** 31 payloads that must be caught, 20 benign samples that must stay
   silent. `--corpus` fails on a miss *or* a false positive, and it runs in `check-repo.sh`
   (§15/15, corpus plus tracked sweep).
6. **The hook warns, CI blocks.** A block-class finding in the pre-commit hook would print a warning
   and allow the commit; CI fails. The asymmetry is deliberate: local friction over a legitimate
   Persian ZWNJ or a document quoting an attack teaches `--no-verify`, which also disables the PII
   guard — the one local check that prevents secrets from entering history.
7. **Exemptions are fail-closed.** `.adversarial-allowlist.json` entries need a file or prefix, a
   known class, and a reason of at least 15 characters; a malformed file is an error, never an empty
   allowlist.

## Consequences

**Good.** The block classes are gone from the guarded path with four mutants proving the tests bite.
Reviewers get a precise report (class, line, column, count, escaped excerpt) instead of a heuristic
score. The limits are written down, so no one has to guess what "we scan for injection" means.

**Costs and limits, stated rather than hidden.**

- A phrase list is defeated by paraphrase. The scanner recognises shapes, not intent.
- The negation suppression ("never reveal your API keys") is a heuristic; a negation placed earlier in
  the sentence does not suppress, and an attacker can hide behind the same wording.
- Only text files are scanned: images, alt text, and PDFs are out of scope, as are encoded blobs —
  decoding them automatically would make the runtime unbounded.
- `warn` findings still need a human, which means the value of the check depends on the allowlist
  being reviewed in the PR that adds an entry.

**Rejected alternatives.** An LLM classifier (non-deterministic, unreproducible offline, unmutatable);
blocking every joiner codepoint (breaks Persian orthography and emoji — a worse defect than the one it
fixes); stripping all suspicious characters at retrieval (silent data loss, and it would corrupt
legitimate bilingual text); scanning only "external" input (for an agent, repository text *is* external
input).
