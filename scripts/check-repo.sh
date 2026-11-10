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
section "1/6 · Required governance files"
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
section "2/6 · Secret scan (tracked files)"
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

# ---------------------------------------------------------------------------
section "3/6 · JSON validity"
if command -v jq >/dev/null 2>&1; then
  while IFS= read -r json; do
    if jq empty "$json" 2>/dev/null; then ok "$json parses"; else fail "$json is not valid JSON"; fi
  done < <(git ls-files '*.json' | grep -v 'package-lock.json' || true)
else
  warn "jq not installed — JSON validation skipped"
fi

# ---------------------------------------------------------------------------
section "4/6 · Relative links resolve"
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
section "5/6 · Agent skills are well-formed"
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
section "6/6 · Documentation conventions"
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
echo
if [[ $FAILS -gt 0 ]]; then
  printf '\033[31m%s check(s) failed\033[0m, %s warning(s). Fix before reporting done.\n' "$FAILS" "$WARNS"
  exit 1
fi
printf '\033[32mAll checks passed\033[0m' 
[[ $WARNS -gt 0 ]] && printf ' with %s warning(s)' "$WARNS"
printf '.\n'
