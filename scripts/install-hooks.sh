#!/usr/bin/env bash
# Point Git at the versioned hooks in scripts/git-hooks.
# Idempotent. Per-clone, per-machine — hooks are not transferred by git itself.

set -Eeuo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

chmod +x scripts/git-hooks/* 2>/dev/null || true
git config core.hooksPath scripts/git-hooks

echo "hooks path  : $(git config --get core.hooksPath)"
echo "installed   : $(ls scripts/git-hooks | tr '\n' ' ')"
echo "uninstall   : git config --unset core.hooksPath"
