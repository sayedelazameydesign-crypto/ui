---
date: 2026-11-10
kind: convention
confidence: high
sources: [scripts/security/adversarial.mjs, tests/adversarial/cases.json, docs/security/adversarial-inputs.md, docs/adr/0019-adversarial-inputs.md]
---

**Fact.** An agent reads the bytes; a reviewer reads the rendered page. Zero-width characters, bidi
overrides (Trojan Source, CVE-2021-42574), ANSI escapes, control bytes, homoglyphs and reader-directed
phrasing all exploit that difference, and nothing in the guard looked for any of them.

**What was done.** A pure detector (`scripts/security/adversarial.mjs`, no I/O, no dependencies) with
eight classes — four `block` (invisible, bidi, ANSI, control), four `warn` (joiner, mixed-script,
injection phrase, exfil link) — plus a CLI (`adversarial-scan.mjs`), a corpus with two halves, a
neutraliser wired into `context-pack.mjs`, a warn-only pre-commit hook, and `check-repo.sh` §15/15.

**Measured.** The corpus is **31 payloads / 20 benign**: 31/31 caught, **0/20 false positives**. The
tracked sweep is **126 files / 586 KiB → 0 block, 0 warn** (after fixing a rule, see below). 15 new
properties (70 total), 4 new mutants (**9/9 killed**). Neutralisation removes **0** codepoints from
today's corpus — the integration exists for the day that number is not zero.

**What the rules taught.** Two rules were wrong before the corpus found them. `(reveal|print|dump) … (secrets)`
flagged ordinary prose ("scans would print the secret they found") — a directive needs a *possessive*
("your system prompt"), not a verb and an object. And joiners are only suspicious inside a Latin word:
between Persian letters a ZWNJ is spelling, between emoji it is a family. Both are now covered by benign
samples, and `--corpus` fails on a false positive as loudly as on a miss.

**Why it matters.** A scanner that cries wolf gets switched off — and switching off the hook also
disables the PII guard. That is why the pre-commit hook warns and CI blocks, and why the benign half of
the corpus is weighted as heavily as the payloads. The limits (paraphrase, images, encoded blobs, intent)
are written into the policy rather than engineered around.

**How to verify.** `node scripts/adversarial-scan.mjs --corpus` (31/31 caught, 0/20 benign flagged) and
`node scripts/adversarial-scan.mjs` (tracked sweep); the neutraliser's contract is the 15 properties in
`tests/properties/adversarial.mjs`.
