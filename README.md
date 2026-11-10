<div align="center">

# ui

**مستودع واجهات المستخدم — أساس توكيلي (Agentic-First) جاهز لعام 2026**
*The user-interface repository — an agentic-first, machine-readable baseline*

[![guard](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/guard.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/guard.yml)
[![security](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/security.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/security.yml)
[![provenance](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/provenance.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/provenance.yml)
[![dependency-audit](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/dependency-audit.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/dependency-audit.yml)

`main` · `L0 baseline` · `AGENTS.md` · `semantic index` · `provenance` · `properties` · `living docs` · `RTL-first`

</div>

---

## العربية

### نظرة عامة

هذا المستودع ليس مجرد مكان لتخزين الكود: إنه **بيئة عمل مشتركة بين الإنسان والوكيل الذكي**.
كل قاعدة يحتاجها الوكيل مكتوبة في ملف يمكنه قراءته، وكل قاعدة قابلة للفحص الآلي عبر سكربت واحد.

**المرحلة الحالية: L0 — الأساس الحاكم.** لا يوجد كود تطبيق ولا حزمة تقنيات مختارة، والقرار
مؤجَّل عمداً (انظر [ADR-0002](docs/adr/0002-defer-stack-choice.md)).

### الملفات التي تهمّك

| الملف | لمن؟ | الوظيفة |
| --- | --- | --- |
| [`AGENTS.md`](AGENTS.md) | الوكلاء والبشر | الميثاق الملزم: القواعد، الحدود، تعريف الإنجاز |
| [`CONTEXT.md`](CONTEXT.md) | الوكلاء والبشر | المعمارية، الثوابت، المصطلحات، بروتوكول التغيير |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code | مؤشر مختصر إلى الميثاق |
| [`.claude/skills/`](.claude/skills) | الوكلاء | مهارات قابلة لإعادة الاستخدام (`repo-guard`, `doc-sync`, `security-review`) |
| [`.agent/capabilities.yaml`](.agent/capabilities.yaml) | الوكلاء | مصفوفة الصلاحيات: مسموح / يستأذن / ممنوع |
| [`.mcp.json`](.mcp.json) | الأدوات | تعريف خوادم MCP **بدون أي مفاتيح** |
| [`scripts/check-repo.sh`](scripts/check-repo.sh) | الجميع | الحارس الحتمي: الملفات المطلوبة، الأسرار، الروابط، المهارات، ثنائية اللغة |
| [`docs/adr/`](docs/adr/) | الجميع | سجلات القرارات المعمارية (غير قابلة للتعديل بعد القبول) |
| [`SECURITY.md`](SECURITY.md) | الجميع | الإبلاغ الخاص وسياسة أقل صلاحية للوكلاء |
| [`scripts/semantic/`](scripts/semantic) | الجميع | فهرسة متجهية واستعلام بالمعنى |
| [`docs/agents/provenance.md`](docs/agents/provenance.md) | الجميع | من كتب السطر: بشر أم وكيل |
| [`docs/ci/ephemeral-environments.md`](docs/ci/ephemeral-environments.md) | الجميع | العزل والبيئات المؤقتة |
| [`docs/data/artifacts.md`](docs/data/artifacts.md) | الجميع | LFS وسجل حالة البيانات |
| [`docs/ci/testing-strategy.md`](docs/ci/testing-strategy.md) | الجميع | اختبارات الخصائص والمحاكاة |
| [`docs/architecture/graph.md`](docs/architecture/graph.md) | الجميع | مخطط معماري مُولَّد |

### دورة العمل

```bash
git fetch --all --prune
git switch -c feat/my-change     # feat/ fix/ docs/ chore/
scripts/check-repo.sh            # يجب أن ينجح قبل أي دفع
git commit -m "feat(scope): …"   # Conventional Commits
git push -u origin HEAD
```

`main` لا يُكتب فيه مباشرة أبداً. الدمج قرار بشري، والوكيل يفتح طلب سحب فقط.

### ما الذي يجعل المستودع «توكيلياً»؟

| المعيار | التنفيذ هنا |
| --- | --- |
| توثيق ثنائي التوجيه | `README.md` للبشر، `AGENTS.md` / `CONTEXT.md` للوكلاء |
| صلاحيات أقل ما يمكن | [`.agent/capabilities.yaml`](.agent/capabilities.yaml) + [مصفوفة الصلاحيات](docs/agents/permissions.md) |
| مهارات وذاكرة مستمرة | `.claude/skills/` + [`.agent/memory/`](.agent/memory) + [بروتوكول الذاكرة](docs/agents/memory-protocol.md) |
| أدوات عبر MCP بأمان | [`.mcp.json`](.mcp.json) + [سياسة MCP](docs/agents/mcp-policy.md) |
| حماية من حقن الأوامر | [سياسة MCP §4](docs/agents/mcp-policy.md) |
| فحص أمني آلي | Trivy + Dependabot + فحص أسرار إلزامي في CI |
| بوابة جودة حتمية | `scripts/check-repo.sh` + `guard` workflow + `pr-hygiene` |

### القدرات الأربع الجديدة

| القدرة | كيف نُفِّذت هنا | الحالة |
| --- | --- | --- |
| **بحث دلالي متجهي** | `scripts/semantic/` — فهرسة `git ls-files`، تقطيع حسب العناوين، تضمينات hashing محلية (256 بُعداً)، استعلام بالمعنى بالعربية والإنجليزية | ✅ يعمل الآن، دون شبكة أو مفتاح |
| **بيئات معزولة مؤقتة** | `.devcontainer/` (مستخدم غير جذري، `--cap-drop=ALL`) + `preview.yml` يبني داخل عدّاء معزول | ⏸ ينتظر حزمة التقنيات (ADR-0002) |
| **أصل الكود (بشري/ذكائي)** | ترويسات `AI-Assisted-By` / `Human-Authored` + `provenance.yml` يرفض ما لا يُصرِّح | ✅ مفعّل — [السياسة](docs/agents/provenance.md) |
| **تبعيات عديمة الثقة** | `dependency-audit.mjs` (تثبيت، سكربتات تنصيب، قفل، صلاحيات CI) + Dependabot + بوابة تراخيص | ✅ للفحوصات المتاحة اليوم |

```bash
node scripts/semantic/cli.mjs index
node scripts/semantic/cli.mjs search "صلاحيات الوكيل الممنوعة" -k 3
node scripts/provenance.mjs --strict
node scripts/dependency-audit.mjs --strict
```

### القدرات الأربع التالية

| القدرة | كيف نُفِّذت هنا | الحالة |
| --- | --- | --- |
| **إدارة الأصول والبيانات** | `.gitattributes` بمسارات Git LFS + `artifacts.manifest.json` بسجلّ SHA-256، وفحص الحارس للبايتات الكبيرة | ✅ البنية جاهزة، السجل فارغ حتى توجد بيانات |
| **اختبار دلالي قائم على الخصائص** | `scripts/property-test.mjs` (مولّدات، تقليص، بذرة قابلة للتكرار) + `mock-server.mjs` بمُحاكاة حتمية لـ API | ✅ 19 خاصية تعمل، ووجدت خللاً حقيقياً في التقطيع |
| **حوسبة خضراء وتوجيه التكلفة** | `change-classifier.mjs` يصنّف الفرق ويقرّر أي وظائف CI تعمل؛ إلغاء التشغيلات المتجاوزة ومهلات زمنية | ✅ التوجيه مطبّق؛ لا أرقام كربون مخترعة |
| **توثيق حي ومخطط معماري** | `architecture-graph.mjs` يولّد Mermaid + JSON من الروابط والاستيرادات، و`--check` يفشل عند التقادم | ✅ مُولَّد ومُتحقَّق في الحارس وCI |

```bash
node scripts/property-test.mjs --runs 300
node scripts/mock-server.mjs --port 4010
node scripts/change-classifier.mjs --files "README.md"
node scripts/architecture-graph.mjs --check
node scripts/artifact-manifest.mjs --check
```

### حالة المزامنة

| العنصر | الحالة |
| --- | --- |
| الفرع الافتراضي | `main` |
| فرع العمل | `arena/63076a70-ui` (متتبَّع، متزامن) |
| الملفات غير المتتبَّعة | لا يوجد |

### الخطوات التالية

1. تثبيت **نظام التصميم** أولاً: الرموز (ألوان، مسافات، خطوط) واستراتيجية RTL — قرار D2.
2. اختيار حزمة التقنيات عبر ADR جديد يُلغي [ADR-0002](docs/adr/0002-defer-stack-choice.md).
3. تفعيل حماية الفرع `main` على GitHub: مراجعة إلزامية + منع الدفع المباشر.
4. اختيار **الترخيص** (D5) وإضافة ملف `LICENSE` — أداة الفحص تنبّه حالياً لغيابه.
5. إضافة `.env.example` عند أول حاجة لتهيئة بيئة.

---

## English

### Overview

This repository is not only version control — it is a **shared workspace for humans and AI agents**.
Every constraint an agent must respect is written in a file it can read, and enforced by a check
it can run.

**Current maturity: L0 — governance baseline.** No application code and no framework: the stack
choice is deliberately deferred (see [ADR-0002](docs/adr/0002-defer-stack-choice.md)).

### Where to look

| File | Audience | Purpose |
| --- | --- | --- |
| [`AGENTS.md`](AGENTS.md) | agents + humans | Normative charter: rules, boundaries, definition of done |
| [`CONTEXT.md`](CONTEXT.md) | agents + humans | Architecture, invariants, vocabulary, change protocol |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | humans + agents | Branch → verify → PR workflow |
| [`.claude/skills/`](.claude/skills) | agents | Reusable procedures (`repo-guard`, `doc-sync`, `security-review`) |
| [`.agent/capabilities.yaml`](.agent/capabilities.yaml) | agents | Declarative allow / ask / deny matrix |
| [`.mcp.json`](.mcp.json) | tooling | MCP servers declared **without credentials** |
| [`scripts/check-repo.sh`](scripts/check-repo.sh) | everyone | Deterministic guard: files, secrets, links, skills, bilingual content |
| [`docs/adr/`](docs/adr/) | everyone | Architecture decision records (immutable once accepted) |
| [`SECURITY.md`](SECURITY.md) | everyone | Private disclosure + agent least-privilege posture |
| [`scripts/semantic/`](scripts/semantic) | everyone | Vector index + meaning-based query CLI |
| [`docs/agents/provenance.md`](docs/agents/provenance.md) | everyone | Who wrote each commit: human or agent |
| [`docs/ci/ephemeral-environments.md`](docs/ci/ephemeral-environments.md) | everyone | Isolation model and per-PR sandboxes |
| [`docs/data/artifacts.md`](docs/data/artifacts.md) | everyone | LFS lanes and the artifact ledger |
| [`docs/ci/testing-strategy.md`](docs/ci/testing-strategy.md) | everyone | Properties and mocks |
| [`docs/architecture/graph.md`](docs/architecture/graph.md) | everyone | Generated architecture map |

### Workflow

```bash
git fetch --all --prune
git switch -c feat/my-change     # feat/ fix/ docs/ chore/
scripts/check-repo.sh            # must pass before you push
git commit -m "feat(scope): …"   # Conventional Commits
git push -u origin HEAD
```

`main` is never written directly. Merging is a human decision; agents open pull requests only.

### What makes this repository agentic-first

| Dimension | Implementation |
| --- | --- |
| Dual-audience docs | `README.md` for humans, `AGENTS.md` / `CONTEXT.md` for agents |
| Least privilege | [`.agent/capabilities.yaml`](.agent/capabilities.yaml) + [permission matrix](docs/agents/permissions.md) |
| Skills & durable memory | `.claude/skills/` + [`.agent/memory/`](.agent/memory) + [memory protocol](docs/agents/memory-protocol.md) |
| Safe tool access (MCP) | [`.mcp.json`](.mcp.json) + [MCP policy](docs/agents/mcp-policy.md) |
| Prompt-injection defence | [MCP policy §4](docs/agents/mcp-policy.md) |
| Automated security | Trivy, Dependabot, blocking secret scan in CI |
| Deterministic quality gate | `scripts/check-repo.sh`, `guard` and `pr-hygiene` workflows |

### The four 2026 capabilities

| Capability | Implementation | State |
| --- | --- | --- |
| **Native vector search** | `scripts/semantic/` — `git ls-files` sources, heading-aware chunking, local 256-dim hashing embeddings, bilingual query CLI | ✅ live, offline, no key |
| **Ephemeral sandboxes** | `.devcontainer/` (non-root, `--cap-drop=ALL`) + `preview.yml` building in a disposable runner | ⏸ waits for the stack (ADR-0002) |
| **Code provenance** | `AI-Assisted-By` / `Human-Authored` trailers, enforced by `provenance.yml` | ✅ active — [policy](docs/agents/provenance.md) |
| **Zero-trust dependencies** | `dependency-audit.mjs` (pinning, install hooks, lockfile, workflow refs) + Dependabot + licence gate | ✅ what is checkable today |

```bash
node scripts/semantic/cli.mjs index
node scripts/semantic/cli.mjs search "which agent capabilities are denied" -k 3
node scripts/provenance.mjs --strict
node scripts/dependency-audit.mjs --strict
```

### The next four capabilities

| Capability | Implementation | State |
| --- | --- | --- |
| **Data & artifact management** | `.gitattributes` LFS patterns + `artifacts.manifest.json` (SHA-256 ledger) + guard's oversized-blob rule | ✅ plumbing live, ledger empty until data exists |
| **Property-based testing & mocks** | `scripts/property-test.mjs` (generators, shrinking, replayable seed) + deterministic `mock-server.mjs` with fault injection | ✅ 19 properties green — and it caught a real chunker bug |
| **Green computing & cost routing** | `change-classifier.mjs` decides which CI jobs run; concurrency cancellation; job timeouts | ✅ routing live; no invented carbon numbers |
| **Living documentation** | `architecture-graph.mjs` derives a Mermaid map + JSON from links and imports; `--check` fails on drift | ✅ generated, gated in guard and CI |

```bash
node scripts/property-test.mjs --runs 300
node scripts/mock-server.mjs --port 4010
node scripts/change-classifier.mjs --files "README.md"
node scripts/architecture-graph.mjs --check
node scripts/artifact-manifest.mjs --check
```

### Honest limits

- The guard proves **conventions**, not correctness — review still matters.
- "Self-healing" automation is **not** enabled: an agent may propose a patch in a PR, but nothing
  auto-merges. Auto-merge is an explicit open decision (`AGENTS.md` §9, D4).
- Provenance trailers are **declarative, not cryptographic** — review is the real control (ADR-0003).
- The semantic index uses hashing embeddings, not a neural model: precise on this repository's own
  vocabulary, approximate elsewhere. Swapping in a real model touches one file (`lib.mjs`).
- Property tests prove invariants, not intent; a wrong invariant is confidently wrong. No coverage
  metric is claimed — there is nothing to cover until a runtime exists.
- "Green" here means **runner-minutes avoided**, measured. Carbon accounting would be fabrication
  without telemetry.
- The architecture graph is static-reference only; runtime topology is out of scope.
- No model calls are made by CI. Everything in `.github/workflows/` is deterministic and auditable.

### Next steps

1. Specify the **design system** first: tokens (colour, space, type) and the RTL strategy — D2.
2. Choose the stack through a new ADR superseding [ADR-0002](docs/adr/0002-defer-stack-choice.md).
3. Enable `main` branch protection on GitHub: required review, no direct pushes.
4. Choose the **licence** (D5) and add a `LICENSE` file — the audit currently warns about the gap.
5. Add `.env.example` at the first need for environment configuration.

---

<div align="center">

**Built to be maintained — بُني ليُصان**

</div>
