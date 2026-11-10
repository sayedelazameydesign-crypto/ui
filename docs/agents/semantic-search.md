# Semantic Search — Vector Index for Code and Docs

Keyword search (`grep`) finds strings. It cannot answer *"where is the rule that stops an agent
from pushing to main?"* when the file never uses the word "stop". This repository ships a small,
dependency-free semantic index so humans **and** agents can query by meaning.

## 1. Quick start

```bash
node scripts/semantic/cli.mjs index                 # build .index/semantic.json
node scripts/semantic/cli.mjs search "agent may not merge" -k 5
node scripts/semantic/cli.mjs search "..." --mode keyword|vector|hybrid   # default: hybrid
node scripts/semantic/cli.mjs stats                 # what is indexed
node scripts/semantic/cli.mjs doctor                # environment self-check
node scripts/semantic/eval.mjs                      # quality gate: recall@k + MRR
```

**Hybrid is the default**: vector cosine fused with BM25 by reciprocal rank fusion, plus a local
Arabic→English glossary for query expansion. Measured results, the gold set, the gate, and the known
failure are in [retrieval-quality.md](retrieval-quality.md) — this file describes the machinery, that
one describes whether it works.

Output is `score · file:line § heading` plus a preview, with `--json` for machine consumption:

```bash
node scripts/semantic/cli.mjs search "provenance trailer" --json | jq '.results[0]'
```

The index is **generated, never committed** (`.index/` is gitignored) — it is derived state, and a
stale index in Git is worse than none.

## 2. How it works

| Stage | Implementation |
| --- | --- |
| Sources | `git ls-files`, text extensions only, files < 400 KB, `node_modules`/`.index` excluded |
| Chunking | Markdown split on headings, and long sections into 16-line windows with 4-line overlap (heading kept as context); code split into 45-line windows with 10-line overlap |
| Tokenising | Unicode-aware (`\p{L}`), so Arabic works; Arabic diacritics, alef variants, `ال` prefix and common suffixes are normalised |
| Embedding | Signed hashing trick (FNV-1a) over unigrams + bigrams, sublinear term frequency, L2-normalised → 256 dense dims |
| Keyword index | Per-chunk term frequencies + document frequencies; BM25 (k1=1.2, b=0.75) |
| Fusion | Reciprocal rank fusion (k=60) over the vector and BM25 rankings |
| Query expansion | `BILINGUAL_GLOSSARY` maps ~45 Arabic terms to English equivalents — queries only |
| Ignored regions | Lines between `@semantic-ignore-begin` / `@semantic-ignore-finish` are not indexed |

**Why hashing instead of a neural model:** it runs offline, in CI, with no API key, no model
download, no network egress, and it is **deterministic** — an index built on a laptop matches one
built in CI for the same commit. Recall is approximate; precision on the repository's own
vocabulary is good (see §5).

## 3. Providers

`EMBED_PROVIDER` selects the embedder. The default is local and is the only one used by CI.

| Provider | Network | Key | When |
| --- | --- | --- | --- |
| `local` (default) | none | none | always; commits, CI, air-gapped work |
| `openai` | `api.openai.com` | `OPENAI_API_KEY` | opt-in, local exploration only |

The remote provider **refuses to run without a key** and is never wired into a workflow. If you
enable it, the query text (not the whole repository) is sent to the provider — treat that as a data
decision, and never index confidential content with it.

## 4. Building blocks (for agents)

`scripts/semantic/lib.mjs` exports `buildIndex`, `loadIndex`, `search`, `saveIndex`,
`indexSummary`, `chunkFile`, `embedLocal`, `cosine`. An agent can therefore retrieve context in
process instead of shelling out:

```js
import { loadIndex, search } from "./scripts/semantic/lib.mjs";
const index = loadIndex();
const hits = await search(index, "who may merge a pull request", { k: 3 });
```

Both `search` and the CLI accept `{ mode }`. Quality changes are accepted only with an eval run
before and after — see [retrieval-quality.md](retrieval-quality.md).

**Contract:** results are *candidates*, not truth. Open the file and read it before acting — the
index points, it does not decide. Retrieval must never replace `AGENTS.md` / `CONTEXT.md`.

## 5. Verification and limits

Smoke-tested queries (local provider, hybrid mode; full numbers in [retrieval-quality.md](retrieval-quality.md)):

| Query | Top hit |
| --- | --- |
| "which agent capabilities are denied by default" | `docs/agents/permissions.md` § Agent Permission Matrix |
| "ما هي صلاحيات الوكيل الممنوعة" | `AGENTS.md` § 7 Capability boundaries |
| "provenance trailer" | `docs/agents/provenance.md` |
| "ephemeral preview environment" | `docs/ci/ephemeral-environments.md` |

Known limits, stated plainly:

- Hashing embeddings ignore word order beyond bigrams and have no world knowledge.
- Arabic and English live in the same vector space but are not aligned semantically — a
  cross-language query hits documents by shared tokens and structure, not by translation.
- Scores are relative: only compare results within one query (hybrid scores are RRF-normalised).
- Arabic recall is bounded by the hand-curated glossary; add an entry when a real query fails.
- The index reflects `HEAD` of the working tree at build time; rebuild after significant changes.

## 6. When this should be replaced

Adopt a real embedding model (local ONNX, or a hosted provider) when **any** of these hold:
repository text exceeds ~50k chunks, cross-language retrieval becomes a product requirement, or
recall complaints outnumber false-positive complaints. The CLI contract (`index`, `search`, JSON
output) is designed to survive that swap: only `providers` in `lib.mjs` needs to change.
