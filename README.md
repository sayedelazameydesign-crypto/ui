<div align="center">

# ui

**مستودع واجهات المستخدم — أساس توكيلي (Agentic-First) جاهز لعام 2026**
*The user-interface repository — an agentic-first, machine-readable baseline*

[![guard](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/guard.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/guard.yml)
[![security](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/security.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/security.yml)
[![provenance](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/provenance.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/provenance.yml)
[![dependency-audit](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/dependency-audit.yml/badge.svg)](https://github.com/sayedelazameydesign-crypto/ui/actions/workflows/dependency-audit.yml)

`main` · `L0 baseline` · `AGENTS.md` · `hybrid search` · `measured quality` · `fail-closed` · `PII guard` · `pinned models` · `zero-install demo` · `rollback + audit` · `RTL-first`

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

### طبقة الجودة والحدود

| القدرة | كيف نُفِّذت هنا | الحالة |
| --- | --- | --- |
| **بحث هجين مُقاس** | متجه + BM25 بدمج RRF، وتوسيع استعلام عربي من معجم محلي (87 مدخلاً)؛ **58 استعلاماً ذهبياً** (43 إنجليزي · 15 عربي) وفاصل ثقة مُبلَّغ عنه | ✅ R@1 **0.638** · R@3 **0.741** · MRR **0.687** — فاصل 95% لـ R@1: 0.52–0.76 |
| **بوابة جودة** | `semantic/eval.mjs` يفشل تحت R@3 0.90 أو MRR 0.75 — سقف يزيد ولا ينقص | ✅ مفعّلة في الحارس و CI |
| **تحقق صارم (fail-closed)** | مخطّطات JSON لمفاتيح `.mcp.json` والسجلات؛ أي مفتاح غير معروف خطأ لا تحذير | ✅ مع اختبارات سلبية |
| **سيادة البيانات** | قائمة وجهات مسموحة بـ«سبب» و«ملف مسموح»؛ أي URL جديد يفشل البناء | ✅ 8 وجهات معلنة، 0 مخالفة |
| **حارس الخصوصية (PII/DLP)** | فحص المحتوى المرحّل قبل الالتزام: بريد، هاتف مصري، رقم قومي، بطاقات (Luhn)، مفاتيح وسرّ؛ النتائج مُقنَّعة دائماً | ✅ 10 قواعد، 0 نتيجة، إعفاء لا بد له من سبب |
| **نتيجة سلبية موثّقة** | معيد ترتيب معجمي جُرِّب في 4 تهيئات ثم أُعيد قياسه على 58 استعلاماً: R@1 0.500 مقابل 0.638 — لذا هو مُعطَّل افتراضياً | ✅ R@1 = 0.638 (الهدف 0.85، D8 — يحتاج المسار العصبي) |
| **تحميل نموذج اختياري ومُوثَّق** | وزن مُكمَّم ≤ 100MB في `.models/` (خارج Git)، لا يُستخدم إلا ببصمة SHA-256 مثبَّتة بشرياً؛ الشبكة تحتاج `--allow-network` صريحاً | ✅ السياسة والمُحمِّل مُنفَّذان ومُختبَران؛ الوزن نفسه غير مُنزَّل |

```bash
node scripts/semantic/eval.mjs --timing     # R@1/R@3/MRR + كلفة كل 1000 استعلام
node scripts/validate-json.mjs              # تحقق صارم
node scripts/check-egress.mjs --list        # الوجهات المعلنة وأسبابها
```

### المشكلة، بصيغة دقيقة

لدينا مستودع معرفة لا يستطيع أي إنسان قراءته كاملاً. السؤال ليس «هل نضيف بحثاً؟» بل: **كم نتيجة
صحيحة نضعها في أعلى القائمة، وبأي كلفة، وبأي حدود للخصوصية؟**

- **الاسترجاع:** دالة ترتيب واحدة لا تكفي. `score(d) = Σ_r w_r / (60 + rank_r(d))` تدمج ترتيب
  المتجهات وترتيب BM25، و`BM25(tf, dl) = idf · tf(k₁+1) / (tf + k₁(1−b+b·dl/avgdl))` بـ k₁=1.2، b=0.75.
- **الجودة:** تُقاس على **58 استعلاماً ذهبياً**، ومع كل تشغيل يُطبع فاصل ثقة bootstrap (عينة واحدة = 1.7 نقطة)، وبوابة تفشل تحت R@1 0.60 / R@3 0.72 / MRR 0.66.
- **الكلفة:** تُقاس بـ `bench.mjs` على نفس الفهرس ونفس الاستعلامات — لا أرقام تسويقية.

| الحقيقة الآن | الرقم |
| --- | --- |
| R@1 (هجين) | **0.638** على 58 استعلاماً — و**0.778** على الـ18 الأصلية بنفس المحرك |
| R@3 (هجين) | **0.741** مقابل 0.552 للمتجه وحده |
| زمن الاستجابة p50 | **0.65 ms** لكل استعلام (1 471 استعلاماً/ثانية) |
| الحجم | 611 مقطعاً · 108 ملفاً · فهرس 1.6MB · +8MB ذاكرة |

**جرّبه الآن بلا تثبيت:** صفحة واحدة، بلا حزم ولا بناء ولا شبكة.

### الاستعادة والتدقيق

| القدرة | الملف | الحالة |
| --- | --- | --- |
| **نسخ حالة مشفّرة والتراجع الحتمي** | `snapshot.mjs` — SHA-256 لكل ملف + بصمة شجرة Git | ✅ الاستعادة ترفض نسخة معدّلة، وترفض شجرة مختلفة بلا `--force` |
| **دفتر تدقيق غير قابل للتعديل بصمت** | `ledger.mjs` — سلسلة `hash = sha256(prev + entry)` + مرساة | ✅ 6 خصائص: تعديل/حذف/بتر ينكشف |
| **اختبار الطفرات للحرّاس** | `mutation-test.mjs` — 4 طفرات، خط أساس قبل كل طفرة | ✅ 4/4 مقتولة |
| **خريطة معمارية تفاعلية** | `playground/graph.html` من `graph.json` | ✅ تُبنى من الكود، والحارس يفشل إذا انحرفت |

| **ضغط السياق بالاستخلاص** | `context-pack.mjs` — جمل مستخرجة حرفياً بمراجع `file:line` وفجوات معلّمة | ✅ 400 توكن: 81% من الإجابات باقية · أصغر 29× من إرسال المرشحات (58 استعلاماً) |

```bash
node scripts/snapshot.mjs save --label "قبل التجربة"
node scripts/ledger.mjs verify
node scripts/mutation-test.mjs
node scripts/context-pack.mjs "من يحق له دمج طلب سحب" --budget 800
```



```bash
node scripts/playground-server.mjs        # ثم افتح /playground/
```

المتصفح يستدعي **نفس** `scripts/semantic/core.mjs` الذي يستدعيه الـCLI، و`playground-parity.mjs`
يفشل إن اختلف الاثنان (الحالي: R@3 0.74 مقابل 0.74 على 58 استعلاماً).

### حالة المزامنة

| العنصر | الحالة |
| --- | --- |
| الفرع الافتراضي | `main` |
| فرع العمل | `arena/df16e95f-ui` (متتبَّع، متزامن) |
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

### Quality & boundaries layer

| Capability | Implementation | State |
| --- | --- | --- |
| **Measured hybrid retrieval** | vector + BM25 fused by RRF, Arabic query expansion from an 87-entry glossary, **58-case** bilingual gold set with a reported interval | ✅ R@1 **0.638** · R@3 **0.741** · MRR **0.687** — 95% CI for R@1: 0.52–0.76 |
| **Quality gate** | `semantic/eval.mjs` fails below R@3 0.90 / MRR 0.75 — a floor that only ratchets up | ✅ in guard and CI |
| **Fail-closed validation** | explicit JSON schemas for `.mcp.json` and the ledgers; unknown keys are errors | ✅ negative-tested |
| **Data sovereignty** | egress allowlist where each host needs a reason and a permitted file scope | ✅ 8 declared hosts, 0 violations |
| **Privacy guard (PII/DLP)** | staged-diff scan before commit: email, EG phone, national ID, Luhn-checked cards, keys; findings are always masked | ✅ 10 rules, 0 findings, reasoned exemptions only |
| **A documented negative result** | a lexical reranker was measured in 4 configurations, then re-measured on 58 cases: R@1 0.500 against 0.638 — so it ships off | ✅ R@1 0.638 (goal 0.85, D8 — needs the neural path) |
| **Opt-in, pinned model load** | quantized weights ≤ 100 MiB in `.models/` (outside Git), usable only with a human-pinned SHA-256; a fetch needs explicit `--allow-network` | ✅ policy and loader enforced and property-tested; no artifact installed |

```bash
node scripts/semantic/eval.mjs --timing     # R@1/R@3/MRR + cost per 1k queries
node scripts/validate-json.mjs              # fail-closed validation
node scripts/check-egress.mjs --list        # declared destinations and why
```

### The problem, stated precisely

This repository holds more knowledge than any one person can read. The question is not "should there
be search?" but: **how many correct answers reach the top, at what cost, and inside which privacy
boundary?**

- **Ranking:** one signal is not enough. `score(d) = Σ_r w_r / (60 + rank_r(d))` fuses the vector and
  BM25 rankings, with `BM25(tf, dl) = idf · tf(k₁+1) / (tf + k₁(1−b+b·dl/avgdl))`, k₁=1.2, b=0.75.
- **Quality:** measured on a **58-case** gold set; every run prints a bootstrap interval (one case = 1.7 points) behind a gate (R@1 ≥ 0.60, R@3 ≥ 0.72, MRR ≥ 0.66).
- **Cost:** measured by `bench.mjs` on the same index and queries — no marketing figures.

| Fact, now | Number |
| --- | --- |
| R@1 (hybrid) | **0.638** over 58 cases — and **0.778** over the original 18 on the same engine |
| R@3 (hybrid) | **0.741** vs 0.552 vector-only |
| p50 latency | **0.65 ms** per query (1,471 queries/s) |
| Footprint | 611 chunks · 108 files · 1.6 MB index · +8 MB heap |

The benchmark also found and fixed a real hotspot: BM25 was scanning every chunk for every term, so
postings cut the hybrid path from 2.12 ms to 0.38 ms with **identical** ranking
([benchmarks](docs/benchmarks.md)).

**Try it with zero install:** one static page, no bundler, no CDN, no network.

### Recovery and audit

| Capability | File | State |
| --- | --- | --- |
| **Hash-recorded snapshots, deterministic rollback** | `snapshot.mjs` — SHA-256 per file + the Git tree hash | ✅ restore refuses an altered copy and a different tree without `--force` |
| **Tamper-evident audit ledger** | `ledger.mjs` — `hash = sha256(prev + entry)` chain, anchored | ✅ 6 properties: edits, removals and truncation are detectable |
| **Mutation testing for the guards** | `mutation-test.mjs` — 4 mutants, baseline measured first | ✅ 4/4 killed |
| **Interactive architecture graph** | `playground/graph.html` from `graph.json` | ✅ generated from the code; the guard fails on drift |

| **Extractive context packing** | `context-pack.mjs` — verbatim sentences, `file:line` citations, marked gaps | ✅ at 400 tokens: 81% answer retention, 29× smaller than the candidates (58 cases) |

```bash
node scripts/snapshot.mjs save --label "before the experiment"
node scripts/ledger.mjs verify
node scripts/mutation-test.mjs
node scripts/context-pack.mjs "who may merge a pull request" --budget 800
```



```bash
node scripts/playground-server.mjs        # then open /playground/
```

The browser imports the **same** `scripts/semantic/core.mjs` the CLI uses, and
`scripts/playground-parity.mjs` fails if they disagree (currently 0.94 vs 0.94).

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
- Retrieval is **measured and humbler than it first looked**: 58 gold cases, top-1 at 0.638 with a
  95% interval of ±0.12, and four documented failure *classes*. The original 18 cases score 0.778 on
  the same engine — that gap is author bias, measured instead of assumed. A neural reranker is the
  next real gain (D8), not more tuning.
- The egress allowlist is **textual**: a URL assembled at runtime would evade it. A proxy is the
  runtime control (D9).
- The PII guard is **pattern-based**: it catches an address or a phone number, not a person's name in
  prose, and it does not classify data or set a retention policy.
- Snapshots cover **derived state only**, and capture is not atomic across files. Automatic rollback
  does not exist by design: a failing test never deletes your work.
- The audit ledger is **per-machine** and local; the anchor is what makes truncation detectable, and it
  is only as current as the last commit that carried it.
- Context packing is **lossy by design**: at 400 tokens roughly one gold case in five loses its answering
  file; the token count is a `chars / 4` estimate, not a tokenizer.
- Mutation testing has **5 mutants**, not exhaustive coverage: it proves the key guards are load-bearing,
  not that every branch is.
- The playground is a **demo**, not a product: no ranking feedback loop, no query log, no
  multi-user concurrency, and it loads the whole index into memory (fine at 445 chunks, not at 50k).
- Neural reranking is **plumbed but not running**: the manifest is unpinned (nobody verified an
  artifact here) and `onnxruntime-node` is not installed. `R@1` stays 0.638 until both exist.
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
