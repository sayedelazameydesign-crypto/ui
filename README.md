<div align="center">

# ui

**مستودع واجهات المستخدم — أساس توكيلي (Agentic-First) جاهز لعام 2026**
*The user-interface repository — an agentic-first, machine-readable baseline*

[![guard](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/guard.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/guard.yml)
[![security](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/security.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/security.yml)

`main` · `L0 baseline` · `AGENTS.md` · `MCP-ready` · `RTL-first` · `least privilege`

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

### حالة المزامنة

| العنصر | الحالة |
| --- | --- |
| الفرع الافتراضي | `main` |
| فرع العمل | `arena/c632a1ad-ui` (متتبَّع، متزامن) |
| الملفات غير المتتبَّعة | لا يوجد |

### الخطوات التالية

1. تثبيت **نظام التصميم** أولاً: الرموز (ألوان، مسافات، خطوط) واستراتيجية RTL — قرار D2.
2. اختيار حزمة التقنيات عبر ADR جديد يُلغي [ADR-0002](docs/adr/0002-defer-stack-choice.md).
3. تفعيل حماية الفرع `main` على GitHub: مراجعة إلزامية + منع الدفع المباشر.
4. إضافة `.env.example` عند أول حاجة لتهيئة بيئة.

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

### Honest limits

- The guard proves **conventions**, not correctness — review still matters.
- "Self-healing" automation is **not** enabled: an agent may propose a patch in a PR, but nothing
  auto-merges. Auto-merge is an explicit open decision (`AGENTS.md` §9, D4).
- No model calls are made by CI. Everything in `.github/workflows/` is deterministic and auditable.

### Next steps

1. Specify the **design system** first: tokens (colour, space, type) and the RTL strategy — D2.
2. Choose the stack through a new ADR superseding [ADR-0002](docs/adr/0002-defer-stack-choice.md).
3. Enable `main` branch protection on GitHub: required review, no direct pushes.
4. Add `.env.example` at the first need for environment configuration.

---

<div align="center">

**Built to be maintained — بُني ليُصان**

</div>
