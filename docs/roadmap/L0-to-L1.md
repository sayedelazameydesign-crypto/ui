# خارطة الطريق L0 → L1 — من الحوكمة إلى التنفيذ
# Roadmap L0 → L1 — From Governance to Foundation

> **الحالة:** مقترح للمراجعة — يتطلب موافقة بشرية قبل التنفيذ  
> **الفرع:** `arena/107be0f6-ui` → سيُقسّم إلى PRs صغيرة قابلة للمراجعة  
> **المبدأ:** لا scaffolding قبل الرموز — Tokens أولاً، ثم ADR للحزمة، ثم الكود

---

## 0. أين نحن الآن (L0 — مكتمل)

| البُعد | الحالة | الدليل |
|---|---|---|
| الحوكمة | ✅ مكتملة | `AGENTS.md` (25 قاعدة)، `CONTEXT.md`، 23 ADR |
| الحراسة | ✅ حتمية | `scripts/check-repo.sh` + 4 workflows + `mutation-test 10/10` |
| البحث المقاس | ✅ هجين | R@1 0.64 / R@3 0.74 / p50 0.65ms — `eval.mjs` + `bench.mjs` |
| سيادة البيانات + PII | ✅ | 8 وجهات + 10 قواعد نمطية — `check-egress` / `check-pii` |
| التوثيق الحي | ✅ | `architecture-graph.mjs` → `graph.md/json` + `playground/graph.html` |
| المعاينة | ✅ | `/playground/` + `/showcase/` — نفس `core.mjs` |

**القرارات المفتوحة (AGENTS.md §9):** D1 الحزمة، D2 نظام التصميم، D3 الاستضافة، D4 استقلالية الوكيل، D6 بيئات المعاينة — كلها **مفتوحة عمداً** (ADR-0002).

---

## 1. الهدف — ما معنى L1؟

L1 = أول كود تطبيق قابل للتشغيل، مع:
- نظام تصميم مُثبّت (tokens + RTL + a11y floor)
- حزمة تقنيات مُختارة عبر ADR جديد يلغي 0002
- حماية فرع `main` مفعّلة
- أول سطحين (Surfaces) يعملان بثنائية اللغة

**تعريف الإنجاز (Definition of Done):**
- [ ] `tokens.json` مُثبّت + `AGENTS.md`/`CONTEXT.md` محدثة
- [ ] ADR جديد (ex: `0024-choose-stack.md`) مقبول
- [ ] `main` محمي: review إلزامي + no direct push + status checks مطلوبة
- [ ] صفحتان تعملان: `/` (عربي RTL افتراضي) و `/en` — نفس المحتوى، نفس المكونات
- [ ] `scripts/check-repo.sh` يظل أخضر — لا يكسِر L0+

---

## 2. المبادئ التي لا تُكسر

1. **الرموز قبل المكونات** — لا `Button` قبل `color/spacing/type`
2. **ADR قبل الكود** — كل قرار مكلف يُسجل مع بدائله وكلفة التراجع
3. **PR واحد = طبقة واحدة** — لا PR يخلط تصميم + حزمة + صفحات
4. **الوكيل يقترح، الإنسان يقرر** — لا auto-merge (D4 يبقى open)
5. **كل وعد له أمر قياس** — لا "أسرع" بلا `bench.mjs`، لا "أفضل" بلا `eval.mjs`

---

## 3. الخطة — 4 مراحل، 6 أسابيع مقترحة

### المرحلة 1: نظام التصميم — D2 (الأسبوعان 1-2)

**الهدف:** رموز هي المصدر الوحيد للحقيقة

| رقم | مهمة | المخرج | مقاس بـ | ADR/Docs |
|---|---|---|---|---|
| 1.1 | تدقيق المحتوى: أي صفحات سيحتاجها المعرض؟ (portfolio, about, contact) | `docs/design/content-audit.md` | قائمة | — |
| 1.2 | لوحة ألوان + مقياس مسافات + سلم خطوط — قيم خام | `tokens.json` (Style Dictionary format) | `validate-json.mjs` | ADR-0024 |
| 1.3 | خطوط: IBM Plex Arabic + Instrument Sans + Mono — أحجام/أوزان/ارتفاعات | `tokens/typography.json` | — | — |
| 1.4 | استراتيجية RTL: CSS Logical Properties (`margin-inline`, `padding-block`) — لا `left/right` | `docs/design/rtl-strategy.md` | `adversarial-scan` يرفض `left:` الصريح | — |
| 1.5 | حدّ الوصول: تباين AA، تركيز مرئي، `prefers-reduced-motion` | `docs/design/a11y-floor.md` | Lighthouse a11y ≥ 95 | — |
| 1.6 | معاينة رموز: صفحة `/tokens` تعرض كل token حيًا | `/tokens` route (static) | — | — |

**قبول المرحلة:** مصمم يوافق على الرموز كمصدر وحيد — المطور لا يستطيع "اختراع" لون.

---

### المرحلة 2: اختيار الحزمة — D1 (الأسبوع 3)

**الهدف:** ADR واحد يحسم الجدل بلا scaffolding سابق لأوانه

| الخيار | متى يناسب | كلفة التراجع |
|---|---|---|
| **Next.js 15 + Tailwind v4 + RSC** | تريد SSR/SSG + معرض ديناميكي + API routes | متوسطة — هجرة صفحات |
| **Astro 4 + Tailwind** | محتوى ثابت كثير، تفاعل قليل — أسرع | منخفضة |
| **Vite + React + TanStack** | تطبيق تفاعلي بحت (SPA) | عالية إذا احتجت SEO |

**المعايير (موزونة):**
- ثنائية اللغة RTL أولاً (30%)
- SEO + أداء (25%)
- تجربة وكيل (guard يظل يعمل) (20%)
- منحنى التعلم للفريق (15%)
- استضافة Vercel جاهزة (10%)

**المخرج:** `docs/adr/0024-choose-stack.md` + تحديث `CONTEXT.md §2` + `AGENTS.md §9 D1=D2=decided`

**قاعدة:** لا `npm create` قبل قبول ADR — التاريخ يبقى قابلاً للمراجعة.

---

### المرحلة 3: التأسيس التقني + الحماية (الأسبوع 4)

| رقم | مهمة | الأمر |
|---|---|---|
| 3.1 | حماية `main` على GitHub: require PR + 1 review + status checks (`guard`, `provenance`, `security`) | Settings → Branches |
| 3.2 | تهيئة الحزمة المختارة — `package.json` + `tsconfig` + `eslint --max-warnings 0` + `prettier` | `npm init` في PR مخصص |
| 3.3 | ربط Guard بـ CI الجديدة: `scripts/check-repo.sh` يظل يمر حتى مع وجود `node_modules` | تعديل `guard.yml` |
| 3.4 | `.env.example` أول حاجة لمتغير بيئة (ex: `NEXT_PUBLIC_SITE_URL`) | — |
| 3.5 | Vercel project ربط: `vercel.json` الحالي يحتاج تعديل `outputDirectory` حسب الحزمة | `vercel --prod` |

**قبول:** `main` مرفوض الدفع المباشر — PR تجريبي يفشل بلا review.

---

### المرحلة 4: أول الأسطح — L3/L4 (الأسبوعان 5-6)

| السطح | المحتوى | المكونات |
|---|---|---|
| `/` (عربي RTL) | Hero + معرض مختار + CTA | `Header`, `Hero`, `Card`, `Footer` |
| `/en` (إنجليزي LTR) | نفس المحتوى — `dir` من المحتوى لا الصفحة | نفسها — `lang/dir` ديناميكي |
| `/tokens` | عرض حي للرموز | `TokenTable` |

**كل سطح يجب أن يحقق:**
- ثنائي اللغة: `lang` + `dir` صحيح، لا نص مُصعّب
- وصول: لوحة مفاتيح + قارئ شاشة + تباين AA
- أداء: Lighthouse ≥ 90 (perf/a11y/best-practices/SEO)
- اختبار خصائص: `property-test.mjs` يغطي `tokens → CSS variables` بلا انحراف

---

## 4. مصفوفة المخاطر → التخفيف

| الخطر | التأثير | التخفيف |
|---|---|---|
| اختيار حزمة خاطئة | إعادة كتابة | ADR مع بدائل + POC صغير قبل الالتزام |
| RTL مُرقع لاحقًا | ديون كبيرة | 1.4 Logical Props تُفحص آليًا — فشل عند `margin-left` |
| حارس ينكسر مع `node_modules` | فقدان الثقة | 3.3 يضيف `node_modules` إلى allowlist الفحص — اختبار قبل الدمج |
| تراكم PR كبير غير قابل للمراجعة | مراجعة سيئة | كل مرحلة = 2-3 PRs ≤400 سطر — `AGENTS.md §10` |

---

## 5. التتبع — كيف نعرف أننا نتقدم؟

| المؤشر | الأداة | الهدف |
|---|---|---|
| جودة البحث | `eval.mjs` | R@3 ≥0.72 (لا تنخفض مع إضافة صفحات) |
| سرعة البحث | `bench.mjs` | p50 <1ms حتى 1000 مقطع |
| الحراس | `mutation-test.mjs` | 10/10 تظل مقتولة |
| الوصول | Lighthouse CI | a11y ≥95 |
| الحماية | GitHub API | `main` محمي — `gh api repos/.../branches/main/protection` |

---

## 6. التقسيم إلى PRs (مقترح 8 PRs)

1. `docs(design): content-audit + a11y-floor` — لا كود
2. `feat(tokens): tokens.json + tokens/typography.json + validate` — الرموز فقط
3. `docs(design): rtl-strategy + tokens preview page (/tokens)` — توثيق + صفحة ثابتة
4. `docs(adr): 0024-choose-stack` — القرار وحده
5. `chore(repo): branch protection + CI guard update` — إعدادات
6. `feat(stack): scaffold حزمة مختارة + lint/type gates` — scaffolding بعد ADR
7. `feat(components): Header/Hero/Card/Footer` — مكونات معزولة + قصص
8. `feat(surfaces): / + /en + /tokens` — الأسطح الأولى

كل PR: فرع `feat/...` → `scripts/check-repo.sh` أخضر → PR body: ماذا/لماذا/كيف تم التحقق.

---

## 7. ما بعد L1 — نظرة سريعة

| المرحلة | الهدف | القرار المرتبط |
|---|---|---|
| L2 | مكتبة مكونات + قصص + اختبارات بصرية | — |
| L3 | نظام محتوى (CMS/ملفات) + `artifacts.manifest` | D7 |
| L4 | تسليم: معاينة per-PR + مراقبة + تحليلات | D3, D6 |

---

## 8. القرار المطلوب منك الآن

اختر واحدًا لنبدأ:

- **A) ابدأ 1.1 تدقيق المحتوى** — أسألك 5 أسئلة عن صفحات المعرض وأكتب `content-audit.md`
- **B) ابدأ 1.2 الرموز** — أبني `tokens.json` أولي من `/showcase` الحالي (ألوان #0B0F14, accent #3EE8A8...) وأفتح PR
- **C) ابدأ الحماية فورًا** — أجهز أوامر `gh api` لتفعيل حماية `main` (تحتاج تأكيدك)
- **D) اعرض هذه الخطة في Notion/Linear** — أنشئ مشروعًا متتبعًا مع مهام قابلة للتحقق

> **ملاحظة توكيلية:** هذه الخطة نفسها ستُحوّل إلى `.agent/memory/` + Linear بعد موافقتك — لتكون قابلة للتنفيذ من أي وكيل لاحق.

---
*بُني ليُصان — ولكل مرحلة أمر يُعيد قياسها*
