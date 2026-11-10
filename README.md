<div align="center">

# ui

**مستودع واجهات المستخدم — نقطة الانطلاق الاحترافية**
*The user-interface repository — a professional starting point*

`main` · `TypeScript-ready` · `Conventional Commits` · `2026 baseline`

</div>

---

## العربية

### نظرة عامة

هذا المستودع هو **الأساس (Baseline)** لمشروع واجهات المستخدم الخاص بـ `sayedelazameydesign-crypto`.
حالياً لا يحتوي إلا على هذا الملف، وقد تم تجهيزه ليكون نقطة بداية نظيفة ومتزامنة بالكامل مع GitHub
حتى تُبنى عليه بقية الطبقات (التصميم، المكوّنات، الصفحات) بدون أي فوضى تقنية.

### حالة المزامنة

| العنصر | الحالة |
| --- | --- |
| الفرع الافتراضي | `main` |
| فرع العمل الحالي | `arena/c632a1ad-ui` |
| تتبّع الفرع البعيد | مُفعّل (`upstream`) |
| فرق الالتزامات بين `main` و `origin/main` | متطابق (0 / 0) |
| ملفات غير مُتتبَّعة أو غير محفوظة | لا يوجد |

### نموذج العمل (Branching)

1. كل عمل جديد يبدأ من `main` في فرع مستقل وواضح التسمية:
   `feat/<اسم-الميزة>` ، `fix/<اسم-الإصلاح>` ، `chore/<المهمة>`.
2. الرسائل تتبع **Conventional Commits**:
   `feat: إضافة الصفحة الرئيسية` — `fix: تصحيح اتجاه RTL` — `docs: تحديث دليل التشغيل`.
3. لا يُدمج شيء في `main` إلا عبر **Pull Request** مع مراجعة واحدة على الأقل.
4. قبل كل دفع: `git fetch --prune` ثم إعادة الأساس (rebase) على `main` لتجنّب الالتزامات المتشعّبة.

### أوامر سريعة

```bash
git fetch --all --prune          # مزامنة المراجع البعيدة
git switch main && git pull      # تحديث الفرع الافتراضي
git switch -c feat/my-feature    # بدء عمل جديد
git push -u origin HEAD          # رفع الفرع مع تفعيل التتبّع
```

### الخطوات التالية المقترحة

- اختيار حزمة التقنيات (Next.js + TypeScript + Tailwind CSS) وتثبيتها.
- إضافة `.gitignore` و `.editorconfig` وقواعد التنسيق (ESLint / Prettier).
- تفعيل CI على GitHub Actions: فحص الأنواع، التنسيق، والبناء.
- إضافة نظام تصميم أولي: الألوان، المسافات، الخطوط، ودعم كامل لـ **RTL**.

---

## English

### Overview

This repository is the **baseline** for the user-interface project owned by
`sayedelazameydesign-crypto`. It currently contains only this document, and it has been
prepared as a clean, fully synchronized starting point on GitHub so the remaining layers
(design system, components, pages) can be built on top of it without technical debt.

### Sync status

| Item | State |
| --- | --- |
| Default branch | `main` |
| Active working branch | `arena/c632a1ad-ui` |
| Remote tracking | Enabled (`upstream`) |
| Commit drift between `main` and `origin/main` | Identical (0 / 0) |
| Untracked / unsaved files | None |

### Branching model

1. Start every piece of work from `main` on a clearly named branch:
   `feat/<feature>` , `fix/<bug>` , `chore/<task>`.
2. Commit messages follow **Conventional Commits**:
   `feat: add landing page` — `fix: correct RTL direction` — `docs: update setup guide`.
3. Nothing lands on `main` without a **Pull Request** and at least one review.
4. Before pushing: `git fetch --prune`, then rebase onto `main` to keep history linear.

### Quick commands

```bash
git fetch --all --prune          # refresh remote refs
git switch main && git pull      # update the default branch
git switch -c feat/my-feature    # start new work
git push -u origin HEAD          # push and enable tracking
```

### Suggested next steps

- Pick and install the stack (Next.js + TypeScript + Tailwind CSS).
- Add `.gitignore`, `.editorconfig`, and formatting rules (ESLint / Prettier).
- Enable GitHub Actions CI: type-check, lint, and build.
- Introduce a first design system layer: colors, spacing, typography, and full **RTL** support.

---

<div align="center">

**Built to be maintained — بُني ليُصان**

</div>
