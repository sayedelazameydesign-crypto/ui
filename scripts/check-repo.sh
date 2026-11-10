#!/usr/bin/env bash
# Repository guard — deterministic, offline, dependency-free.
# Enforces the conventions defined in AGENTS.md §6 and CONTEXT.md §3.
# Exit code 0 = all checks passed. Any failure exits 1.
#
# Usage: scripts/check-repo.sh [--quiet]

set -Eeuo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

FAILS=0
WARNS=0
SELF="scripts/check-repo.sh"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { [[ $QUIET -eq 1 ]] || printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { WARNS=$((WARNS+1)); printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { FAILS=$((FAILS+1)); printf '  \033[31m✗\033[0m %s\n' "$*"; }

section() { [[ $QUIET -eq 1 ]] || bold "$1"; }

# Arabic is detected by its UTF-8 lead byte (U+0600–06FF → 0xD8–0xDB).
# Portable on any grep build; -P with \x{...} is not universally available.
has_arabic() { LC_ALL=C grep -q "$(printf '\330')" "$1" 2>/dev/null; }

# ---------------------------------------------------------------------------
section "1/11 · Required governance files"
REQUIRED=(
  "AGENTS.md"
  "CONTEXT.md"
  "README.md"
  "CLAUDE.md"
  "SECURITY.md"
  "CONTRIBUTING.md"
  ".mcp.json"
  "scripts/check-repo.sh"
  "docs/agents/permissions.md"
  "docs/agents/mcp-policy.md"
  "docs/agents/memory-protocol.md"
  "docs/adr/0001-agentic-first-baseline.md"
  ".github/pull_request_template.md"
  ".github/copilot-instructions.md"
  ".agent/README.md"
  ".agent/capabilities.yaml"
  # retrieval, provenance, sandboxes, supply chain
  "docs/agents/semantic-search.md"
  "docs/agents/provenance.md"
  "docs/ci/ephemeral-environments.md"
  "docs/adr/0003-ai-code-provenance.md"
  "docs/adr/0004-zero-trust-dependencies.md"
  ".devcontainer/devcontainer.json"
  "scripts/semantic/cli.mjs"
  "scripts/semantic/lib.mjs"
  "scripts/provenance.mjs"
  "scripts/dependency-audit.mjs"
  "scripts/dead-code-report.mjs"
  "scripts/git-hooks/commit-msg"
  "scripts/install-hooks.sh"
  ".github/workflows/guard.yml"
  ".github/workflows/security.yml"
  ".github/workflows/provenance.yml"
  ".github/workflows/preview.yml"
  ".github/workflows/semantic-index.yml"
  ".github/workflows/dependency-audit.yml"
  ".github/workflows/license-compliance.yml"
  # data, testing, routing, living documentation
  ".gitattributes"
  "artifacts.manifest.json"
  "scripts/lib/property.mjs"
  "scripts/property-test.mjs"
  "scripts/mock-server.mjs"
  "scripts/change-classifier.mjs"
  "scripts/artifact-manifest.mjs"
  "scripts/architecture-graph.mjs"
  "tests/properties/semantic.mjs"
  "tests/properties/tooling.mjs"
  "mocks/fixtures/github-issues.json"
  "docs/data/artifacts.md"
  "docs/ci/testing-strategy.md"
  "docs/ci/green-builds.md"
  "docs/architecture/living-docs.md"
  "docs/architecture/graph.md"
  "docs/architecture/graph.json"
  "docs/adr/0005-artifact-storage.md"
  "docs/adr/0006-testing-strategy.md"
  "docs/adr/0007-green-builds.md"
  "docs/adr/0008-living-documentation.md"
  ".github/workflows/property-tests.yml"
  ".github/workflows/architecture.yml"
  # retrieval quality + fail-closed boundaries
  "scripts/lib/schema.mjs"
  "scripts/validate-json.mjs"
  "scripts/check-egress.mjs"
  "scripts/semantic/eval.mjs"
  "tests/semantic-gold.json"
  "docs/agents/retrieval-quality.md"
  "docs/security/data-sovereignty.md"
  "docs/adr/0009-hybrid-retrieval.md"
  "docs/adr/0010-fail-closed-boundaries.md"
  # privacy guard
  "scripts/check-pii.mjs"
  ".pii-allowlist.json"
  "scripts/git-hooks/pre-commit"
  "docs/security/pii-guard.md"
  "docs/adr/0011-local-reranker-experiment.md"
  "docs/adr/0012-pii-dlp-guard.md"
  # opt-in model artifacts
  "scripts/semantic/model.mjs"
  "scripts/semantic/models.manifest.json"
  "docs/agents/local-model.md"
  "docs/adr/0013-opt-in-model-load.md"
)
for f in "${REQUIRED[@]}"; do
  if [[ -f "$f" ]]; then
    size=$(wc -c <"$f" | tr -d ' ')
    if [[ "$size" -lt 40 ]]; then
      fail "$f exists but is suspiciously small (${size}B) — placeholder?"
    else
      ok "$f"
    fi
  else
    fail "missing required file: $f"
  fi
done

# ---------------------------------------------------------------------------
section "2/11 · Secret scan (tracked files)"
SECRET_PATTERNS=(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'
  'ghp_[A-Za-z0-9]{36}'
  'github_pat_[A-Za-z0-9_]{22,}'
  'gho_[A-Za-z0-9]{36}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'AIza[0-9A-Za-z_-]{35}'
  'sk-(proj-)?[A-Za-z0-9]{20,}'
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
)
for pattern in "${SECRET_PATTERNS[@]}"; do
  hits=$(git grep -nIE -- "$pattern" -- . ":(exclude)$SELF" ":(exclude).github/workflows/*.yml" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    fail "possible secret matching /$pattern/:"
    printf '%s\n' "$hits" | sed 's/^/      /'
  fi
done

# Generic "key = long-quoted-value" assignment.
assign_hits=$(git grep -nIE \
  '(api[_-]?key|secret|token|password|passwd)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9/+=_-]{16,}["'"'"']' \
  -- . ":(exclude)$SELF" ":(exclude)*.example" ":(exclude).github/workflows/*.yml" 2>/dev/null || true)
if [[ -n "$assign_hits" ]]; then
  fail "possible hard-coded credential assignment:"
  printf '%s\n' "$assign_hits" | sed 's/^/      /'
fi

# Environment files must never be tracked (examples are fine).
tracked_env=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.(example|sample|template|schema)$' || true)
if [[ -n "$tracked_env" ]]; then
  fail "environment file tracked (must be gitignored):"
  printf '%s\n' "$tracked_env" | sed 's/^/      /'
fi
[[ -z "$tracked_env" ]] && ok "no tracked env files, no obvious secrets"

# Binary hygiene: a tracked file above 1 MB must be an LFS pointer, not raw bytes.
big_files=0
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  size=$(stat -c%s "$file" 2>/dev/null || echo 0)
  [[ "$size" -gt 1048576 ]] || continue
  if head -c 64 "$file" 2>/dev/null | grep -q "git-lfs.github.com/spec/v1"; then
    ok "LFS pointer: $file ($(head -c 200 "$file" | grep -o 'size [0-9]*' | head -1))"
  else
    fail "large tracked file without LFS: $file (${size}B) — see docs/data/artifacts.md"
    big_files=$((big_files+1))
  fi
done < <(git ls-files)
[[ $big_files -eq 0 ]] && ok "no oversized non-LFS blobs tracked"

# ---------------------------------------------------------------------------
section "3/11 · JSON validity"
if command -v jq >/dev/null 2>&1; then
  while IFS= read -r json; do
    if jq empty "$json" 2>/dev/null; then ok "$json parses"; else fail "$json is not valid JSON"; fi
  done < <(git ls-files '*.json' | grep -v 'package-lock.json' || true)
else
  warn "jq not installed — JSON validation skipped"
fi

# ---------------------------------------------------------------------------
section "4/11 · Relative links resolve"
broken=0
while IFS= read -r doc; do
  dir=$(dirname "$doc")
  while IFS= read -r raw; do
    [[ -z "$raw" ]] && continue
    link="${raw#](}"; link="${link%)}"
    link="${link%%#*}"
    link="${link%% *}"
    [[ -z "$link" ]] && continue
    case "$link" in
      http://*|https://*|mailto:*|tel:*|/*|\#*|\{\{*|\$\{*) continue ;;
    esac
    [[ -e "$dir/$link" || -e "$link" ]] || { fail "broken link in $doc → $link"; broken=$((broken+1)); }
  done < <(grep -oE '\]\([^)]*\)' "$doc" 2>/dev/null || true)
done < <(git ls-files '*.md')
[[ $broken -eq 0 ]] && ok "all relative links resolve"

# ---------------------------------------------------------------------------
section "5/11 · Agent skills are well-formed"
shopt -s nullglob
skills=(.claude/skills/*/SKILL.md)
shopt -u nullglob
if [[ ${#skills[@]} -eq 0 ]]; then
  fail "no skills found under .claude/skills/*/SKILL.md"
else
  for skill in "${skills[@]}"; do
    head -1 "$skill" | grep -qx -- '---' || { fail "$skill must start with a YAML front-matter block"; continue; }
    grep -qxE '^name: .+' <(sed -n '2,12p' "$skill") || { fail "$skill lacks a 'name:' field"; continue; }
    grep -qxE '^description: .+' <(sed -n '2,12p' "$skill") || { fail "$skill lacks a 'description:' field"; continue; }
    ok "$skill"
  done
fi

# ---------------------------------------------------------------------------
section "6/11 · Documentation conventions"
# Bilingual requirement: human-facing entry points must contain Arabic text.
for doc in README.md AGENTS.md CONTEXT.md; do
  if has_arabic "$doc"; then
    ok "$doc contains Arabic content"
  else
    fail "$doc must include Arabic (bilingual requirement, CONTEXT.md §3.1)"
  fi
done

# Commit hygiene on the current branch (advisory only).
if git rev-parse --verify -q origin/main >/dev/null; then
  range="origin/main..HEAD"
  if git rev-parse --verify -q HEAD >/dev/null && git rev-list --count "$range" >/dev/null 2>&1; then
    bad=$(git log --format='%s' "$range" | grep -vE '^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\([a-z0-9._/-]+\))?(!)?: .{5,}' || true)
    if [[ -n "$bad" ]]; then
      warn "commits on this branch that do not follow Conventional Commits:"
      printf '%s\n' "$bad" | sed 's/^/      /'
    else
      ok "commit messages follow Conventional Commits"
    fi
  fi
fi

# ---------------------------------------------------------------------------
section "7/11 · Agent tooling smoke test"
if command -v node >/dev/null 2>&1; then
  if node scripts/semantic/cli.mjs index --out .index/semantic.json >/dev/null 2>&1; then
    ok "semantic index builds"
  else
    fail "semantic index failed to build (node scripts/semantic/cli.mjs index)"
  fi

  hits=$(node scripts/semantic/cli.mjs search "least privilege agent" --index .index/semantic.json --json 2>/dev/null | grep -c '"file"' || true)
  if [[ "${hits:-0}" -gt 0 ]]; then
    ok "semantic search returns ${hits} hit(s)"
  else
    fail "semantic search returned no hits — tokenizer or index regressed"
  fi

  if node scripts/provenance.mjs --json >/dev/null 2>&1; then
    ok "provenance report runs"
  else
    fail "provenance report failed (node scripts/provenance.mjs)"
  fi

  if node scripts/dependency-audit.mjs >/dev/null 2>&1; then
    ok "dependency audit runs"
  else
    fail "dependency audit failed (node scripts/dependency-audit.mjs)"
  fi
else
  warn "node not installed — agent tooling smoke test skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "8/11 · Generated artifacts are current"
if command -v node >/dev/null 2>&1; then
  if node scripts/architecture-graph.mjs --check >/dev/null 2>&1; then
    ok "architecture graph matches the repository"
  else
    fail "docs/architecture/graph.* is stale — run: node scripts/architecture-graph.mjs --write"
  fi

  if node scripts/artifact-manifest.mjs --check >/dev/null 2>&1; then
    ok "artifact manifest matches disk"
  else
    fail "artifacts.manifest.json drifted — run: node scripts/artifact-manifest.mjs --write"
  fi

  if node scripts/property-test.mjs --runs 50 --quiet >/dev/null 2>&1; then
    ok "property suite passes (50 runs)"
  else
    fail "property suite failed — run: node scripts/property-test.mjs"
  fi
else
  warn "node not installed — generated-artifact checks skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "9/11 · Boundaries: schemas, egress, retrieval gate"
if command -v node >/dev/null 2>&1; then
  if node scripts/validate-json.mjs >/dev/null 2>&1; then
    ok "structural JSON files pass fail-closed schema validation"
  else
    fail "schema validation failed — run: node scripts/validate-json.mjs"
  fi

  if node scripts/check-egress.mjs >/dev/null 2>&1; then
    ok "no undeclared egress destinations"
  else
    fail "undeclared egress — run: node scripts/check-egress.mjs (policy: docs/security/data-sovereignty.md)"
  fi

  if node scripts/semantic/eval.mjs --json >/dev/null 2>&1; then
    ok "retrieval quality meets the gate (hybrid R@1 ≥ 0.65, R@3 ≥ 0.90, MRR ≥ 0.75)"
  else
    fail "retrieval quality regression — run: node scripts/semantic/eval.mjs"
  fi
else
  warn "node not installed — boundary checks skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "10/11 · Privacy: PII and secrets"
if command -v node >/dev/null 2>&1; then
  if node scripts/check-pii.mjs >/dev/null 2>&1; then
    ok "no PII or secrets in tracked files"
  else
    fail "privacy findings — run: node scripts/check-pii.mjs (policy: docs/security/pii-guard.md)"
  fi
  if [[ -x scripts/git-hooks/pre-commit ]]; then
    ok "pre-commit privacy hook is executable"
  else
    fail "scripts/git-hooks/pre-commit is missing or not executable (bash scripts/install-hooks.sh)"
  fi
else
  warn "node not installed — privacy scan skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "11/11 · Opt-in model policy"
if command -v node >/dev/null 2>&1; then
  if node scripts/semantic/model.mjs verify >/dev/null 2>&1; then
    ok "declared model artifacts verify (or are honestly absent/unpinned)"
  else
    fail "model artifact failed verification — run: node scripts/semantic/model.mjs status"
  fi

  if git ls-files --error-unmatch .models >/dev/null 2>&1; then
    fail "files under .models/ are tracked by git — weights must never be committed (ADR-0013)"
  else
    ok "no model weights tracked by git"
  fi

  ceiling=$(node -e 'const m=require("./scripts/semantic/models.manifest.json");console.log(m.policy.maxBytes)')
  if [[ "$ceiling" -le 104857600 ]]; then
    ok "model size ceiling respects the 100 MiB policy ($ceiling bytes)"
  else
    fail "model size ceiling is $ceiling bytes, above the 100 MiB policy (ADR-0013)"
  fi
else
  warn "node not installed — model policy checks skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
echo
if [[ $FAILS -gt 0 ]]; then
  printf '\033[31m%s check(s) failed\033[0m, %s warning(s). Fix before reporting done.\n' "$FAILS" "$WARNS"
  exit 1
fi
printf '\033[32mAll checks passed\033[0m' 
[[ $WARNS -gt 0 ]] && printf ' with %s warning(s)' "$WARNS"
printf '.\n'
