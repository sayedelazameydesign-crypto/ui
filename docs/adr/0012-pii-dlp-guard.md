# 0012 — PII and secret detection at the commit boundary

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [ADR-0010](0010-fail-closed-boundaries.md), [PII guard](../security/pii-guard.md), decision **D9**

## Context

ADR-0010 made outbound destinations explicit and made structural config fail closed. Both controls
protect what *leaves* the repository. Neither looks at what *enters* it.

The realistic failure is not an attack; it is a paste. A phone number from a client, a test database
dump with real addresses, a screenshot of a national ID, an `AKIA…` key copied into a "quick test":
each one becomes permanent history that a `git clone` distributes and that `git rm` does not undo.

`trivy --scanners secret` already runs in CI. It knows credential shapes and nothing about personal
data, and it runs **after** the commit exists — the most expensive moment to fix a leak.

## Decision

1. **Scan at the earliest boundary.** `scripts/check-pii.mjs` runs as a `pre-commit` hook against the
   **staged blob** (not the working tree — those differ), and again in CI over every tracked file, so
   `--no-verify` does not bypass the policy.
2. **Detect personal data, not just credentials.** Email addresses, Egyptian mobile numbers, 14-digit
   national IDs, IBANs, Luhn-validated card numbers — in addition to keys, JWTs and
   `password = "…"` assignments.
3. **Never echo a finding.** Matches are masked (`sara*******om`) before printing, because a scanner
   that logs the secret has published it to the terminal and the CI transcript.
4. **Exemptions are reviewable, never silent.** `.pii-allowlist.json` requires `file`, `rule`, and a
   `reason` of at least 10 characters; the schema is fail-closed and the scanner refuses a malformed
   allowlist rather than proceeding unscanned. There is no `--skip` flag.
5. **Report severity honestly.** A line that trips several rules names the most severe and lists the
   rest; the summary counts by severity.

## Consequences

**Positive**
- The most common leak (an address or phone number pasted into a doc) is caught before it exists.
- Findings are actionable: file, line, rule, severity, why, and a masked excerpt.
- The allowlist turns "we know about this one" into a reviewed, documented decision.
- The repository guard (§10) exercises the same code path a contributor runs, so the gate cannot rot
  unnoticed.
- Five new properties cover detection, masking and exemption scope (32 total).

**Negative**
- Pattern matching cannot see a person's name, an address in prose, or PII inside an image.
- It will occasionally flag legitimate text; each such case costs an allowlist entry and a review.
- Commit latency grows by ~0.2 s.
- No classification/retention policy: the guard says "this looks personal", not "you may keep it".

**Neutral**
- The scanner is dependency-free and offline; it adds no supply-chain surface — which is the point.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| Trivy/Gitleaks only | Excellent for credentials, blind to personal data, and too late in the flow. |
| Microsoft Presidio / NLP-based DLP | Real classification, but heavyweight (spaCy models, hundreds of MB) and needs egress to install. |
| Git history rewriting as policy | Treats the symptom after the leak; the hook prevents the leak. |
| Server-side pre-receive hook | Strongest control, but requires repository admin; the local hook plus CI covers the same cases for a solo practice. |
| Blocking on every medium finding | Impossible to work with; severity plus allowlist keeps signal.

## References

- [`docs/security/pii-guard.md`](../security/pii-guard.md) · `.pii-allowlist.json`
- `scripts/check-pii.mjs` · `scripts/git-hooks/pre-commit` · `scripts/install-hooks.sh`
- `.github/workflows/security.yml` · `scripts/check-repo.sh` §10
