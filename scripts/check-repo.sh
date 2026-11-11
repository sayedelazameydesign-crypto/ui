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
section "1/15 · Required governance files"
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
  # zero-install playground + benchmark harness
  "playground/index.html"
  "playground/engine.mjs"
  "playground/index.json"
  "scripts/export-playground.mjs"
  "scripts/playground-parity.mjs"
  "scripts/playground-server.mjs"
  "scripts/bench.mjs"
  "docs/benchmarks.md"
  "docs/adr/0014-playground-and-benchmarks.md"
  # state capture + guard mutation testing
  "scripts/snapshot.mjs"
  "scripts/ledger.mjs"
  "scripts/mutation-test.mjs"
  "tests/properties/state.mjs"
  "docs/agents/state-and-rollback.md"
  "docs/adr/0015-state-snapshots-and-ledger.md"
  "docs/adr/0016-mutation-testing.md"
  "playground/graph.html"
  # context packing
  "scripts/context-pack.mjs"
  "tests/properties/context.mjs"
  "docs/agents/context-packing.md"
  "docs/adr/0017-context-packing.md"
  # adversarial input detection
  "scripts/security/adversarial.mjs"
  "scripts/adversarial-scan.mjs"
  "tests/adversarial/cases.json"
  "tests/properties/adversarial.mjs"
  "docs/security/adversarial-inputs.md"
  "docs/adr/0019-adversarial-inputs.md"
  ".adversarial-allowlist.json"
  # licence
  "LICENSE"
  "NOTICE"
  "docs/adr/0020-license.md"
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

# The licence is a decision, not a file: pin the text so it cannot drift into
# something nobody approved (ADR-0020).
if command -v node >/dev/null 2>&1; then
  expected_license_sha="074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff"
  actual_license_sha=$(node -e 'const {createHash}=require("crypto");const {readFileSync}=require("fs");process.stdout.write(createHash("sha256").update(readFileSync("LICENSE")).digest("hex"))' 2>/dev/null || true)
  if [[ "$actual_license_sha" == "$expected_license_sha" ]]; then
    ok "LICENSE is the canonical Apache-2.0 text (sha256 pinned)"
  else
    fail "LICENSE changed (sha256 ${actual_license_sha:-unknown}) — changing the licence needs an ADR superseding 0020"
  fi
  if grep -q "Copyright 2026 sayedelazameydesign-crypto" NOTICE 2>/dev/null; then
    ok "NOTICE names the copyright holder"
  else
    fail "NOTICE does not name the copyright holder — Apache-2.0 attribution is not optional (ADR-0020)"
  fi
fi

# ---------------------------------------------------------------------------
section "2/15 · Secret scan (tracked files)"
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
# Exception: playground/index.json is a generated quantized index that must ship offline.
# Allowed up to 1.5 MB until Git LFS is available; see docs/adr/0014-playground-and-benchmarks.md.
big_files=0
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  size=$(stat -c%s "$file" 2>/dev/null || echo 0)
  [[ "$size" -gt 1048576 ]] || continue
  if [[ "$file" == "playground/index.json" && "$size" -lt 1572864 ]]; then
    ok "playground index ${size}B (<1.5 MB exception)"
    continue
  fi
  if head -c 64 "$file" 2>/dev/null | grep -q "git-lfs.github.com/spec/v1"; then
    ok "LFS pointer: $file ($(head -c 200 "$file" | grep -o 'size [0-9]*' | head -1))"
  else
    fail "large tracked file without LFS: $file (${size}B) — see docs/data/artifacts.md"
    big_files=$((big_files+1))
  fi
done < <(git ls-files)
[[ $big_files -eq 0 ]] && ok "no oversized non-LFS blobs tracked"

# ---------------------------------------------------------------------------
section "3/15 · JSON validity"
if command -v jq >/dev/null 2>&1; then
  while IFS= read -r json; do
    if jq empty "$json" 2>/dev/null; then ok "$json parses"; else fail "$json is not valid JSON"; fi
  done < <(git ls-files '*.json' | grep -v 'package-lock.json' || true)
else
  warn "jq not installed — JSON validation skipped"
fi

# ---------------------------------------------------------------------------
section "4/15 · Relative links resolve"
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
section "5/15 · Agent skills are well-formed"
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
section "6/15 · Documentation conventions"
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
section "7/15 · Agent tooling smoke test"
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

  scope_state=$(node -e '
    const {readFileSync} = require("fs");
    const index = JSON.parse(readFileSync(".index/semantic.json", "utf8"));
    const memory = index.chunks.filter((c) => c.file.startsWith(".agent/memory/")).length;
    process.stdout.write(`${index.scope?.label ?? "unscoped"}:${memory}`);
  ' 2>/dev/null || true)
  case "$scope_state" in
    docs:0) ok "index scope is docs — agent memory excluded (opt in with --with-memory)" ;;
    docs+memory:*) ok "index scope is docs+memory — memory indexed on request (--with-memory)" ;;
    *) fail "index scope is unexpected (${scope_state:-unknown}) — run: node scripts/semantic/cli.mjs index" ;;
  esac

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
section "8/15 · Generated artifacts are current"
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
section "9/15 · Boundaries: schemas, egress, retrieval gate"
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
    ok "retrieval quality meets the gate (hybrid R@1 ≥ 0.60, R@3 ≥ 0.72, MRR ≥ 0.66 over 58 bilingual cases)"
  else
    fail "retrieval quality regression — run: node scripts/semantic/eval.mjs"
  fi
else
  warn "node not installed — boundary checks skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "10/15 · Privacy: PII and secrets"
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
section "11/15 · Opt-in model policy"
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
section "12/15 · Playground and benchmarks"
if command -v node >/dev/null 2>&1; then
  if node scripts/export-playground.mjs --check >/dev/null 2>&1; then
    ok "playground index matches the current corpus"
  else
    fail "playground/index.json is stale — run: node scripts/export-playground.mjs"
  fi

  if node scripts/playground-parity.mjs >/dev/null 2>&1; then
    ok "playground retrieval matches the engine on the gold set"
  else
    fail "playground drifted from the engine — run: node scripts/playground-parity.mjs"
  fi

  if node scripts/bench.mjs --repeat 2 --json >/dev/null 2>&1; then
    ok "benchmark harness runs"
  else
    fail "benchmark harness failed — run: node scripts/bench.mjs"
  fi
else
  warn "node not installed — playground checks skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "13/15 · State capture and guard mutation"
if command -v node >/dev/null 2>&1; then
  if [[ -f .agent/ledger.jsonl ]]; then
    if node scripts/ledger.mjs verify >/dev/null 2>&1; then
      ok "audit ledger chain is intact"
    else
      fail "audit ledger chain is broken — run: node scripts/ledger.mjs verify"
    fi
  else
    ok "no local audit ledger yet (created on first recorded action)"
  fi

  if node scripts/snapshot.mjs verify >/dev/null 2>&1; then
    ok "snapshots verify (or none exist)"
  else
    fail "a snapshot no longer matches its record — run: node scripts/snapshot.mjs list"
  fi

  if node scripts/mutation-test.mjs --quick >/dev/null 2>&1; then
    ok "quick mutants killed (guards can fail)"
  else
    fail "a guard mutant survived — run: node scripts/mutation-test.mjs"
  fi
else
  warn "node not installed — state checks skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "14/15 · Context packing"
if command -v node >/dev/null 2>&1; then
  if node scripts/context-pack.mjs "who may merge a pull request" --budget 400 --json >/tmp/.pack-probe.json 2>/dev/null; then
    used=$(node -e 'const p=require("/tmp/.pack-probe.json");console.log(p.stats.tokens)')
    limit=$(node -e 'const p=require("/tmp/.pack-probe.json");console.log(p.stats.budget)')
    if [[ "$used" -le "$limit" ]]; then
      ok "packing respects the budget ($used/$limit tokens)"
    else
      fail "pack exceeded its budget ($used/$limit tokens)"
    fi
  else
    fail "context packing failed — run: node scripts/context-pack.mjs \"a question\" --budget 400"
  fi
else
  warn "node not installed — packing checks skipped (CI installs it)"
fi

# ---------------------------------------------------------------------------
section "15/15 · Adversarial inputs"
if command -v node >/dev/null 2>&1; then
  if node scripts/adversarial-scan.mjs --corpus >/tmp/.adversarial-corpus.log 2>&1; then
    ok "every payload caught, no benign sample flagged"
  else
    fail "adversarial corpus regressed — run: node scripts/adversarial-scan.mjs --corpus"
  fi

  if node scripts/adversarial-scan.mjs >/tmp/.adversarial-scan.log 2>&1; then
    ok "tracked files are free of hidden codepoints and directives"
  else
    fail "tracked files contain an adversarial finding — run: node scripts/adversarial-scan.mjs"
  fi
else
  warn "node not installed — adversarial checks skipped (CI installs it)"
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
