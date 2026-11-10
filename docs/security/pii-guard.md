# PII & Secret Guard

The cheapest place to protect data is the moment it tries to enter the repository. This guard runs
**before the commit exists** and again in CI, so a `--no-verify` commit still fails the build.

```bash
node scripts/check-pii.mjs             # scan every tracked file
node scripts/check-pii.mjs --staged    # scan the staged diff (what the hook runs)
node scripts/check-pii.mjs --explain   # the rules and why each exists
node scripts/check-pii.mjs --json      # machine-readable report
bash scripts/install-hooks.sh          # install the pre-commit hook
```

## 1. What it looks for

| Rule | Severity | Why it exists |
| --- | --- | --- |
| `private-key` | critical | a committed key allows remote authentication |
| `cloud-token` | critical | AWS/GitHub/GitLab/Slack credentials are directly exploitable |
| `openai-key` | critical | billable, leakable |
| `jwt` | high | a bearer token in the repo is a live session |
| `card-number` | critical | PCI-DSS scope; Luhn-validated to avoid false positives |
| `national-id-eg` | critical | a 14-digit Egyptian national ID identifies one person |
| `phone-eg` | high | Egyptian mobile numbers are personal data (law 151/2020) |
| `iban` | high | financial PII |
| `email` | medium | the most common PII leak; file-like domains (`file@v2.bin`) are excluded |
| `secret-assignment` | high | `api_key = "…"` in source; placeholders and `process.env` are excluded |

Two deliberate behaviours:

- **Findings are masked.** A scanner that echoes what it found has published it to the terminal and
  the CI log. `maskValue()` keeps three leading and two trailing characters at most.
- **One line may trip several rules.** The report names the most severe and lists the others
  (`national-id-eg +phone-eg`), instead of hiding the second match behind the first.

## 2. Exemptions are reviewed, never silent

`.pii-allowlist.json`:

```json
{
  "version": 1,
  "allow": [
    { "file": "docs/security/pii-guard.md", "rule": "email", "reason": "documents the rule set with synthetic samples" }
  ]
}
```

- `reason` is **required and at least 10 characters** — the scanner refuses an exemption without one,
  because an unexplained exemption is a hole with a file name.
- `prefix` is supported for directory-scoped exemptions.
- The allowlist is schema-validated (fail-closed) alongside the other structural files.
- There is no `--skip` flag. `--no-verify` exists in git, but CI re-scans every tracked file.

## 3. Where it is enforced

| Boundary | Command | Blocks |
| --- | --- | --- |
| Local commit | `scripts/git-hooks/pre-commit` → `check-pii.mjs --staged` | the commit |
| PR CI | `security.yml` step | the check run |
| Repository guard | `check-repo.sh` §10 | `bash scripts/check-repo.sh` |

## 4. Limits (what this is not)

| Gap | Meaning |
| --- | --- |
| Pattern-based, not semantic | a person's name, address, or a free-text medical detail is not detected |
| No classification or retention policy | the guard says "this looks like PII"; it does not decide what may be stored or for how long |
| No history rewrite | a secret committed before the hook existed is still in history — rotate it, then use `git filter-repo` if needed |
| Arabic text is not specifically modelled | Arabic-script identifiers are not distinct patterns; names in Arabic pass through |
| Images/binaries are skipped | PII in a screenshot is invisible to this scanner |
| Allowlist can be abused | a careless `reason` widens the hole; review treats it as a security change |

A true DLP system needs data classification, an inventory, and a policy engine. This guard is the
**first boundary**, sized to a repository that holds code and documentation — not customer records.
