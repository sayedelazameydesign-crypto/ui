# Ephemeral Environments — Isolated Sandboxes per Change

Every pull request should be runnable somewhere **before** it reaches `main`, in an environment
that cannot reach production secrets and disappears when the PR closes. This document defines how
that works here, what is real today, and what is deliberately dormant until a stack exists.

## 1. Current state (honest)

| Capability | State | Why |
| --- | --- | --- |
| Isolated dev container | ✅ available | `.devcontainer/devcontainer.json`, non-root, capabilities dropped |
| PR sandbox build | ⏸ dormant | no application runtime yet (ADR-0002) |
| Per-PR preview URL | ⏸ dormant | no hosting target yet (D3 in `AGENTS.md` §9) |
| Ephemeral teardown | ✅ by construction | CI runners are disposable; nothing is deployed |

`.github/workflows/preview.yml` runs on every pull request but **short-circuits** when no app
manifest exists. It never pretends to deploy what does not exist.

## 2. Isolation model

The sandbox is untrusted by default, and so is the code inside it:

| Control | Setting |
| --- | --- |
| User | non-root (`vscode`), no passwordless sudo |
| Capabilities | `--cap-drop=ALL`, `--security-opt=no-new-privileges` |
| Secrets | none mounted; injected per-session, never baked into the image |
| Network | outbound restricted to the package registry; no inbound tunnels |
| Lifetime | the container or runner is destroyed after the job |
| Filesystem | repository only; the host home directory is not mounted |

## 3. What a preview must prove before merge

1. **It builds** from a clean checkout with the committed lockfile.
2. **It runs** — the app starts and serves its entry route (HTTP 200).
3. **It is accessible** — one keyboard pass, no console errors, respects `prefers-reduced-motion`.
4. **It is bilingual** — the RTL surface renders correctly, not just the LTR one.
5. **It leaks nothing** — no secrets in client bundles, no verbose stack traces in responses.

Until a stack is chosen, only (1) is meaningful, which is why the workflow is dormant rather than
theatre.

## 4. Activating previews (when D1/D3 land)

1. Add the build start command and output directory to `preview.yml` (one `case` per framework).
2. Choose the hosting target and store its token as an environment secret — never in the repo.
3. Emit the preview URL as a PR comment, and post a second comment on close confirming teardown.
4. Fail the job if teardown cannot be verified — a leaked environment is a security incident.

## 5. Anti-patterns

- Running untrusted PR code on a runner with repository secrets available.
- `pull_request_target` with a checkout of the PR head (`SECURITY.md` forbids it without approval).
- Deploying a preview from a fork without maintainer approval.
- Keeping a "temporary" staging environment alive indefinitely — that is just production with a
  worse name.
