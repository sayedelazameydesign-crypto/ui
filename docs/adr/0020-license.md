# 0020 — Apache-2.0, with a NOTICE that states what is actually shipped

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** repository owner (`@sayedelazameydesign-crypto`)
- **Related:** [zero-trust dependencies](0004-zero-trust-dependencies.md), [AI provenance](0003-ai-code-provenance.md), [adversarial inputs](../security/adversarial-inputs.md)

## Context

The repository had no `LICENSE` file. That is not a neutral state: without a licence the default is
copyright-reserved, so a public repository that invites agents and humans to read, run, and copy its
tooling grants nothing. `dependency-audit.mjs` has warned about the gap since the supply-chain work
landed, and decision **D5** stayed open because the choice is the owner's, not an agent's.

Two candidates were on the table. **MIT** is one short paragraph, universally understood, and the
lowest-friction option for a documentation-and-tooling repository. **Apache-2.0** adds an explicit
patent grant with a retaliation clause, a trademark clause, and an obligation to state changes.

This repository's own thesis argues for the second. [ADR-0004](0004-zero-trust-dependencies.md) treats
every dependency as untrusted input, and the artifact policy refuses anything without a declared,
pinned licence. Writing a policy that demands patent clarity of others while keeping none for
ourselves is inconsistent — and the tooling here is exactly the kind of thing a company adopts
internally (guards, a retrieval engine, a provenance checker), where a patent grant matters more than
file length.

## Decision

1. **The repository is licensed under Apache License 2.0** (`SPDX: Apache-2.0`). The canonical text is
   `LICENSE` at the repository root, unmodified, pinning the copyright holder to
   `sayedelazameydesign-crypto`, year 2026.
2. **A `NOTICE` file accompanies it**, and it is factual rather than ceremonial: it names the holder and
   states that no third-party source, dataset, or model weight is bundled — the semantic index is
   derived locally and the service fixtures are hand-written. A NOTICE that overstates third-party
   content is as wrong as one that omits required attribution.
3. **The licence cannot change silently.** `check-repo.sh` pins the SHA-256 of `LICENSE` and fails when
   the text differs; changing it requires an ADR superseding this one. This mirrors how the repository
   treats every other decision that is cheap to make and expensive to discover later.
4. **D5 is closed**, and the audit's `no-license-file` warning is expected to disappear rather than be
   suppressed: the check is removed from the warning path by the file existing, not by an allowlist.

## Consequences

**Good.** Contributions have a clear inbound licence (Apache-2.0 §5 covers contributions unless stated
otherwise), users get a patent grant, and the inconsistency between our dependency policy and our own
licensing is gone. The NOTICE also documents the honest scope of what is shipped.

**Costs.**

- Apache-2.0 §4(b) requires modified files to carry prominent change notices for redistributors; that
  is a real obligation, not a formality.
- The licence text is longer than MIT's and is now hash-pinned, so any change is a deliberate act.
- The trademark clause (§6) means the project name is not licensed with the code — intentional.
- The holder is a GitHub handle. If the project is ever transferred to an entity, copyright assignment
  and a new NOTICE are the owner's call, and this ADR would be superseded.

**Rejected.** MIT (no patent grant; the inconsistency above); no licence (default all-rights-reserved,
which contradicts a public, contribution-inviting repository); dual licensing or a CLA (adds
administration with no second licensee in sight); GPL-family (viral terms are wrong for tooling meant to
be copied into other repositories).
